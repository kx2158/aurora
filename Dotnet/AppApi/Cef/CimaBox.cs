using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace VRCX
{
    /// <summary>
    /// Keeps the separate CIMA Box app (github.com/Aye7even/CIMA-Box) installed and up to date from its official
    /// releases. Aurora only downloads and starts the official CIMABox.exe, it does not contain the app's code.
    /// </summary>
    public partial class AppApiCef
    {
        private const string CimaRepo = "Aye7even/CIMA-Box";
        private static readonly HttpClient CimaHttp = MakeCimaHttp();
        private static readonly object CimaLock = new();

        private static HttpClient MakeCimaHttp()
        {
            var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("Aurora-CimaBox-Updater");
            http.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            return http;
        }

        private static string CimaDir() =>
            System.IO.Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Aurora", "CimaBox");

        private static string CimaExe() => System.IO.Path.Join(CimaDir(), "CIMABox.exe");

        private static bool CimaRunning()
        {
            var exe = CimaExe();
            foreach (var p in Process.GetProcessesByName("CIMABox"))
            {
                try
                {
                    if (string.Equals(p.MainModule?.FileName, exe, StringComparison.OrdinalIgnoreCase)) return true;
                }
                catch
                {
                    // not allowed to look at this process, so it is not ours
                }
                finally
                {
                    p.Dispose();
                }
            }
            return false;
        }

        private static string CimaInstalledVersion()
        {
            var exe = CimaExe();
            if (!File.Exists(exe)) return null;
            var info = FileVersionInfo.GetVersionInfo(exe);
            var v = info.ProductVersion ?? info.FileVersion;
            return string.IsNullOrWhiteSpace(v) ? "unknown" : v.Trim();
        }

        /// <summary>Installed version, running state, and the newest published release.</summary>
        public async Task<string> CimaBoxStatus()
        {
            var result = new JsonObject
            {
                ["installed"] = File.Exists(CimaExe()),
                ["path"] = CimaExe(),
                ["version"] = CimaInstalledVersion(),
                ["running"] = CimaRunning()
            };
            try
            {
                var json = await CimaHttp.GetStringAsync($"https://api.github.com/repos/{CimaRepo}/releases/latest");
                var release = JsonNode.Parse(json);
                result["latest"] = release?["tag_name"]?.GetValue<string>();
                result["notes"] = release?["body"]?.GetValue<string>();
                result["published"] = release?["published_at"]?.GetValue<string>();
            }
            catch (Exception ex)
            {
                result["latestError"] = ex.Message;
            }
            return result.ToJsonString();
        }

        /// <summary>Downloads the newest official CIMABox.exe, replacing the installed one when it is not running.</summary>
        public async Task<string> CimaBoxInstall()
        {
            try
            {
                if (CimaRunning()) return new JsonObject { ["error"] = "running" }.ToJsonString();
                Directory.CreateDirectory(CimaDir());
                var tmp = System.IO.Path.Join(CimaDir(), "CIMABox.exe.download");
                using (var res = await CimaHttp.GetAsync($"https://github.com/{CimaRepo}/releases/latest/download/CIMABox.exe",
                           HttpCompletionOption.ResponseHeadersRead))
                {
                    res.EnsureSuccessStatusCode();
                    await using var src = await res.Content.ReadAsStreamAsync();
                    await using var dst = File.Create(tmp);
                    await src.CopyToAsync(dst);
                }

                var length = new FileInfo(tmp).Length;
                var head = new byte[2];
                using (var fs = File.OpenRead(tmp)) fs.ReadExactly(head, 0, 2);
                if (length < 1_000_000 || head[0] != (byte)'M' || head[1] != (byte)'Z')
                {
                    File.Delete(tmp);
                    return new JsonObject { ["error"] = "The download was not a Windows program." }.ToJsonString();
                }

                lock (CimaLock)
                {
                    File.Move(tmp, CimaExe(), true);
                }
                return new JsonObject { ["ok"] = true, ["version"] = CimaInstalledVersion() }.ToJsonString();
            }
            catch (Exception ex)
            {
                return new JsonObject { ["error"] = ex.Message }.ToJsonString();
            }
        }

        public string CimaBoxLaunch()
        {
            try
            {
                if (!File.Exists(CimaExe())) return new JsonObject { ["error"] = "not installed" }.ToJsonString();
                Process.Start(new ProcessStartInfo
                {
                    FileName = CimaExe(),
                    WorkingDirectory = CimaDir(),
                    UseShellExecute = true
                })?.Dispose();
                return new JsonObject { ["ok"] = true }.ToJsonString();
            }
            catch (Exception ex)
            {
                return new JsonObject { ["error"] = ex.Message }.ToJsonString();
            }
        }

        public void CimaBoxOpenFolder()
        {
            Directory.CreateDirectory(CimaDir());
            Process.Start(new ProcessStartInfo { FileName = CimaDir(), UseShellExecute = true })?.Dispose();
        }
    }
}
