using System;
using System.Diagnostics.CodeAnalysis;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using CefSharp;
using CefSharp.WinForms;
using NLog;

namespace VRCX
{
    /// <summary>
    /// Aurora's desktop overlay: a small always-on-top panel (timers, chatbox, mic) that a global hotkey
    /// shows over VRChat and hides again. It is a normal window of Aurora's own, nothing is injected into
    /// the game, so it only appears over VRChat in windowed or borderless mode, not exclusive fullscreen.
    /// </summary>
    [SuppressMessage("Interoperability", "CA1416:Validate platform compatibility")]
    public class DeskOverlayForm : Form
    {
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();
        public static DeskOverlayForm Instance;
        public static string LastState = "{}";

        private readonly ChromiumWebBrowser _browser;
        private IntPtr _previousWindow = IntPtr.Zero;
        private DateTime _shownAt = DateTime.MinValue;

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateRoundRectRgn(int left, int top, int right, int bottom, int width, int height);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        private DeskOverlayForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(24, 25, 29);
            Size = new Size(400, 620);
            Text = "Aurora overlay";
            try
            {
                Icon = MainForm.Instance?.Icon;
            }
            catch
            {
                // no icon, fine
            }

            _browser = new ChromiumWebBrowser(Program.LaunchDebug ? "http://localhost:9000/desk.html" : "file://vrcx/desk.html")
            {
                RequestHandler = new CustomRequestHandler(),
                MenuHandler = new CustomMenuHandler(),
                DragHandler = new CustomDragHandler(),
                BrowserSettings = { DefaultEncoding = "UTF-8" },
                Dock = DockStyle.Fill
            };
            _browser.JavascriptObjectRepository.NameConverter = null;
            _browser.JavascriptObjectRepository.Register("DeskApi", DeskApi.Instance);
            Controls.Add(_browser);

            // clicking anywhere else (back into VRChat) puts the overlay away
            Deactivate += (_, _) =>
            {
                if ((DateTime.Now - _shownAt).TotalMilliseconds > 300)
                    HideOverlay(false);
            };
            Resize += (_, _) => ApplyRoundCorners();
            ApplyRoundCorners();
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var cp = base.CreateParams;
                cp.ExStyle |= 0x00000080; // WS_EX_TOOLWINDOW: no Alt+Tab entry
                return cp;
            }
        }

        private void ApplyRoundCorners()
        {
            try
            {
                var region = CreateRoundRectRgn(0, 0, Width + 1, Height + 1, 28, 28);
                Region = Region.FromHrgn(region);
                DeleteObject(region);
            }
            catch (Exception ex)
            {
                logger.Debug(ex);
            }
        }

        /// <summary>Shows the overlay if it is hidden, hides it if it is showing. Runs on the UI thread.</summary>
        public static void Toggle()
        {
            if (MainForm.Instance == null)
                return;
            if (MainForm.Instance.InvokeRequired)
            {
                MainForm.Instance.BeginInvoke(new Action(Toggle));
                return;
            }
            try
            {
                Instance ??= new DeskOverlayForm();
                if (Instance.Visible)
                    Instance.HideOverlay(true);
                else
                    Instance.ShowOverlay();
            }
            catch (Exception ex)
            {
                logger.Error(ex, "Desktop overlay");
            }
        }

        private void ShowOverlay()
        {
            _previousWindow = GetForegroundWindow();
            // on the screen you are looking at, on the right, vertically centred
            var screen = _previousWindow != IntPtr.Zero ? Screen.FromHandle(_previousWindow) : Screen.PrimaryScreen;
            var area = screen.WorkingArea;
            var height = Math.Min(620, area.Height - 48);
            Size = new Size(400, height);
            Location = new Point(area.Right - Width - 24, area.Top + (area.Height - Height) / 2);
            _shownAt = DateTime.Now;
            Show();
            Activate();
            SetForegroundWindow(Handle);
            _browser.Focus();
            PushState(LastState);
            if (_browser.CanExecuteJavascriptInMainFrame)
                _browser.ExecuteScriptAsync("window.deskShown && window.deskShown()");
        }

        public void HideOverlay(bool giveFocusBack)
        {
            if (!Visible)
                return;
            Hide();
            if (giveFocusBack && _previousWindow != IntPtr.Zero)
                SetForegroundWindow(_previousWindow);
        }

        public static void HideFromPage()
        {
            if (Instance == null || MainForm.Instance == null)
                return;
            MainForm.Instance.BeginInvoke(new Action(() => Instance.HideOverlay(true)));
        }

        /// <summary>The main app sends its state (timers, chatbox, mic) here; the overlay page draws it.</summary>
        public static void PushState(string json)
        {
            LastState = string.IsNullOrEmpty(json) ? "{}" : json;
            var browser = Instance?._browser;
            if (browser == null || browser.IsDisposed || !browser.CanExecuteJavascriptInMainFrame)
                return;
            browser.ExecuteScriptAsync("window.deskState", LastState);
        }
    }

    /// <summary>What the overlay page can call: DeskApi.Command(name, value), DeskApi.Hide(), DeskApi.Ready().</summary>
    public class DeskApi
    {
        public static readonly DeskApi Instance = new();

        public void Command(string command, string value)
        {
            var browser = MainForm.Instance?.Browser;
            if (browser == null || browser.IsLoading || !browser.CanExecuteJavascriptInMainFrame)
                return;
            browser.ExecuteScriptAsync("window?.$bridge?.deskCommand", command ?? "", value ?? "");
        }

        public void Hide()
        {
            DeskOverlayForm.HideFromPage();
        }

        public void Ready()
        {
            DeskOverlayForm.PushState(DeskOverlayForm.LastState);
        }
    }

    /// <summary>The global hotkey that opens the overlay, for example "Ctrl+Shift+A".</summary>
    [SuppressMessage("Interoperability", "CA1416:Validate platform compatibility")]
    public static class DeskHotkey
    {
        public const int WM_HOTKEY = 0x0312;
        public const int Id = 0xA0A0;
        private const uint MOD_ALT = 0x1, MOD_CONTROL = 0x2, MOD_SHIFT = 0x4, MOD_WIN = 0x8, MOD_NOREPEAT = 0x4000;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        /// <summary>Registers the combo, an empty string turns the hotkey off. False if Windows refused (taken by another app).</summary>
        public static bool Set(string combo)
        {
            var form = MainForm.Instance;
            if (form == null)
                return false;
            if (form.InvokeRequired)
                return (bool)form.Invoke(new Func<bool>(() => Set(combo)));

            UnregisterHotKey(form.Handle, Id);
            if (string.IsNullOrWhiteSpace(combo))
                return true;

            uint mods = 0;
            Keys key = Keys.None;
            foreach (var raw in combo.Split('+'))
            {
                var part = raw.Trim();
                switch (part.ToLowerInvariant())
                {
                    case "ctrl":
                    case "control":
                        mods |= MOD_CONTROL;
                        break;
                    case "alt":
                        mods |= MOD_ALT;
                        break;
                    case "shift":
                        mods |= MOD_SHIFT;
                        break;
                    case "win":
                        mods |= MOD_WIN;
                        break;
                    default:
                        if (part.Length == 1 && char.IsDigit(part[0]))
                            part = "D" + part;
                        if (!Enum.TryParse(part, true, out key))
                            return false;
                        break;
                }
            }
            if (key == Keys.None)
                return false;
            return RegisterHotKey(form.Handle, Id, mods | MOD_NOREPEAT, (uint)key);
        }
    }
}
