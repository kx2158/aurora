using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using librsync.net;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NLog;

namespace VRCX
{
    /// <summary>
    /// VRCA Bridge - converts .vrca (compiled VRChat avatar bundles) back into
    /// uploadable avatars by: extracting with AssetRipper, scaffolding a Unity project
    /// with VRChat SDK, building via Unity batchmode, and uploading through VRChat API.
    /// </summary>
    public class VrcaBridge
    {
        private static readonly Logger Logger = LogManager.GetCurrentClassLogger();

        private const string VrchatApiBase = "https://api.vrchat.cloud/api/1";
        private const string UnityVersion = "2022.3.22f1";
        private const string VrcSdkVersion = "3.7.4";

        // Shader remapping for Quest builds (PC -> mobile-compatible)
        private static readonly Dictionary<string, string> QuestShaderMap = new()
        {
            { "Standard", "VRChat/Mobile/Standard Lite" },
            { ".poyi/Poiyomi Toon", "VRChat/Mobile/Standard Lite" },
            { "poiyomi/Poiyomi Toon", "VRChat/Mobile/Standard Lite" },
            { "_liltoon/lilToon", "VRChat/Mobile/Standard Lite" },
            { "lilToon", "VRChat/Mobile/Standard Lite" },
            { "Unlit/Texture", "VRChat/Mobile/Diffuse" },
            { "Unlit/Color", "VRChat/Mobile/Diffuse" }
        };

        public VrcaBridge() { }

        /// <summary>
        /// Auto-detect Unity Editor and AssetRipper installations on the system.
        /// Returns JSON: { "unityPath": "...", "assetRipperPath": "..." }
        /// Either value may be null/empty if not found.
        /// </summary>
        public string FindTools()
        {
            try
            {
                var unityPath = AutoFindUnity();
                var ripperPath = AutoFindAssetRipper();

                var result = new JObject
                {
                    ["unityPath"] = unityPath ?? "",
                    ["assetRipperPath"] = ripperPath ?? ""
                };

                Logger.Info($"FindTools: unity={unityPath}, ripper={ripperPath}");
                return result.ToString();
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "FindTools failed");
                return "";
            }
        }

