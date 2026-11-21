using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace VRCX;

/// <summary>
/// Lets Aurora's own full body estimation take over from Standable: finds Standable's SteamVR driver and
/// switches it off in steamvr.vrsettings ("driver_standable": { "enable": false }), which is how SteamVR
/// turns any driver off. SteamVR only reads that at startup, and it rewrites the file when it quits, so
/// the change is made while SteamVR is closed (or reported as needing a SteamVR restart).
/// </summary>
public partial class AppApi
{
    private const string StandableDriverName = "standable";

    private static readonly JsonDocumentOptions LenientJson = new()
    {
        CommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private static string OpenVrPathsFile() =>
        Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "openvr", "openvrpaths.vrpath");

    private static JsonNode ReadJson(string path)
    {
        return JsonNode.Parse(File.ReadAllText(path), documentOptions: LenientJson);
    }

    private static IEnumerable<string> OpenVrPathList(JsonNode root, string key)
    {
        if (root?[key] is not JsonArray arr) yield break;
        foreach (var item in arr)
        {
            var s = item?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(s)) yield return s;
        }
    }

    private static bool IsStandableDriverFolder(string dir)
    {
        try
        {
            var manifest = Path.Join(dir, "driver.vrdrivermanifest");
            if (File.Exists(manifest))
            {
                var name = ReadJson(manifest)?["name"]?.GetValue<string>();
                if (string.Equals(name, StandableDriverName, StringComparison.OrdinalIgnoreCase)) return true;
            }
        }
        catch
        {
            // a manifest we cannot read is not worth failing over, fall back to the folder name
        }

        return Path.GetFileName(dir.TrimEnd('\\', '/')).Contains("standable", StringComparison.OrdinalIgnoreCase);
    }

    private static string FindSteamVrSettings(JsonNode paths)
    {
        foreach (var cfg in OpenVrPathList(paths, "config"))
        {
            var file = Path.Join(cfg, "steamvr.vrsettings");
            if (File.Exists(file)) return file;
        }

        return null;
    }

    /// <summary>
    /// JSON: { installed, enabled, steamVrRunning, running, settingsFile }. enabled is true unless the
    /// driver has been switched off in steamvr.vrsettings.
    /// </summary>
    public string GetStandableStatus()
    {
        var result = new JsonObject
        {
            ["installed"] = false,
            ["enabled"] = false,
            ["steamVrRunning"] = false,
            ["running"] = false
        };
        try
        {
            result["steamVrRunning"] = Process.GetProcessesByName("vrserver").Length > 0;
            result["running"] = Process.GetProcessesByName("Standable").Length > 0;
            var pathsFile = OpenVrPathsFile();
            if (!File.Exists(pathsFile)) return result.ToJsonString();

            var paths = ReadJson(pathsFile);
            var installed = OpenVrPathList(paths, "external_drivers").Any(IsStandableDriverFolder);
            result["installed"] = installed;
            var settings = FindSteamVrSettings(paths);
            result["settingsFile"] = settings;
            if (!installed) return result.ToJsonString();

            var enabled = true;
            if (settings != null)
            {
                var flag = ReadJson(settings)?["driver_" + StandableDriverName]?["enable"];
                if (flag != null && flag.GetValueKind() == JsonValueKind.False) enabled = false;
            }

            result["enabled"] = enabled;
        }
        catch (Exception ex)
        {
            result["error"] = ex.Message;
        }

        return result.ToJsonString();
    }

    /// <summary>
    /// Switches Standable's driver off. Keeps a one-time backup next to the settings file. Also closes a
    /// running Standable app if there is one. JSON: { ok, changed, needsSteamVrRestart, error? }.
    /// </summary>
    public string DisableStandable()
    {
        var result = new JsonObject { ["ok"] = false, ["changed"] = false, ["needsSteamVrRestart"] = false };
        try
        {
            var pathsFile = OpenVrPathsFile();
            if (!File.Exists(pathsFile))
            {
                result["error"] = "SteamVR is not installed or has never been run";
                return result.ToJsonString();
            }

            var paths = ReadJson(pathsFile);
            var settings = FindSteamVrSettings(paths);
            if (settings == null)
            {
                result["error"] = "steamvr.vrsettings was not found";
                return result.ToJsonString();
            }

            var root = ReadJson(settings) as JsonObject ?? new JsonObject();
            var key = "driver_" + StandableDriverName;
            if (root[key] is not JsonObject section)
            {
                section = new JsonObject();
                root[key] = section;
            }

            var already = section["enable"] != null && section["enable"].GetValueKind() == JsonValueKind.False;
            if (!already)
            {
                var backup = settings + ".aurora-backup";
                if (!File.Exists(backup)) File.Copy(settings, backup);
                section["enable"] = false;
                File.WriteAllText(settings, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
                result["changed"] = true;
                // SteamVR rewrites this file when it quits and only reads it when it starts
                result["needsSteamVrRestart"] = Process.GetProcessesByName("vrserver").Length > 0;
            }

            foreach (var proc in Process.GetProcessesByName("Standable"))
            {
                try { proc.Kill(); } catch { }
                proc.Dispose();
            }

            result["ok"] = true;
        }
        catch (Exception ex)
        {
            result["error"] = ex.Message;
        }

        return result.ToJsonString();
    }
}
