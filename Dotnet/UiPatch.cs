using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NLog;

namespace VRCX
{
    /// <summary>
    /// Quick UI-only updates. The "Aura UI patch" GitHub workflow publishes the built UI as a small zip on the
    /// "ui-latest" release. At startup the app downloads it in the background and, on the next launch, serves the UI
    /// from that folder instead of the installed one. A patch only applies to the exact installer version it was
    /// built on top of, so a newer installer always wins. Anything that goes wrong falls back to the installed UI.
    /// </summary>
    internal static class UiPatch
    {
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();
        private const string ReleaseApi = "https://api.github.com/repos/kx2158/aurora/releases/tags/ui-latest";

        private static string PatchRoot => Path.Join(Program.AppDataDirectory, "ui-patch");
        private static string ActiveDir => Path.Join(PatchRoot, "html");
        private static string InfoFile => Path.Join(PatchRoot, "ui-patch.json");

        private static string InstalledVersion()
        {
            try { return File.ReadAllText(Path.Join(Program.BaseDirectory, "Version")).Trim(); }
            catch { return ""; }
        }

        /// <summary>Returns the folder the UI should be served from.</summary>
        public static string ResolveHtmlRoot(string installedHtml)
        {
            try
            {
                if (!File.Exists(InfoFile) || !File.Exists(Path.Join(ActiveDir, "index.html")))
                    return installedHtml;

                var info = JObject.Parse(File.ReadAllText(InfoFile));
                var baseVersion = info.Value<string>("baseVersion") ?? "";
                var installed = InstalledVersion();
                if (installed.Length == 0 || !string.Equals(installed, baseVersion, StringComparison.Ordinal))
                    return installedHtml;

                logger.Info("Using UI patch {0} on top of {1}", info.Value<string>("id"), installed);
                return ActiveDir;
            }
            catch (Exception ex)
            {
                logger.Warn(ex, "UI patch check failed, using the installed UI");
                return installedHtml;
            }
        }

        public static void CheckInBackground()
        {
            Task.Run(async () =>
            {
                try { await CheckAsync(); }
                catch (Exception ex) { logger.Warn(ex, "UI patch download failed"); }
            });
        }

        private static async Task CheckAsync()
        {
            var installed = InstalledVersion();
            if (installed.Length == 0) return;

            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd(Program.Version.Replace(' ', '-') + " (ui-patch)");

            var release = JObject.Parse(await http.GetStringAsync(ReleaseApi));
            string infoUrl = null, zipUrl = null;
            foreach (var asset in release["assets"] ?? new JArray())
            {
                var name = asset.Value<string>("name");
                if (name == "ui-patch.json") infoUrl = asset.Value<string>("browser_download_url");
                else if (name == "ui-patch.zip") zipUrl = asset.Value<string>("browser_download_url");
            }
            if (infoUrl == null || zipUrl == null) return;

            var remote = JObject.Parse(await http.GetStringAsync(infoUrl));
            var remoteId = remote.Value<string>("id") ?? "";
            var remoteBase = remote.Value<string>("baseVersion") ?? "";
            if (remoteId.Length == 0 || remoteBase != installed) return; // not for this installer

            if (File.Exists(InfoFile))
            {
                var local = JObject.Parse(File.ReadAllText(InfoFile));
                if (local.Value<string>("id") == remoteId && File.Exists(Path.Join(ActiveDir, "index.html")))
                    return; // already have it
            }

            Directory.CreateDirectory(PatchRoot);
            var zipPath = Path.Join(PatchRoot, "download.zip");
            var stagingDir = Path.Join(PatchRoot, "html.new");

            using (var response = await http.GetAsync(zipUrl))
            {
                response.EnsureSuccessStatusCode();
                await using var file = File.Create(zipPath);
                await response.Content.CopyToAsync(file);
            }

            if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, true);
            ZipFile.ExtractToDirectory(zipPath, stagingDir);
            File.Delete(zipPath);
            if (!File.Exists(Path.Join(stagingDir, "index.html")))
            {
                Directory.Delete(stagingDir, true);
                throw new InvalidDataException("UI patch has no index.html");
            }

            // the running app may be reading ActiveDir, so keep the swap quick and leave the old one for later cleanup
            var oldDir = Path.Join(PatchRoot, "html.old");
            if (Directory.Exists(oldDir)) { try { Directory.Delete(oldDir, true); } catch { } }
            if (Directory.Exists(ActiveDir)) Directory.Move(ActiveDir, oldDir);
            Directory.Move(stagingDir, ActiveDir);
            File.WriteAllText(InfoFile, remote.ToString());
            if (Directory.Exists(oldDir)) { try { Directory.Delete(oldDir, true); } catch { } }
            logger.Info("UI patch {0} downloaded, it applies the next time the app starts", remoteId);
        }
    }
}