        /// <summary>
        /// Download the latest AssetRipper release from GitHub to the app data directory.
        /// Returns the directory path where it was saved, or empty string on failure.
        /// </summary>
        public async Task<string> DownloadAssetRipper()
        {
            try
            {
                // Target directory: same folder as Aurora's app data
                var appDataDir = AppDomain.CurrentDomain.BaseDirectory;
                var ripperDir = Path.Combine(appDataDir, "tools", "AssetRipper");
                Directory.CreateDirectory(ripperDir);

                // Check if already downloaded
                var existingExe = FindAssetRipperExe(ripperDir);
                if (!string.IsNullOrEmpty(existingExe))
                {
                    Logger.Info($"AssetRipper already present at: {ripperDir}");
                    return ripperDir;
                }

                Logger.Info("Downloading AssetRipper from GitHub...");

                // Get latest release from GitHub API
                using var http = new HttpClient();
                http.DefaultRequestHeaders.Add("User-Agent", "Aurora-VrcaBridge/1.0");

                var releaseJson = await http.GetStringAsync(
                    "https://api.github.com/repos/AssetRipper/AssetRipper/releases/latest"
                );

                var release = JObject.Parse(releaseJson);
                var assets = release["assets"] as JArray;

                if (assets == null)
                {
                    Logger.Error("No assets in AssetRipper release");
                    return "";
                }

                // Pick the right asset for this OS
                string targetPattern;
                if (OperatingSystem.IsWindows())
                    targetPattern = "win_x64";
                else if (OperatingSystem.IsMacOS())
                    targetPattern = "mac_x64";
                else
                    targetPattern = "linux_x64";

                // Prefer the console/CLI version
                JToken? targetAsset = null;
                foreach (var asset in assets)
                {
                    var name = asset["name"]?.ToString() ?? "";
                    if (name.Contains(targetPattern, StringComparison.OrdinalIgnoreCase)
                        && (name.EndsWith(".zip") || name.EndsWith(".tar.gz") || name.EndsWith(".tar.bz2")))
                    {
                        targetAsset = asset;
                        break;
                    }
                }

                if (targetAsset == null)
                {
                    Logger.Error($"No AssetRipper asset found for pattern: {targetPattern}");
                    return "";
                }

                var downloadUrl = targetAsset["browser_download_url"]?.ToString();
                var assetName = targetAsset["name"]?.ToString();

                if (string.IsNullOrEmpty(downloadUrl) || string.IsNullOrEmpty(assetName))
                {
                    Logger.Error("Invalid asset URL or name");
                    return "";
                }

                Logger.Info($"Downloading: {downloadUrl}");
                var zipPath = Path.Combine(ripperDir, assetName);

                var fileBytes = await http.GetByteArrayAsync(downloadUrl);
                await File.WriteAllBytesAsync(zipPath, fileBytes);

                // Extract the archive
                if (assetName.EndsWith(".zip"))
                {
                    System.IO.Compression.ZipFile.ExtractToDirectory(zipPath, ripperDir, true);
                }
                else
                {
                    // tar.gz / tar.bz2 - use command line
                    var tarArgs = assetName.EndsWith(".tar.gz")
                        ? $"-xzf \"{zipPath}\" -C \"{ripperDir}\""
                        : $"-xjf \"{zipPath}\" -C \"{ripperDir}\"";
                    RunProcess("tar", tarArgs, 60000);
                }

                // Make sure the exe is executable on Unix
                if (!OperatingSystem.IsWindows())
                {
                    var exePath = FindAssetRipperExe(ripperDir);
                    if (!string.IsNullOrEmpty(exePath))
                        RunProcess("chmod", $"+x \"{exePath}\"", 5000);
                }

                File.Delete(zipPath);

                Logger.Info($"AssetRipper extracted to: {ripperDir}");
                return ripperDir;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "DownloadAssetRipper failed");
                return "";
            }
        }

        // --- Auto-detection helpers ---

        private string AutoFindUnity()
        {
            // Common Unity Hub install locations for 2022.3.22f1
            var candidates = new List<string>();

            if (OperatingSystem.IsWindows())
            {
                var hubBase = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    "Unity", "Hub", "Editor"
                );
                var hubBase2 = @"C:\Program Files\Unity\Hub\Editor";
                var hubBase3 = @"C:\Program Files (x86)\Unity\Hub\Editor";

                foreach (var hub in new[] { hubBase, hubBase2, hubBase3 })
                {
                    if (Directory.Exists(hub))
                    {
                        // Try exact version first
                        var exact = Path.Combine(hub, UnityVersion, "Editor");
                        if (Directory.Exists(exact)) candidates.Add(exact);

                        // Then any 2022.3.x
                        try
                        {
                            foreach (var ver in Directory.GetDirectories(hub, "2022.3.*"))
                                candidates.Add(Path.Combine(ver, "Editor"));
                        }
                        catch { }
                    }
                }
            }
            else if (OperatingSystem.IsMacOS())
            {
                var hubBase = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Applications", "Unity", "Hub", "Editor"
                );
                var hubBase2 = "/Applications/Unity/Hub/Editor";

                foreach (var hub in new[] { hubBase, hubBase2 })
                {
                    if (!Directory.Exists(hub)) continue;
                    var exact = Path.Combine(hub, UnityVersion);
                    if (Directory.Exists(exact)) candidates.Add(exact);
                    try
                    {
                        foreach (var ver in Directory.GetDirectories(hub, "2022.3.*"))
                            candidates.Add(ver);
                    }
                    catch { }
                }
            }
            else
            {
                // Linux
                var homeHub = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Unity", "Hub", "Editor"
                );
                if (Directory.Exists(homeHub))
                {
                    var exact = Path.Combine(homeHub, UnityVersion, "Editor");
                    if (Directory.Exists(exact)) candidates.Add(exact);
                    try
                    {
                        foreach (var ver in Directory.GetDirectories(homeHub, "2022.3.*"))
                            candidates.Add(Path.Combine(ver, "Editor"));
                    }
                    catch { }
                }
            }

            foreach (var candidate in candidates)
            {
                var exe = FindUnityExe(candidate);
                if (!string.IsNullOrEmpty(exe))
                    return candidate;
            }

            return "";
        }

        private string AutoFindAssetRipper()
        {
            // Check Aurora's own tools directory first
            var appDir = AppDomain.CurrentDomain.BaseDirectory;
            var toolsDir = Path.Combine(appDir, "tools", "AssetRipper");
            if (Directory.Exists(toolsDir))
            {
                var exe = FindAssetRipperExe(toolsDir);
                if (!string.IsNullOrEmpty(exe)) return toolsDir;
            }

            // Common user locations
            var candidates = new List<string>();

            if (OperatingSystem.IsWindows())
            {
                var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                var downloads = Path.Combine(userProfile, "Downloads");
                candidates.Add(downloads);
                candidates.Add(Path.Combine(userProfile, "Downloads", "AssetRipper"));
                candidates.Add(Path.Combine(userProfile, "tools", "AssetRipper"));
                candidates.Add(Path.Combine(userProfile, "AssetRipper"));
                candidates.Add(@"C:\Tools\AssetRipper");
            }
            else
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                candidates.Add(Path.Combine(home, "Downloads", "AssetRipper"));
                candidates.Add(Path.Combine(home, ".local", "bin", "AssetRipper"));
                candidates.Add(Path.Combine(home, "tools", "AssetRipper"));
                candidates.Add("/usr/local/bin");
                candidates.Add("/opt/AssetRipper");
            }

            foreach (var dir in candidates)
            {
                if (!Directory.Exists(dir)) continue;
                var exe = FindAssetRipperExe(dir);
                if (!string.IsNullOrEmpty(exe))
                    return dir;
            }

            return "";
        }

        /// <summary>
        /// Stage 1: Extract a .vrca bundle using AssetRipper CLI.
        /// Returns the output directory path, or empty string on failure.
        /// </summary>
        public string ExtractAssets(string vrcaPath, string assetRipperPath)
        {
            try
            {
                if (!File.Exists(vrcaPath))
                {
                    Logger.Error($"VRCA file not found: {vrcaPath}");
                    return "";
                }

                // Determine AssetRipper executable
                var ripperExe = FindAssetRipperExe(assetRipperPath);
                if (string.IsNullOrEmpty(ripperExe))
                {
                    Logger.Error($"AssetRipper executable not found in: {assetRipperPath}");
                    return "";
                }

                // Output directory next to the .vrca file
                var vrcaDir = Path.GetDirectoryName(vrcaPath) ?? ".";
                var vrcaName = Path.GetFileNameWithoutExtension(vrcaPath);
                var outputDir = Path.Combine(vrcaDir, $"{vrcaName}_extracted");

                // Clean previous extraction
                if (Directory.Exists(outputDir))
                    Directory.Delete(outputDir, true);

                Directory.CreateDirectory(outputDir);

                Logger.Info($"Extracting {vrcaPath} to {outputDir}");

                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = ripperExe,
                        Arguments = $"\"{vrcaPath}\" -o \"{outputDir}\" -q",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                var stdout = process.StandardOutput.ReadToEnd();
                var stderr = process.StandardError.ReadToEnd();
                process.WaitForExit(120000); // 2 min timeout

                if (process.ExitCode != 0)
                {
                    Logger.Error($"AssetRipper failed (exit {process.ExitCode}): {stderr}");
                    return "";
                }

                // Find the extracted project root (AssetRipper outputs into a subfolder)
                var exportedProject = FindExportedProject(outputDir);
                if (string.IsNullOrEmpty(exportedProject))
                {
                    Logger.Error("Could not find exported project in AssetRipper output");
                    return "";
                }

                Logger.Info($"Extraction complete: {exportedProject}");
                return exportedProject;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "ExtractAssets failed");
                return "";
            }
        }

        /// <summary>
        /// Stage 2: Create a Unity project with VRChat SDK and import extracted assets.
        /// Returns the project path, or empty string on failure.
        /// </summary>
        public string CreateUnityProject(string extractedPath, string unityEditorPath, bool buildQuest)
        {
            try
            {
                var unityExe = FindUnityExe(unityEditorPath);
                if (string.IsNullOrEmpty(unityExe))
                {
                    Logger.Error($"Unity Editor not found in: {unityEditorPath}");
                    return "";
                }

                // Create project directory
                var projectDir = Path.Combine(
                    Path.GetDirectoryName(extractedPath) ?? ".",
                    "VrcaBridge_UnityProject"
                );

                if (Directory.Exists(projectDir))
                    Directory.Delete(projectDir, true);

                Logger.Info($"Creating Unity project at {projectDir}");

                // Create the project via Unity batchmode
                var createArgs = $"-batchmode -nographics -quit -createProject \"{projectDir}\"";
                var createResult = RunProcess(unityExe, createArgs, 180000);
                if (!createResult)
                {
                    Logger.Error("Failed to create Unity project");
                    return "";
                }

                // Write the VRChat SDK package manifest
                WritePackageManifest(projectDir);

                // Copy extracted assets into the project
                CopyExtractedAssets(extractedPath, projectDir);

                // Write the editor build script
                WriteBuildScript(projectDir);

                // If Quest build needed, write the shader remapper
                if (buildQuest)
                    WriteShaderRemapper(projectDir);

                // Let Unity import all assets
                var importArgs = $"-batchmode -nographics -quit -projectPath \"{projectDir}\"";
                var importResult = RunProcess(unityExe, importArgs, 600000); // 10 min
                if (!importResult)
                {
                    Logger.Warn("Unity import had warnings/errors but may have succeeded");
                }

                Logger.Info($"Unity project ready: {projectDir}");
                return projectDir;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "CreateUnityProject failed");
                return "";
            }
        }

        /// <summary>
        /// Stage 3: Build avatar bundle(s) using Unity batchmode.
        /// Returns JSON array of {path, platform} objects, or empty string on failure.
        /// </summary>
        public string BuildAvatar(string projectPath, string unityEditorPath, bool buildPC, bool buildQuest)
        {
            try
            {
                var unityExe = FindUnityExe(unityEditorPath);
                if (string.IsNullOrEmpty(unityExe))
                {
                    Logger.Error($"Unity Editor not found in: {unityEditorPath}");
                    return "";
                }

                var bundles = new List<object>();

                if (buildPC)
                {
                    Logger.Info("Building PC (StandaloneWindows64) bundle...");
                    var pcBundlePath = BuildForPlatform(unityExe, projectPath, "StandaloneWindows64");
                    if (!string.IsNullOrEmpty(pcBundlePath))
                    {
                        bundles.Add(new { path = pcBundlePath, platform = "standalonewindows" });
                    }
                    else
                    {
                        Logger.Error("PC build failed");
                        return "";
                    }
                }

                if (buildQuest)
                {
                    Logger.Info("Building Quest (Android) bundle...");
                    // Remap shaders before Android build
                    var remapArgs = $"-batchmode -nographics -quit -projectPath \"{projectPath}\" " +
                                    "-executeMethod VrcaBridgeEditor.RemapShadersForQuest";
                    RunProcess(unityExe, remapArgs, 120000);

                    var questBundlePath = BuildForPlatform(unityExe, projectPath, "Android");
                    if (!string.IsNullOrEmpty(questBundlePath))
                    {
                        bundles.Add(new { path = questBundlePath, platform = "android" });
                    }
                    else
                    {
                        Logger.Error("Quest build failed");
                        return "";
                    }
                }

                var result = JsonConvert.SerializeObject(bundles);
                Logger.Info($"Build complete: {result}");
                return result;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "BuildAvatar failed");
                return "";
            }
        }

        /// <summary>
        /// Stage 4: Upload a built bundle to VRChat using the current session.
        /// Returns "ok" on success, or empty string on failure.
        /// The upload uses the authenticated WebApi instance with VRChat cookies.
        /// </summary>
        public async Task<string> UploadBundle(string bundlePath, string platform)
        {
            try
            {
                if (!File.Exists(bundlePath))
                {
                    Logger.Error($"Bundle file not found: {bundlePath}");
                    return "";
                }

                Logger.Info($"Uploading {platform} bundle: {bundlePath}");

                var fileBytes = await File.ReadAllBytesAsync(bundlePath);
                var base64File = Convert.ToBase64String(fileBytes);

                // Compute MD5
                using var md5 = MD5.Create();
                var md5Hash = md5.ComputeHash(fileBytes);
                var fileMd5 = Convert.ToBase64String(md5Hash);

                // Compute librsync signature
                using var sigStream = Librsync.ComputeSignature(new MemoryStream(fileBytes));
                using var sigMemStream = new MemoryStream();
                sigStream.CopyTo(sigMemStream);
                var sigBytes = sigMemStream.ToArray();
                var base64Sig = Convert.ToBase64String(sigBytes);

                using var sigMd5Hash = MD5.Create();
                var sigMd5 = Convert.ToBase64String(sigMd5Hash.ComputeHash(sigBytes));

                // Determine MIME and extension based on platform
                var fileMime = "application/x-avatar";
                var fileExtension = platform == "android" ? ".vrca" : ".vrca";

                // Step 1: Create/init file on VRChat
                var createFileBody = new JObject
                {
                    ["name"] = $"Avatar - VrcaBridge {platform} - {DateTime.UtcNow:yyyyMMdd_HHmmss}",
                    ["mimeType"] = fileMime,
                    ["extension"] = fileExtension,
                    ["tags"] = new JArray()
                };

                var createRes = await VrchatApiRequest("POST", "file", createFileBody.ToString());
                if (createRes == null)
                {
                    Logger.Error("Failed to create file on VRChat API");
                    return "";
                }

                var fileId = createRes["id"]?.ToString();
                if (string.IsNullOrEmpty(fileId))
                {
                    Logger.Error("No file ID returned from VRChat API");
                    return "";
                }

                // Step 2: Create a new version
                var versionBody = new JObject
                {
                    ["signatureMd5"] = sigMd5,
                    ["signatureSizeInBytes"] = sigBytes.Length,
                    ["fileMd5"] = fileMd5,
                    ["fileSizeInBytes"] = fileBytes.Length
                };

                var versionRes = await VrchatApiRequest("POST", $"file/{fileId}", versionBody.ToString());
                if (versionRes == null)
                {
                    Logger.Error("Failed to create file version");
                    return "";
                }

                var versions = versionRes["versions"] as JArray;
                var latestVersion = versions?.Last;
                var fileVersion = latestVersion?["version"]?.Value<int>() ?? 1;

                // Step 3: Upload file data
                // Get presigned URL for file
                var fileStartRes = await VrchatApiRequest("PUT",
                    $"file/{fileId}/{fileVersion}/file/start", null);
                if (fileStartRes == null)
                {
                    Logger.Error("Failed to get file upload URL");
                    return "";
                }

                var fileUploadUrl = fileStartRes["url"]?.ToString();
                if (string.IsNullOrEmpty(fileUploadUrl))
                {
                    Logger.Error("No upload URL returned");
                    return "";
                }

                // PUT to AWS
                var fileUploadResult = await UploadToAws(fileUploadUrl, fileBytes, fileMime, fileMd5);
                if (!fileUploadResult)
                {
                    Logger.Error("File upload to AWS failed");
                    return "";
                }

                // Finish file upload
                await VrchatApiRequest("PUT", $"file/{fileId}/{fileVersion}/file/finish", null);

                // Step 4: Upload signature
                var sigStartRes = await VrchatApiRequest("PUT",
                    $"file/{fileId}/{fileVersion}/signature/start", null);
                if (sigStartRes != null)
                {
                    var sigUploadUrl = sigStartRes["url"]?.ToString();
                    if (!string.IsNullOrEmpty(sigUploadUrl))
                    {
                        await UploadToAws(sigUploadUrl, sigBytes, "application/x-rsync-signature", sigMd5);
                        await VrchatApiRequest("PUT", $"file/{fileId}/{fileVersion}/signature/finish", null);
                    }
                }

                Logger.Info($"Upload complete: file/{fileId}/{fileVersion}");
                return "ok";
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "UploadBundle failed");
                return "";
            }
        }

        // --- Helper methods ---

        private string FindAssetRipperExe(string basePath)
        {
            // Check if the path itself is the exe
            if (File.Exists(basePath) && basePath.Contains("AssetRipper", StringComparison.OrdinalIgnoreCase))
                return basePath;

            // Search for AssetRipperConsole or AssetRipper exe
            var candidates = new[]
            {
                Path.Combine(basePath, "AssetRipperConsole.exe"),
                Path.Combine(basePath, "AssetRipper.exe"),
                Path.Combine(basePath, "AssetRipperConsole"),
                Path.Combine(basePath, "AssetRipper"),
                // Linux AppImage
                Path.Combine(basePath, "AssetRipper.AppImage")
            };

            return candidates.FirstOrDefault(File.Exists) ?? "";
        }

        private string FindUnityExe(string basePath)
        {
            if (File.Exists(basePath) && basePath.Contains("Unity", StringComparison.OrdinalIgnoreCase))
                return basePath;

            var candidates = new[]
            {
                Path.Combine(basePath, "Unity.exe"),
                Path.Combine(basePath, "Editor", "Unity.exe"),
                // macOS
                Path.Combine(basePath, "Unity.app", "Contents", "MacOS", "Unity"),
                // Linux
                Path.Combine(basePath, "Unity"),
                Path.Combine(basePath, "Editor", "Unity")
            };

            return candidates.FirstOrDefault(File.Exists) ?? "";
        }

        private string FindExportedProject(string outputDir)
        {
            // AssetRipper exports into ExportedProject or similar
            var candidates = new[]
            {
                Path.Combine(outputDir, "ExportedProject"),
                Path.Combine(outputDir, "Assets"),
                outputDir
            };

            foreach (var c in candidates)
            {
                if (Directory.Exists(c))
                {
                    // Check if it has an Assets folder (Unity project structure)
                    if (Directory.Exists(Path.Combine(c, "Assets")))
                        return c;
                    if (c.EndsWith("Assets"))
                        return Path.GetDirectoryName(c) ?? c;
                }
            }

            // If ExportedProject/Assets exists as a nested structure
            var dirs = Directory.GetDirectories(outputDir, "Assets", SearchOption.AllDirectories);
            if (dirs.Length > 0)
            {
                return Path.GetDirectoryName(dirs[0]) ?? outputDir;
            }

            return outputDir;
        }

        private bool RunProcess(string exe, string args, int timeoutMs)
        {
            try
            {
                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = exe,
                        Arguments = args,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                process.StandardOutput.ReadToEnd();
                process.StandardError.ReadToEnd();
                process.WaitForExit(timeoutMs);

                return process.ExitCode == 0;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, $"RunProcess failed: {exe}");
                return false;
            }
        }

        private void WritePackageManifest(string projectDir)
        {
            var packagesDir = Path.Combine(projectDir, "Packages");
            Directory.CreateDirectory(packagesDir);

            var manifest = new JObject
            {
                ["dependencies"] = new JObject
                {
                    ["com.vrchat.avatars"] = $"https://packages.vrchat.com/com.vrchat.avatars/-/com.vrchat.avatars-{VrcSdkVersion}.tgz",
                    ["com.vrchat.base"] = $"https://packages.vrchat.com/com.vrchat.base/-/com.vrchat.base-{VrcSdkVersion}.tgz",
                    ["com.unity.modules.animation"] = "1.0.0",
                    ["com.unity.modules.audio"] = "1.0.0",
                    ["com.unity.modules.imageconversion"] = "1.0.0",
                    ["com.unity.modules.imgui"] = "1.0.0",
                    ["com.unity.modules.particlesystem"] = "1.0.0",
                    ["com.unity.modules.physics"] = "1.0.0",
                    ["com.unity.modules.ui"] = "1.0.0",
                    ["com.unity.modules.uielements"] = "1.0.0"
                },
                ["scopedRegistries"] = new JArray
                {
                    new JObject
                    {
                        ["name"] = "VRChat",
                        ["url"] = "https://packages.vrchat.com",
                        ["scopes"] = new JArray { "com.vrchat" }
                    }
                }
            };

            File.WriteAllText(
                Path.Combine(packagesDir, "manifest.json"),
                manifest.ToString(Formatting.Indented)
            );
        }

        private void CopyExtractedAssets(string extractedPath, string projectDir)
        {
            var sourceAssets = Path.Combine(extractedPath, "Assets");
            var destAssets = Path.Combine(projectDir, "Assets");

            if (Directory.Exists(sourceAssets))
            {
                CopyDirectory(sourceAssets, destAssets);
            }

            // Also copy ProjectSettings if they exist
            var sourceSettings = Path.Combine(extractedPath, "ProjectSettings");
            var destSettings = Path.Combine(projectDir, "ProjectSettings");
            if (Directory.Exists(sourceSettings))
            {
                CopyDirectory(sourceSettings, destSettings);
            }
        }

        private void CopyDirectory(string source, string dest)
        {
            Directory.CreateDirectory(dest);

            foreach (var file in Directory.GetFiles(source))
            {
                var destFile = Path.Combine(dest, Path.GetFileName(file));
                File.Copy(file, destFile, true);
            }

            foreach (var dir in Directory.GetDirectories(source))
            {
                var destDir = Path.Combine(dest, Path.GetFileName(dir));
                CopyDirectory(dir, destDir);
            }
        }

        private void WriteBuildScript(string projectDir)
        {
            var editorDir = Path.Combine(projectDir, "Assets", "Editor");
            Directory.CreateDirectory(editorDir);

            var script = @"
using UnityEngine;
using UnityEditor;
using System.IO;
using System.Linq;

public class VrcaBridgeEditor
{
    // Build avatar bundle for the given target platform
    [MenuItem(""VrcaBridge/Build PC"")]
    public static void BuildPC()
    {
        BuildBundle(BuildTarget.StandaloneWindows64, ""standalonewindows"");
    }

    [MenuItem(""VrcaBridge/Build Android"")]
    public static void BuildAndroid()
    {
        BuildBundle(BuildTarget.Android, ""android"");
    }

    public static void BuildBundle(BuildTarget target, string platformTag)
    {
        var outputDir = Path.Combine(Application.dataPath, "".."", ""Builds"", platformTag);
        Directory.CreateDirectory(outputDir);

        // Find all prefabs in Assets (the extracted avatar)
        var prefabGuids = AssetDatabase.FindAssets(""t:Prefab"", new[] { ""Assets"" });
        if (prefabGuids.Length == 0)
        {
            Debug.LogError(""No prefabs found in project"");
            return;
        }

        var prefabPath = AssetDatabase.GUIDToAssetPath(prefabGuids[0]);
        var assetBundleName = ""avatar_bundle"";

        // Set the asset bundle name on the prefab
        var importer = AssetImporter.GetAtPath(prefabPath);
        importer.assetBundleName = assetBundleName;

        // Build
        var builds = new AssetBundleBuild[]
        {
            new AssetBundleBuild
            {
                assetBundleName = assetBundleName,
                assetNames = new[] { prefabPath }
            }
        };

        BuildPipeline.BuildAssetBundles(
            outputDir,
            builds,
            BuildAssetBundleOptions.None,
            target
        );

        var outputPath = Path.Combine(outputDir, assetBundleName);
        if (File.Exists(outputPath))
        {
            Debug.Log($""Build successful: {outputPath}"");

            // Write a marker file with the output path for the bridge to find
            File.WriteAllText(
                Path.Combine(outputDir, ""bundle_path.txt""),
                outputPath
            );
        }
        else
        {
            Debug.LogError(""Build failed - output file not found"");
        }
    }

    // Remap PC shaders to Quest-compatible ones
    public static void RemapShadersForQuest()
    {
        var materials = AssetDatabase.FindAssets(""t:Material"", new[] { ""Assets"" });
        var remapCount = 0;

        foreach (var guid in materials)
        {
            var path = AssetDatabase.GUIDToAssetPath(guid);
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null || mat.shader == null) continue;

            var shaderName = mat.shader.name;
            var mobileShader = GetMobileShader(shaderName);
            if (mobileShader != null)
            {
                var newShader = Shader.Find(mobileShader);
                if (newShader != null)
                {
                    // Preserve main texture and color
                    var mainTex = mat.HasProperty(""_MainTex"") ? mat.GetTexture(""_MainTex"") : null;
                    var color = mat.HasProperty(""_Color"") ? mat.GetColor(""_Color"") : Color.white;

                    mat.shader = newShader;

                    if (mainTex != null && mat.HasProperty(""_MainTex""))
                        mat.SetTexture(""_MainTex"", mainTex);
                    if (mat.HasProperty(""_Color""))
                        mat.SetColor(""_Color"", color);

                    EditorUtility.SetDirty(mat);
                    remapCount++;
                }
            }
        }

        AssetDatabase.SaveAssets();
        Debug.Log($""Remapped {remapCount} materials to Quest shaders"");
    }

    private static string GetMobileShader(string pcShaderName)
    {
        // Map PC shaders to mobile equivalents
        if (pcShaderName.Contains(""poiyomi"", System.StringComparison.OrdinalIgnoreCase) ||
            pcShaderName.Contains(""Poiyomi""))
            return ""VRChat/Mobile/Standard Lite"";

        if (pcShaderName.Contains(""lilToon"", System.StringComparison.OrdinalIgnoreCase) ||
            pcShaderName.Contains(""liltoon""))
            return ""VRChat/Mobile/Standard Lite"";

        if (pcShaderName == ""Standard"" || pcShaderName == ""Standard (Specular setup)"")
            return ""VRChat/Mobile/Standard Lite"";

        if (pcShaderName.StartsWith(""Unlit/""))
            return ""VRChat/Mobile/Diffuse"";

        if (pcShaderName.Contains(""Toon"") && !pcShaderName.StartsWith(""VRChat/""))
            return ""VRChat/Mobile/Toon Lit"";

        return null;
    }
}
";

            File.WriteAllText(Path.Combine(editorDir, "VrcaBridgeEditor.cs"), script);
        }

        private void WriteShaderRemapper(string projectDir)
        {
            // The remapper is included in the build script above
            // This method is a placeholder for any additional Quest setup
            Logger.Info("Quest shader remapper included in build script");
        }

        private string BuildForPlatform(string unityExe, string projectPath, string buildTarget)
        {
            var methodName = buildTarget == "Android"
                ? "VrcaBridgeEditor.BuildAndroid"
                : "VrcaBridgeEditor.BuildPC";

            var platformTag = buildTarget == "Android" ? "android" : "standalonewindows";

            var args = $"-batchmode -nographics -quit -projectPath \"{projectPath}\" " +
                       $"-buildTarget {buildTarget} " +
                       $"-executeMethod {methodName} " +
                       "-logFile -";

            var result = RunProcess(unityExe, args, 600000); // 10 min timeout

            // Check for the output bundle
            var markerPath = Path.Combine(projectPath, "Builds", platformTag, "bundle_path.txt");
            if (File.Exists(markerPath))
            {
                var bundlePath = File.ReadAllText(markerPath).Trim();
                if (File.Exists(bundlePath))
                    return bundlePath;
            }

            // Fallback: look for the bundle directly
            var fallbackPath = Path.Combine(projectPath, "Builds", platformTag, "avatar_bundle");
            if (File.Exists(fallbackPath))
                return fallbackPath;

            return "";
        }

        private async Task<JObject> VrchatApiRequest(string method, string endpoint, string body)
        {
            try
            {
                var options = new Dictionary<string, object>
                {
                    ["url"] = $"{VrchatApiBase}/{endpoint}",
                    ["method"] = method,
                    ["headers"] = new Dictionary<string, object>
                    {
                        ["Content-Type"] = "application/json"
                    }
                };

                if (!string.IsNullOrEmpty(body))
                    options["body"] = body;

                var result = await WebApi.Instance.Execute(options);
                if (result.Item1 >= 200 && result.Item1 < 300)
                {
                    return JObject.Parse(result.Item2);
                }

                Logger.Error($"VRChat API {method} {endpoint} returned {result.Item1}: {result.Item2}");
                return null;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, $"VRChat API request failed: {method} {endpoint}");
                return null;
            }
        }

        private async Task<bool> UploadToAws(string url, byte[] data, string mimeType, string md5Base64)
        {
            try
            {
                var base64Data = Convert.ToBase64String(data);
                var options = new Dictionary<string, object>
                {
                    ["url"] = url,
                    ["uploadFilePUT"] = true,
                    ["fileData"] = base64Data,
                    ["fileMIME"] = mimeType,
                    ["fileMD5"] = md5Base64
                };

                var result = await WebApi.Instance.Execute(options);
                return result.Item1 == 200;
            }
            catch (Exception ex)
            {
                Logger.Error(ex, "AWS upload failed");
                return false;
            }
        }
    }
}
