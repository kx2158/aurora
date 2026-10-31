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
