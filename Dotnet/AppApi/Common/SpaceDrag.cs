using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;

namespace VRCX;

/// <summary>
/// Controls Aurora's space drag helper (SpaceDrag\Aurora.SpaceDrag.exe, built from the SpaceDrag folder of the source).
/// The helper does the work inside SteamVR; Aurora only starts and stops it, writes spacedrag.json for it to read and
/// reads spacedrag-status.json it writes back. Both files live in Aurora's data folder.
/// </summary>
public partial class AppApi
{
    private const string SpaceDragProcess = "Aurora.SpaceDrag";

    private static string SpaceDragExe() => Path.Join(Program.BaseDirectory, "SpaceDrag", "Aurora.SpaceDrag.exe");
    private static string SpaceDragSettingsFile() => Path.Join(Program.AppDataDirectory, "spacedrag.json");
    private static string SpaceDragStatusFile() => Path.Join(Program.AppDataDirectory, "spacedrag-status.json");

    private static bool SpaceDragRunning() => Process.GetProcessesByName(SpaceDragProcess).Length > 0;

    private static JsonObject ReadSpaceDragSettings()
    {
        try
        {
            if (File.Exists(SpaceDragSettingsFile()) && JsonNode.Parse(File.ReadAllText(SpaceDragSettingsFile())) is JsonObject o)
                return o;
        }
        catch
        {
            // fall through to a fresh object
        }

        return new JsonObject();
    }

    private static void WriteSpaceDragSettings(JsonObject settings)
    {
        Directory.CreateDirectory(Program.AppDataDirectory);
        var tmp = SpaceDragSettingsFile() + ".tmp";
        File.WriteAllText(tmp, settings.ToJsonString());
        File.Move(tmp, SpaceDragSettingsFile(), true);
    }

    /// <summary>
    /// JSON: { installed, running, settings, steamVr, bound, dragging, hand, offset, error }.
    /// installed: this Aurora build contains the helper. steamVr and bound come from the helper's own status file,
    /// and only count when the helper is running and wrote it in the last few seconds.
    /// </summary>
    public string GetSpaceDragStatus()
    {
        var result = new JsonObject
        {
            ["installed"] = File.Exists(SpaceDragExe()),
            ["running"] = false,
            ["steamVr"] = false,
            ["bound"] = false,
            ["dragging"] = false,
            ["settings"] = ReadSpaceDragSettings()
        };
        try
        {
            result["running"] = SpaceDragRunning();
            if ((bool)result["running"] && File.Exists(SpaceDragStatusFile()) &&
                JsonNode.Parse(File.ReadAllText(SpaceDragStatusFile())) is JsonObject s)
            {
                var updated = s["updated"]?.GetValue<long>() ?? 0;
                var fresh = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - updated < 5000;
                if (fresh)
                {
                    foreach (var key in new[] { "steamVr", "bound", "dragging", "hand", "offset", "error" })
                        if (s[key] != null) result[key] = s[key].DeepClone();
                }
            }
        }
        catch (Exception ex)
        {
            result["error"] = ex.Message;
        }

        return result.ToJsonString();
    }

    /// <summary>
    /// Saves the settings the card sends ({ enabled, hand, multiplier, allowVertical, comfort }). Unknown keys are dropped and the
    /// reset counter is kept, so a settings change can never reset the play space by accident. Returns what was saved.
    /// </summary>
    public string SetSpaceDragSettings(string json)
    {
        var saved = ReadSpaceDragSettings();
        try
        {
            if (JsonNode.Parse(json) is JsonObject incoming)
            {
                foreach (var key in new[] { "enabled", "hand", "multiplier", "allowVertical", "comfort" })
                    if (incoming[key] != null) saved[key] = incoming[key].DeepClone();
                WriteSpaceDragSettings(saved);
            }
        }
        catch (Exception ex)
        {
            saved["error"] = ex.Message;
        }

        return saved.ToJsonString();
    }

    /// <summary>Starts the helper if it is not running. Returns true when it is running afterwards.</summary>
    public bool StartSpaceDrag()
    {
        try
        {
            if (SpaceDragRunning()) return true;
            var exe = SpaceDragExe();
            if (!File.Exists(exe)) return false;
            Process.Start(new ProcessStartInfo
            {
                FileName = exe,
                Arguments = $"--settings \"{SpaceDragSettingsFile()}\" --status \"{SpaceDragStatusFile()}\"",
                WorkingDirectory = Path.GetDirectoryName(exe)!,
                UseShellExecute = false,
                CreateNoWindow = true
            });
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Stops the helper. The play space stays where it is until it is reset.</summary>
    public bool StopSpaceDrag()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName(SpaceDragProcess))
            {
                p.Kill();
                p.Dispose();
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Asks the helper to put the play space back where SteamVR has it (the helper must be running).</summary>
    public bool ResetSpaceDrag()
    {
        try
        {
            var s = ReadSpaceDragSettings();
            var counter = s["resetCounter"]?.GetValue<int>() ?? 0;
            s["resetCounter"] = counter + 1;
            WriteSpaceDragSettings(s);
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>Opens SteamVR's controller binding page in the browser (it only works while SteamVR is running).</summary>
    public bool OpenSteamVrBindings()
    {
        try
        {
            Process.Start(new ProcessStartInfo("http://localhost:27062/dashboard/controllerbinding.html") { UseShellExecute = true });
            return true;
        }
        catch
        {
            return false;
        }
    }
}
