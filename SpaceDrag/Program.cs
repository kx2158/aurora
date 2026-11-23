using System;
using System.Diagnostics;
using System.IO;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using Valve.VR;

namespace AuroraSpaceDrag;

/// <summary>
/// Aurora's space drag. A small SteamVR overlay app (overlay type, so SteamVR gives it controller input and lets it
/// move the play space) that runs at about 90 Hz next to Aurora:
///
///  - it registers its own action manifest, whose default bindings put the drag on the grip of every common
///    controller, so there is nothing to bind by hand (SteamVR Input is only used to read the buttons);
///  - while a hand holds the button, DragMath moves the play space so the hand stays still in the world;
///  - Aurora's card controls it through spacedrag.json and reads spacedrag-status.json (both next to Aurora's data).
///
///   Aurora.SpaceDrag.exe [--settings path] [--status path]
/// </summary>
internal static class Program
{
    private const string AppKey = "aurora.spacedrag";
    private const string ActionSet = "/actions/spacedrag";
    private const string ActionLeft = "/actions/spacedrag/in/drag_left";
    private const string ActionRight = "/actions/spacedrag/in/drag_right";
    private const float ComfortStep = 0.2f; // meters per jump in comfort mode
    private const int TickMs = 11; // about 90 Hz

    private static string _settingsPath;
    private static string _statusPath;
    private static string _baseDir;

    // the one-button switch that lives in the SteamVR dashboard
    private const string OverlayKey = "aurora.spacedrag.switch";
    private static ulong _dashMain, _dashThumb;
    private static bool? _shownEnabled;

    private static void CreateSwitch()
    {
        var overlay = OpenVR.Overlay;
        if (overlay == null) return;
        _dashMain = 0; _dashThumb = 0; _shownEnabled = null;
        if (overlay.CreateDashboardOverlay(OverlayKey, "Space Drag", ref _dashMain, ref _dashThumb) != EVROverlayError.None) { _dashMain = 0; return; }
        overlay.SetOverlayWidthInMeters(_dashMain, 1.0f);
        overlay.SetOverlayInputMethod(_dashMain, VROverlayInputMethod.Mouse);
        var scale = new HmdVector2_t { v0 = 512f, v1 = 256f };
        overlay.SetOverlayMouseScale(_dashMain, ref scale);
    }

    private static void ShowSwitch(bool enabled)
    {
        var overlay = OpenVR.Overlay;
        if (overlay == null || _dashMain == 0 || _shownEnabled == enabled) return;
        var n = enabled ? "on" : "off";
        overlay.SetOverlayFromFile(_dashMain, Path.Join(_baseDir, "openvr", "dash_" + n + ".png"));
        if (_dashThumb != 0) overlay.SetOverlayFromFile(_dashThumb, Path.Join(_baseDir, "openvr", "thumb_" + n + ".png"));
        _shownEnabled = enabled;
    }

    /// <summary>The tile is 512 wide: the left part (x below this) is the on/off switch, the right part is Reset.
    /// tools/spacedrag_dash_images.py draws the tile on the same split.</summary>
    private const float ResetSplitX = 316f;

    /// <summary>What was clicked on the dashboard tile since the last call.</summary>
    private static void TileClicks(out bool toggle, out bool reset)
    {
        toggle = false;
        reset = false;
        var overlay = OpenVR.Overlay;
        if (overlay == null || _dashMain == 0) return;
        var e = new VREvent_t();
        while (overlay.PollNextOverlayEvent(_dashMain, ref e, (uint)Marshal.SizeOf(e)))
        {
            if ((EVREventType)e.eventType != EVREventType.VREvent_MouseButtonDown) continue;
            if (e.data.mouse.x < ResetSplitX) toggle = true;
            else reset = true;
        }
    }

