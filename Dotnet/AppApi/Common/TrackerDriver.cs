using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;

namespace VRCX;

/// <summary>
/// Registers Aurora's own SteamVR driver (the folder SteamVRDriver\aurora next to Aurora.exe, built from Driver/)
/// in SteamVR's openvrpaths.vrpath, so SteamVR loads it and lists Aurora's body trackers. SteamVR reads the
/// list when it starts, so a running SteamVR needs a restart the first time.
/// </summary>
public partial class AppApi
{
    private static string AuroraDriverDir() => Path.Join(Program.BaseDirectory, "SteamVRDriver", "aurora");

    private static bool SamePath(string a, string b) =>
        string.Equals(Path.GetFullPath(a).TrimEnd('\\', '/'), Path.GetFullPath(b).TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase);

    /// <summary>JSON: { built, registered, steamVrRunning, changed, needsSteamVrRestart, error }. Registers the driver when it is not yet.</summary>
    public string EnsureAuroraTrackerDriver()
    {
        var result = new JsonObject
        {
            ["built"] = false,
            ["registered"] = false,
            ["changed"] = false,
            ["steamVrRunning"] = false,
            ["needsSteamVrRestart"] = false
        };
        try
        {
            var dir = AuroraDriverDir();
            result["built"] = File.Exists(Path.Join(dir, "driver.vrdrivermanifest")) &&
                              File.Exists(Path.Join(dir, "bin", "win64", "driver_aurora.dll"));
            result["steamVrRunning"] = Process.GetProcessesByName("vrserver").Length > 0;
            var pathsFile = OpenVrPathsFile();
            if (!(bool)result["built"] || !File.Exists(pathsFile)) return result.ToJsonString();

            var paths = ReadJson(pathsFile);
            var already = OpenVrPathList(paths, "external_drivers").Any(d => SamePath(d, dir));
            if (!already)
            {
                var backup = pathsFile + ".aurora-backup";
                if (!File.Exists(backup)) File.Copy(pathsFile, backup);
                if (paths["external_drivers"] is not JsonArray list)
                {
                    list = new JsonArray();
                    paths["external_drivers"] = list;
                }

                list.Add(dir);
                File.WriteAllText(pathsFile, paths.ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
                result["changed"] = true;
                result["needsSteamVrRestart"] = (bool)result["steamVrRunning"];
            }

            result["registered"] = true;
        }
        catch (Exception ex)
        {
            result["error"] = ex.Message;
        }

        return result.ToJsonString();
    }
}
