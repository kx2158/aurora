using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Windows.Media.Control;

namespace VRCX
{
    public partial class AppApi
    {
        private static GlobalSystemMediaTransportControlsSessionManager _neonMedia;
        private static ulong _neonLastIdle, _neonLastKernel, _neonLastUser;
        private static double _neonCpu;

        /// <summary>
        /// One snapshot of the things the Neon chatbox can show: active window, music, CPU, RAM, battery, idle time.
        /// Everything stays on this PC. Returns JSON.
        /// </summary>
        public string GetNeonSystemInfo()
        {
            var result = new Dictionary<string, object>();
            try { AddWindow(result); } catch { }
            try { AddSystem(result); } catch { }
            try { AddMedia(result); } catch { }
            try { AddNetwork(result); } catch { }
            try { AddGpu(result); } catch { }
            return JsonSerializer.Serialize(result);
        }

        private static void AddWindow(Dictionary<string, object> result)
        {
            var hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero)
                return;
            var sb = new StringBuilder(256);
            GetWindowText(hwnd, sb, sb.Capacity);
            result["window"] = sb.ToString();
            GetWindowThreadProcessId(hwnd, out var pid);
            try { result["app"] = Process.GetProcessById((int)pid).ProcessName; } catch { }
        }

        private static void AddSystem(Dictionary<string, object> result)
        {
            var mem = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
            if (GlobalMemoryStatusEx(ref mem))
                result["ram"] = (int)mem.dwMemoryLoad;

            if (GetSystemTimes(out var idle, out var kernel, out var user))
            {
                var i = ToU64(idle); var k = ToU64(kernel); var u = ToU64(user);
                var total = (k - _neonLastKernel) + (u - _neonLastUser);
                var idleDelta = i - _neonLastIdle;
                if (_neonLastKernel != 0 && total > 0)
                    _neonCpu = Math.Max(0, Math.Min(100, 100.0 * (total - idleDelta) / total));
                _neonLastIdle = i; _neonLastKernel = k; _neonLastUser = u;
                result["cpu"] = (int)Math.Round(_neonCpu);
            }

            if (GetSystemPowerStatus(out var power) && power.BatteryLifePercent <= 100)
            {
                result["battery"] = (int)power.BatteryLifePercent;
                result["charging"] = power.ACLineStatus == 1;
            }

            var lii = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
            if (GetLastInputInfo(ref lii))
                result["idleSeconds"] = (int)((Environment.TickCount64 - lii.dwTime) / 1000);
        }

        private static void AddMedia(Dictionary<string, object> result)
        {
            _neonMedia ??= GlobalSystemMediaTransportControlsSessionManager.RequestAsync().GetAwaiter().GetResult();
            var session = _neonMedia.GetCurrentSession();
            if (session == null)
                return;
            var props = session.TryGetMediaPropertiesAsync().GetAwaiter().GetResult();
            var status = session.GetPlaybackInfo().PlaybackStatus;
            result["musicPlaying"] = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            result["song"] = props.Title ?? "";
            result["artist"] = props.Artist ?? "";
            result["musicApp"] = session.SourceAppUserModelId ?? "";

            // every media session (Spotify, Chrome, Brave...) so the chatbox can pick between them
            var list = new List<Dictionary<string, object>>();
            foreach (var s in _neonMedia.GetSessions())
            {
                try
                {
                    var p = s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult();
                    list.Add(new Dictionary<string, object>
                    {
                        ["id"] = s.SourceAppUserModelId ?? "",
                        ["title"] = p.Title ?? "",
                        ["artist"] = p.Artist ?? "",
                        ["playing"] = s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing
                    });
                }
                catch { }
            }
            result["sessions"] = list;
        }

        private static long _neonNetBytesDown, _neonNetBytesUp, _neonNetTicks;
        private static double _neonDownKb, _neonUpKb;

        private static void AddNetwork(Dictionary<string, object> result)
        {
            long down = 0, up = 0;
            foreach (var nic in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up
                    || nic.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Loopback)
                    continue;
                var stats = nic.GetIPv4Statistics();
                down += stats.BytesReceived;
                up += stats.BytesSent;
            }
            var now = Environment.TickCount64;
            if (_neonNetTicks != 0 && now > _neonNetTicks)
            {
                var seconds = (now - _neonNetTicks) / 1000.0;
                _neonDownKb = (down - _neonNetBytesDown) / 1024.0 / seconds;
                _neonUpKb = (up - _neonNetBytesUp) / 1024.0 / seconds;
            }
            _neonNetBytesDown = down; _neonNetBytesUp = up; _neonNetTicks = now;
            result["netDownKb"] = (int)Math.Max(0, _neonDownKb);
            result["netUpKb"] = (int)Math.Max(0, _neonUpKb);
        }

        private static long _neonGpuChecked;
        private static int _neonGpu = -1, _neonVram = -1;

        // Reads NVIDIA GPU load through nvidia-smi (only if it is installed). Checked every 5 seconds.
        private static void AddGpu(Dictionary<string, object> result)
        {
            var now = Environment.TickCount64;
            if (now - _neonGpuChecked > 5000)
            {
                _neonGpuChecked = now;
                try
                {
                    var psi = new ProcessStartInfo("nvidia-smi", "--query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits")
                    {
                        RedirectStandardOutput = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    };
                    using var proc = Process.Start(psi);
                    if (proc != null && proc.WaitForExit(1500))
                    {
                        var parts = proc.StandardOutput.ReadLine()?.Split(',');
                        if (parts != null && parts.Length >= 3)
                        {
                            _neonGpu = int.Parse(parts[0].Trim());
                            _neonVram = (int)Math.Round(100.0 * double.Parse(parts[1].Trim()) / double.Parse(parts[2].Trim()));
                        }
                    }
                }
                catch { _neonGpu = -1; _neonVram = -1; }
            }
            if (_neonGpu >= 0) { result["gpu"] = _neonGpu; result["vram"] = _neonVram; }
        }

        private static ulong ToU64(FILETIME t) => ((ulong)t.dwHighDateTime << 32) | t.dwLowDateTime;

        [StructLayout(LayoutKind.Sequential)] private struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }
        [StructLayout(LayoutKind.Sequential)] private struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
        [StructLayout(LayoutKind.Sequential)]
        private struct SYSTEM_POWER_STATUS { public byte ACLineStatus; public byte BatteryFlag; public byte BatteryLifePercent; public byte SystemStatusFlag; public uint BatteryLifeTime; public uint BatteryFullLifeTime; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
        private struct MEMORYSTATUSEX { public uint dwLength; public uint dwMemoryLoad; public ulong ullTotalPhys; public ulong ullAvailPhys; public ulong ullTotalPageFile; public ulong ullAvailPageFile; public ulong ullTotalVirtual; public ulong ullAvailVirtual; public ulong ullAvailExtendedVirtual; }

        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        [DllImport("user32.dll")] private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
        [DllImport("kernel32.dll")] private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);
        [DllImport("kernel32.dll")] private static extern bool GetSystemTimes(out FILETIME idle, out FILETIME kernel, out FILETIME user);
        [DllImport("kernel32.dll")] private static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS status);
    }
}