    [STAThread]
    private static int Main(string[] args)
    {
        using var single = new Mutex(true, "Aurora.SpaceDrag.Single", out var first);
        if (!first) return 0; // already running

        _baseDir = AppContext.BaseDirectory;
        var dataDir = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Neon");
        _settingsPath = Path.Join(dataDir, "spacedrag.json");
        _statusPath = Path.Join(dataDir, "spacedrag-status.json");
        for (var i = 0; i + 1 < args.Length; i++)
        {
            if (args[i] == "--settings") _settingsPath = args[i + 1];
            else if (args[i] == "--status") _statusPath = args[i + 1];
        }

        Directory.CreateDirectory(Path.GetDirectoryName(_statusPath)!);
        var status = new Status();
        try
        {
            Run(status);
        }
        catch (Exception ex)
        {
            status.Error = ex.Message;
            status.Running = false;
            WriteStatus(status);
            return 1;
        }

        status.Running = false;
        WriteStatus(status);
        return 0;
    }

    private sealed class Status
    {
        public bool Running { get; set; } = true;
        public bool SteamVr { get; set; }
        /// <summary>SteamVR hands us the buttons (the default bindings are loaded).</summary>
        public bool Bound { get; set; }
        public bool Enabled { get; set; } = true;
        public bool Dragging { get; set; }
        public string Hand { get; set; }
        public double[] Offset { get; set; }
        public string Error { get; set; }
        public long Updated { get; set; }
    }

    private static DateTime _lastStatus = DateTime.MinValue;
    private static string _lastBody = "";

