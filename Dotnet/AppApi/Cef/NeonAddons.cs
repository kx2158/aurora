using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace VRCX
{
    public partial class AppApi
    {
        private static readonly string[] NeonAddonExtensions = { ".png", ".jpg", ".jpeg", ".webp", ".mp3", ".wav", ".ogg", ".m4a", ".json" };

        private static string NeonAddonsRoot()
        {
            var root = Path.Join(Program.AppDataDirectory, "addons");
            Directory.CreateDirectory(root);
            var readme = Path.Join(root, "README.txt");
            if (!File.Exists(readme))
            {
                File.WriteAllText(readme,
                    "Neon add-ons\r\n\r\n" +
                    "Make a folder for each add-on, for example addons\\rin\\ :\r\n\r\n" +
                    "  addon.json              optional, {\"name\":\"Rin\",\"author\":\"Rin\"}\r\n" +
                    "                          add \"hidden\":true to keep it out of the lists until its name is typed into the secret field\r\n" +
                    "  faces\\neutral.png       a character: neutral.png is required, the rest are optional\r\n" +
                    "                          (joy, sad, sleepy, angry, surprised, smug, error)\r\n" +
                    "  voice\\poke\\*.mp3        a voice: recordings per kind of line\r\n" +
                    "                          kinds: poke, idle, newFriend, noteReminder, announcement, event,\r\n" +
                    "                          update, lateNight, alarm, welcome, test\r\n\r\n" +
                    "An add-on can have faces, a voice or both. Open Neon, go to the Neon page, press Refresh add-ons.\r\n" +
                    "Add-ons are only pictures and sound files. They cannot run code.\r\n");
            }
            return root;
        }

        /// <summary>Opens the add-ons folder in Explorer.</summary>
        public void OpenNeonAddonsFolder()
        {
            try { Process.Start(new ProcessStartInfo { FileName = NeonAddonsRoot(), UseShellExecute = true }); } catch { }
        }

        /// <summary>Lists add-ons as JSON: [{ id, name, author, faces:[names], voice:{ kind:[files] } }].</summary>
        public string ListNeonAddons()
        {
            var result = new List<Dictionary<string, object>>();
            try
            {
                foreach (var dir in Directory.GetDirectories(NeonAddonsRoot()))
                {
                    var id = Path.GetFileName(dir);
                    var item = new Dictionary<string, object> { ["id"] = id, ["name"] = id, ["author"] = "", ["hidden"] = false, ["unlockFor"] = "" };
                    try
                    {
                        var meta = Path.Join(dir, "addon.json");
                        if (File.Exists(meta))
                        {
                            using var doc = JsonDocument.Parse(File.ReadAllText(meta));
                            if (doc.RootElement.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String) item["name"] = n.GetString();
                            item["meta"] = doc.RootElement.Clone();
                            if (doc.RootElement.TryGetProperty("hidden", out var h) && h.ValueKind == JsonValueKind.True) item["hidden"] = true;
                            if (doc.RootElement.TryGetProperty("unlockFor", out var u) && u.ValueKind == JsonValueKind.String) item["unlockFor"] = u.GetString();
                            if (doc.RootElement.TryGetProperty("author", out var a) && a.ValueKind == JsonValueKind.String) item["author"] = a.GetString();
                        }
                    }
                    catch { }

                    var faces = new List<string>();
                    var facesDir = Path.Join(dir, "faces");
                    if (Directory.Exists(facesDir))
                        faces = Directory.GetFiles(facesDir, "*.png").Select(Path.GetFileNameWithoutExtension).ToList();
                    item["faces"] = faces;

                    var voice = new Dictionary<string, List<string>>();
                    var voiceDir = Path.Join(dir, "voice");
                    if (Directory.Exists(voiceDir))
                    {
                        foreach (var kind in Directory.GetDirectories(voiceDir))
                        {
                            var files = Directory.GetFiles(kind)
                                .Where(f => new[] { ".mp3", ".wav", ".ogg", ".m4a" }.Contains(Path.GetExtension(f).ToLowerInvariant()))
                                .Select(Path.GetFileName).ToList();
                            if (files.Count > 0)
                                voice[Path.GetFileName(kind)] = files;
                        }
                    }
                    item["voice"] = voice;
                    result.Add(item);
                }
            }
            catch { }
            return JsonSerializer.Serialize(result);
        }

        /// <summary>
        /// Reads one add-on file as a data URI. Only picture and sound files inside the add-on folder, up to 25 MB.
        /// </summary>
        public string ReadNeonAddonFile(string addonId, string relativePath)
        {
            try
            {
                var root = Path.GetFullPath(NeonAddonsRoot());
                var full = Path.GetFullPath(Path.Join(root, addonId, relativePath));
                if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    return "";
                var ext = Path.GetExtension(full).ToLowerInvariant();
                if (!NeonAddonExtensions.Contains(ext) || !File.Exists(full))
                    return "";
                var info = new FileInfo(full);
                if (info.Length > 25 * 1024 * 1024)
                    return "";
                var mime = ext switch
                {
                    ".png" => "image/png",
                    ".jpg" or ".jpeg" => "image/jpeg",
                    ".webp" => "image/webp",
                    ".json" => "application/json",
                    ".mp3" => "audio/mpeg",
                    ".wav" => "audio/wav",
                    ".ogg" => "audio/ogg",
                    _ => "audio/mp4"
                };
                return $"data:{mime};base64,{Convert.ToBase64String(File.ReadAllBytes(full))}";
            }
            catch
            {
                return "";
            }
        }
    }
}