    /// <summary>Writes the status file when something changed, and at least once a second so Aurora can tell the helper is alive.</summary>
    private static void WriteStatus(Status s)
    {
        try
        {
            s.Updated = 0;
            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var body = JsonSerializer.Serialize(s, options);
            if (body == _lastBody && DateTime.UtcNow - _lastStatus < TimeSpan.FromSeconds(1)) return;
            _lastBody = body;
            _lastStatus = DateTime.UtcNow;
            s.Updated = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var tmp = _statusPath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(s, options));
            File.Move(tmp, _statusPath, true);
        }
        catch
        {
            // Aurora may be reading the file right now; the next write will do
        }
    }

    private static bool SteamVrRunning() => Process.GetProcessesByName("vrserver").Length > 0;

    private static float[,] ToArray(HmdMatrix34_t m) => new[,]
    {
        { m.m0, m.m1, m.m2, m.m3 },
        { m.m4, m.m5, m.m6, m.m7 },
        { m.m8, m.m9, m.m10, m.m11 }
    };

    private static HmdMatrix34_t ToMatrix(float[,] a) => new()
    {
        m0 = a[0, 0], m1 = a[0, 1], m2 = a[0, 2], m3 = a[0, 3],
        m4 = a[1, 0], m5 = a[1, 1], m6 = a[1, 2], m7 = a[1, 3],
        m8 = a[2, 0], m9 = a[2, 1], m10 = a[2, 2], m11 = a[2, 3]
    };

    private static Vector3 Position(HmdMatrix34_t m) => new(m.m3, m.m7, m.m11);
    private static Vector3 Translation(float[,] a) => new(a[0, 3], a[1, 3], a[2, 3]);

    private static void Run(Status status)
    {
        var settings = DragSettings.Load(_settingsPath);
        var settingsStamp = File.Exists(_settingsPath) ? File.GetLastWriteTimeUtc(_settingsPath) : DateTime.MinValue;
        var nextSettingsCheck = DateTime.MinValue;
        var seenReset = settings.ResetCounter;

        var inited = false;
        var nextInit = DateTime.MinValue;
        ulong setHandle = 0, leftAction = 0, rightAction = 0;
        var boundUntil = DateTime.MinValue;

        // drag state
        string hand = null; // "left", "right" or null
        var hand0 = Vector3.Zero;
        var t0 = Vector3.Zero;
        float[,] basis = null; // the play space matrix the current drag started from (rotation is never changed)
        float[,] applied = null; // what we last gave SteamVR; kept after release so the offset stays
        Vector3 lastTranslation = Vector3.Zero;
        var lastWrite = DateTime.MinValue;
        var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
        var actionSetSize = (uint)Marshal.SizeOf<VRActiveActionSet_t>();
        var dataSize = (uint)Marshal.SizeOf<InputDigitalActionData_t>();
        var evt = new VREvent_t();

        while (true)
        {
            Thread.Sleep(TickMs);
            var now = DateTime.UtcNow;

            // settings: re-read when the file changes
            if (now >= nextSettingsCheck)
            {
                nextSettingsCheck = now.AddMilliseconds(300);
                var stamp = File.Exists(_settingsPath) ? File.GetLastWriteTimeUtc(_settingsPath) : DateTime.MinValue;
                if (stamp != settingsStamp)
                {
                    settingsStamp = stamp;
                    settings = DragSettings.Load(_settingsPath);
                }
            }

            // connect to SteamVR (only when it is already running, so this helper never starts it)
            if (!inited)
            {
                status.SteamVr = false;
                status.Bound = false;
                if (now < nextInit) continue;
                nextInit = now.AddSeconds(3);
                if (!SteamVrRunning())
                {
                    WriteStatus(status);
                    continue;
                }

                var err = EVRInitError.None;
                OpenVR.Init(ref err, EVRApplicationType.VRApplication_Overlay);
                if (err != EVRInitError.None || OpenVR.System == null)
                {
                    status.Error = "OpenVR init: " + err;
                    WriteStatus(status);
                    continue;
                }

                status.Error = null;
                var manifest = Path.Join(_baseDir, "openvr", "manifest.vrmanifest");
                var actions = Path.Join(_baseDir, "openvr", "action_manifest.json");
                OpenVR.Applications?.AddApplicationManifest(manifest, true);
                OpenVR.Applications?.IdentifyApplication((uint)Environment.ProcessId, AppKey);
                var inErr = OpenVR.Input.SetActionManifestPath(actions);
                if (inErr != EVRInputError.None)
                {
                    status.Error = "SteamVR Input: " + inErr;
                    OpenVR.Shutdown();
                    WriteStatus(status);
                    continue;
                }

                OpenVR.Input.GetActionSetHandle(ActionSet, ref setHandle);
                OpenVR.Input.GetActionHandle(ActionLeft, ref leftAction);
                OpenVR.Input.GetActionHandle(ActionRight, ref rightAction);
                CreateSwitch();
                inited = true;
                status.SteamVr = true;
                applied = null;
                hand = null;
            }

            var system = OpenVR.System;
            if (system == null)
            {
                inited = false;
                continue;
            }

            // SteamVR asks us to quit when it closes: let go and wait for the next start
            var quit = false;
            while (system.PollNextEvent(ref evt, (uint)Marshal.SizeOf(evt)))
            {
                var type = (EVREventType)evt.eventType;
                if (type == EVREventType.VREvent_Quit)
                {
                    quit = true;
                }
                else if ((type == EVREventType.VREvent_StandingZeroPoseReset || type == EVREventType.VREvent_ChaperoneUniverseHasChanged) &&
                         hand == null && (now - lastWrite).TotalSeconds > 1.0)
                {
                    // someone else (SteamVR room setup, another tool) moved the play space: what we remember is stale
                    applied = null;
                }
            }

            if (quit)
            {
                _dashMain = 0; _dashThumb = 0;
                system.AcknowledgeQuit_Exiting();
                OpenVR.Shutdown();
                inited = false;
                hand = null;
                applied = null;
                status.SteamVr = false;
                status.Dragging = false;
                WriteStatus(status);
                nextInit = now.AddSeconds(5);
                continue;
            }

            // the tile in the SteamVR dashboard: the switch flips "enabled" and saves it, so Aurora's card follows;
            // the Reset button puts the play space back
            TileClicks(out var clickedSwitch, out var clickedReset);
            if (clickedSwitch)
            {
                settings.Enabled = !settings.Enabled;
                settings.Save(_settingsPath);
                settingsStamp = File.Exists(_settingsPath) ? File.GetLastWriteTimeUtc(_settingsPath) : DateTime.MinValue;
            }

            ShowSwitch(settings.Enabled);
            status.Enabled = settings.Enabled;

            // reset request from the card
            if (settings.ResetCounter != seenReset || clickedReset)
            {
                seenReset = settings.ResetCounter;
                var setup = OpenVR.ChaperoneSetup;
                if (setup != null)
                {
                    setup.RevertWorkingCopy();
                    setup.HideWorkingSetPreview();
                }

                applied = null;
                hand = null;
            }

            // buttons
            bool left = false, right = false;
            if (settings.Enabled)
            {
                var active = new[] { new VRActiveActionSet_t { ulActionSet = setHandle, ulRestrictedToDevice = OpenVR.k_ulInvalidInputValueHandle, nPriority = 0 } };
                if (OpenVR.Input.UpdateActionState(active, actionSetSize) == EVRInputError.None)
                {
                    var l = new InputDigitalActionData_t();
                    var r = new InputDigitalActionData_t();
                    OpenVR.Input.GetDigitalActionData(leftAction, ref l, dataSize, OpenVR.k_ulInvalidInputValueHandle);
                    OpenVR.Input.GetDigitalActionData(rightAction, ref r, dataSize, OpenVR.k_ulInvalidInputValueHandle);
                    if (l.bActive || r.bActive) boundUntil = now.AddSeconds(3);
                    left = l.bActive && l.bState;
                    right = r.bActive && r.bState;
                }
            }

            status.Bound = now < boundUntil;

            var driver = DragMath.PickHand(left, right, hand, settings.Hand);
            if (driver != hand)
            {
                hand = driver;
                if (hand != null)
                {
                    // grab: remember where the hand and the play space are right now
                    var setup = OpenVR.ChaperoneSetup;
                    var m = new HmdMatrix34_t();
                    if (setup == null) { hand = null; }
                    else
                    {
                        // The working copy is the truth: if we have nothing of our own in it yet (or someone reset the
                        // play space) load what SteamVR really has first, then start from whatever it holds now.
                        if (applied == null) setup.RevertWorkingCopy();
                        if (!setup.GetWorkingStandingZeroPoseToRawTrackingPose(ref m)) { hand = null; }
                        else applied = ToArray(m);

                        var idx = system.GetTrackedDeviceIndexForControllerRole(hand == "left" ? ETrackedControllerRole.LeftHand : ETrackedControllerRole.RightHand);
                        if (hand != null && idx != OpenVR.k_unTrackedDeviceIndexInvalid)
                        {
                            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseRawAndUncalibrated, 0, poses);
                            if (poses[idx].bPoseIsValid && applied != null)
                            {
                                basis = applied;
                                t0 = Translation(applied);
                                lastTranslation = t0;
                                hand0 = Position(poses[idx].mDeviceToAbsoluteTracking);
                            }
                            else hand = null;
                        }
                        else hand = null;
                    }
                }
            }

            status.Dragging = hand != null;
            status.Hand = hand;

            if (hand != null && basis != null)
            {
                var idx = system.GetTrackedDeviceIndexForControllerRole(hand == "left" ? ETrackedControllerRole.LeftHand : ETrackedControllerRole.RightHand);
                if (idx != OpenVR.k_unTrackedDeviceIndexInvalid)
                {
                    system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseRawAndUncalibrated, 0, poses);
                    if (poses[idx].bPoseIsValid)
                    {
                        var pos = Position(poses[idx].mDeviceToAbsoluteTracking);
                        var target = DragMath.Offset(t0, hand0, pos, settings.Multiplier, settings.AllowVertical);
                        var next = settings.Comfort ? DragMath.Quantize(lastTranslation, target, ComfortStep) : target;
                        if ((next - lastTranslation).LengthSquared() > 1e-10f)
                        {
                            var matrix = DragMath.WithTranslation(basis, next);
                            if (DragMath.IsSane(matrix))
                            {
                                var setup = OpenVR.ChaperoneSetup;
                                var hm = ToMatrix(matrix);
                                setup.SetWorkingStandingZeroPoseToRawTrackingPose(ref hm);
                                setup.ShowWorkingSetPreview();
                                applied = matrix;
                                lastTranslation = next;
                                lastWrite = now;
                            }
                        }
                    }
                }
            }

            status.Offset = applied == null ? null : new double[] { applied[0, 3], applied[1, 3], applied[2, 3] };
            WriteStatus(status);
        }
    }
}
