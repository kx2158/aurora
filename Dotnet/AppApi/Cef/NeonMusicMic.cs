using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace VRCX
{
    /// <summary>
    /// Neon music to mic: takes the sound of one app (Spotify, Apple Music, a browser...), mixes it with your
    /// real microphone and plays the mix into an output device. Point that device at a virtual audio cable
    /// (like VB-Cable) and pick the cable's other end as the microphone in VRChat.
    /// Only the chosen app is captured, so VRChat's own sound never loops back.
    /// </summary>
    public partial class AppApi
    {
        private static NeonMusicMic _neonMusicMic;
        private static string _neonMusicMicError = "";

        /// <summary>All active sound outputs and microphones as JSON: { render: [{id,name}], capture: [{id,name}] }.</summary>
        public string GetNeonAudioDevices()
        {
            var result = new Dictionary<string, List<Dictionary<string, string>>>
            {
                ["render"] = new(),
                ["capture"] = new()
            };
            try
            {
                using var en = new MMDeviceEnumerator();
                foreach (var d in en.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
                    result["render"].Add(new() { ["id"] = d.ID, ["name"] = d.FriendlyName });
                foreach (var d in en.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active))
                    result["capture"].Add(new() { ["id"] = d.ID, ["name"] = d.FriendlyName });
            }
            catch
            {
            }

            return JsonSerializer.Serialize(result);
        }

        /// <summary>Names of the apps that currently have a sound session, as a JSON array.</summary>
        public string GetNeonAudioApps()
        {
            var names = new SortedSet<string>();
            try
            {
                using var en = new MMDeviceEnumerator();
                foreach (var dev in en.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
                {
                    var sessions = dev.AudioSessionManager.Sessions;
                    for (var i = 0; i < sessions.Count; i++)
                    {
                        var pid = (int)sessions[i].GetProcessID;
                        if (pid == 0 || pid == Environment.ProcessId)
                            continue;
                        try { names.Add(Process.GetProcessById(pid).ProcessName); } catch { }
                    }
                }
            }
            catch
            {
            }

            return JsonSerializer.Serialize(names);
        }

        /// <summary>Starts the music-to-mic mix. json: { app, loopDevice, mic, out, musicVol, micVol }.</summary>
        public bool NeonMusicMicStart(string json)
        {
            NeonMusicMicStop();
            _neonMusicMicError = "";
            try
            {
                using var doc = JsonDocument.Parse(json);
                var r = doc.RootElement;
                string Str(string k) => r.TryGetProperty(k, out var v) ? v.GetString() ?? "" : "";
                double Num(string k, double d) => r.TryGetProperty(k, out var v) && v.TryGetDouble(out var n) ? n : d;
                var mix = new NeonMusicMic(Str("app"), Str("loopDevice"), Str("mic"), Str("out"), (float)Num("musicVol", 0.8), (float)Num("micVol", 1.0));
                // audio objects must live in a multi-threaded apartment, the browser thread may not be one
                Exception failure = null;
                var starter = new Thread(() =>
                {
                    try { mix.Start(); }
                    catch (Exception e) { failure = e; }
                });
                starter.SetApartmentState(ApartmentState.MTA);
                starter.Start();
                starter.Join();
                if (failure != null)
                {
                    mix.Dispose();
                    throw failure;
                }

                _neonMusicMic = mix;
                return true;
            }
            catch (Exception e)
            {
                NeonMusicMic.Log.Error(e, "Music to mic failed to start");
                _neonMusicMicError = e.Message;
                _neonMusicMic?.Dispose();
                _neonMusicMic = null;
                return false;
            }
        }

        public void NeonMusicMicStop()
        {
            try { _neonMusicMic?.Dispose(); } catch { }
            _neonMusicMic = null;
        }

        public void NeonMusicMicVolume(double music, double mic)
        {
            _neonMusicMic?.SetVolumes((float)music, (float)mic);
        }

        public string NeonMusicMicStatus()
        {
            return JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["running"] = _neonMusicMic != null,
                ["error"] = _neonMusicMicError,
                ["micPeak"] = _neonMusicMic?.MicPeak ?? 0f,
                ["musicPeak"] = _neonMusicMic?.MusicPeak ?? 0f,
                ["outPeak"] = _neonMusicMic?.OutPeak ?? 0f,
                ["info"] = _neonMusicMic?.Info ?? ""

            });
        }
    }

    internal sealed class NeonMusicMic : IDisposable
    {
        internal static readonly NLog.Logger Log = NLog.LogManager.GetCurrentClassLogger();
        private readonly string _app, _loopDevice, _mic, _out;
        private ProcessLoopback _appCapture;
        private WasapiCapture _micCapture, _loopCapture;
        private WasapiOut _output;
        private VolumeSampleProvider _musicVol, _micVol;
        private float _musicStart, _micStart;
        private int _rate = 48000, _outChannels = 2;
        public volatile float MicPeak, MusicPeak, OutPeak;
        public string Info = "";

        public NeonMusicMic(string app, string loopDevice, string mic, string output, float musicVol, float micVol)
        {
            _app = app; _loopDevice = loopDevice; _mic = mic; _out = output;
            _musicStart = musicVol; _micStart = micVol;
        }

        public void Start()
        {
            using var en = new MMDeviceEnumerator();
            // mix at the output device's own sample rate so Windows never has to convert
            var outDev = string.IsNullOrEmpty(_out) ? en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia) : en.GetDevice(_out);
            _rate = outDev.AudioClient.MixFormat.SampleRate;
            _outChannels = outDev.AudioClient.MixFormat.Channels;
            var mixer = new MixingSampleProvider(WaveFormat.CreateIeeeFloatWaveFormat(_rate, 2)) { ReadFully = true };

            // music: one app (process loopback) or a whole output device
            BufferedWaveProvider musicBuf = null;
            if (!string.IsNullOrEmpty(_app))
            {
                _appCapture = ProcessLoopback.Start(FindProcess(_app));
                musicBuf = _appCapture.Buffer;
            }
            else if (!string.IsNullOrEmpty(_loopDevice))
            {
                _loopCapture = new WasapiLoopbackCapture(en.GetDevice(_loopDevice));
                musicBuf = new BufferedWaveProvider(Standard(_loopCapture.WaveFormat)) { DiscardOnBufferOverflow = true, ReadFully = true };
                _loopCapture.DataAvailable += (s, e) => { try { musicBuf.AddSamples(e.Buffer, 0, e.BytesRecorded); } catch { } };
                _loopCapture.RecordingStopped += (s, e) => { if (e.Exception != null) Log.Error(e.Exception, "Loopback stopped"); };
                _loopCapture.StartRecording();
            }
            else
            {
                musicBuf = null; // no app picked: just your microphone through the cable
            }

            if (musicBuf == null && string.IsNullOrEmpty(_mic))
                throw new InvalidOperationException("Pick an app to share, a microphone, or both.");

            if (musicBuf != null)
            {
                _musicVol = new VolumeSampleProvider(Meter(To48kStereo(musicBuf.ToSampleProvider()), v => MusicPeak = v)) { Volume = _musicStart };
                mixer.AddMixerInput(_musicVol);
            }

            // your real microphone
            if (!string.IsNullOrEmpty(_mic))
            {
                _micCapture = new WasapiCapture(en.GetDevice(_mic));
                var micBuf = new BufferedWaveProvider(Standard(_micCapture.WaveFormat)) { DiscardOnBufferOverflow = true, ReadFully = true };
                _micCapture.DataAvailable += (s, e) => { try { micBuf.AddSamples(e.Buffer, 0, e.BytesRecorded); } catch { } };
                _micCapture.RecordingStopped += (s, e) => { if (e.Exception != null) Log.Error(e.Exception, "Microphone stopped"); };
                _micCapture.StartRecording();
                _micVol = new VolumeSampleProvider(Meter(To48kStereo(micBuf.ToSampleProvider()), v => MicPeak = v)) { Volume = _micStart };
                mixer.AddMixerInput(_micVol);
            }

            // the mix goes to the chosen output (the virtual cable)
            ISampleProvider final = Meter(mixer, v => OutPeak = v);
            Info = (_micCapture != null ? "mic " + _micCapture.WaveFormat + " | " : "") + "out " + outDev.FriendlyName + " " + outDev.AudioClient.MixFormat;
            if (_outChannels == 1)
                final = new StereoToMonoSampleProvider(final);
            _output = new WasapiOut(outDev, AudioClientShareMode.Shared, false, 100);
            _output.Init(final.ToWaveProvider());
            _output.Play();
        }

        public void SetVolumes(float music, float mic)
        {
            if (_musicVol != null) _musicVol.Volume = Math.Clamp(music, 0f, 2f);
            if (_micVol != null) _micVol.Volume = Math.Clamp(mic, 0f, 2f);
        }

        // some devices (like the Steam streaming microphone) report an "extensible" format that
        // the converters do not understand, so turn it into the plain PCM / float version first
        private static WaveFormat Standard(WaveFormat f)
        {
            return f is WaveFormatExtensible ext ? ext.ToStandardWaveFormat() : f;
        }

        private static ISampleProvider Meter(ISampleProvider input, Action<float> peak)
        {
            var m = new MeteringSampleProvider(input, 4800);
            m.StreamVolume += (s, e) =>
            {
                var max = 0f;
                foreach (var v in e.MaxSampleValues)
                    if (v > max) max = v;
                peak(max);
            };
            return m;
        }

        private ISampleProvider To48kStereo(ISampleProvider input)
        {
            if (input.WaveFormat.Channels == 1)
                input = new MonoToStereoSampleProvider(input);
            if (input.WaveFormat.SampleRate != _rate)
                input = new WdlResamplingSampleProvider(input, _rate);
            return input;
        }

        private static int FindProcess(string name)
        {
            var best = 0;
            var bestTime = DateTime.MaxValue;
            foreach (var p in Process.GetProcessesByName(name))
            {
                try
                {
                    // the oldest process is the root of the app (its helpers started later)
                    if (p.StartTime < bestTime)
                    {
                        bestTime = p.StartTime;
                        best = p.Id;
                    }
                }
                catch
                {
                }
            }

            if (best == 0)
                throw new InvalidOperationException($"{name} is not running.");
            return best;
        }

        public void Dispose()
        {
            try { _output?.Stop(); } catch { }
            try { _output?.Dispose(); } catch { }
            try { _micCapture?.StopRecording(); _micCapture?.Dispose(); } catch { }
            try { _loopCapture?.StopRecording(); _loopCapture?.Dispose(); } catch { }
            try { _appCapture?.Dispose(); } catch { }
        }
    }

    /// <summary>Captures everything one app (and its helper processes) plays. Needs Windows 10 2004 or newer.</summary>
    internal sealed class ProcessLoopback : IDisposable
    {
        private readonly AudioClient _client;
        private readonly Thread _thread;
        private readonly ManualResetEvent _event = new(false);
        private volatile bool _run = true;
        public BufferedWaveProvider Buffer { get; }

        private ProcessLoopback(AudioClient client, WaveFormat format)
        {
            _client = client;
            Buffer = new BufferedWaveProvider(format) { DiscardOnBufferOverflow = true, ReadFully = true };
            _thread = new Thread(Loop) { IsBackground = true, Name = "NeonProcessLoopback" };
        }

        public static ProcessLoopback Start(int pid)
        {
            var format = new WaveFormat(44100, 16, 2);
            var client = new AudioClient(Activate((uint)pid));
            client.Initialize(
                AudioClientShareMode.Shared,
                AudioClientStreamFlags.Loopback | AudioClientStreamFlags.EventCallback | AudioClientStreamFlags.AutoConvertPcm | AudioClientStreamFlags.SrcDefaultQuality,
                2000000, 0, format, Guid.Empty);
            var pl = new ProcessLoopback(client, format);
            client.SetEventHandle(pl._event.SafeWaitHandle.DangerousGetHandle());
            client.Start();
            pl._thread.Start();
            return pl;
        }

        private void Loop()
        {
            AudioCaptureClient capture;
            int blockAlign;
            try
            {
                capture = _client.AudioCaptureClient;
                blockAlign = Buffer.WaveFormat.BlockAlign;
            }
            catch (Exception e)
            {
                NeonMusicMic.Log.Error(e, "App capture could not start");
                return;
            }

            while (_run)
            {
                try
                {
                    _event.WaitOne(100);
                    var next = capture.GetNextPacketSize();
                    while (next > 0 && _run)
                    {
                        var ptr = capture.GetBuffer(out var frames, out var flags, out _, out _);
                        var bytes = frames * blockAlign;
                        var data = new byte[bytes];
                        if ((flags & AudioClientBufferFlags.Silent) == 0)
                            Marshal.Copy(ptr, data, 0, bytes);
                        capture.ReleaseBuffer(frames);
                        Buffer.AddSamples(data, 0, bytes);
                        next = capture.GetNextPacketSize();
                    }
                }
                catch
                {
                }
            }
        }

        public void Dispose()
        {
            _run = false;
            try { _client.Stop(); } catch { }
            try { _thread.Join(500); } catch { }
            try { _client.Dispose(); } catch { }
            _event.Dispose();
        }

        // ---- Windows "process loopback" activation ----
        private const string VirtualDevice = "VAD\\Process_Loopback";

        private static IAudioClient Activate(uint pid)
        {
            var args = new ActivationParams { ActivationType = 1, TargetProcessId = pid, ProcessLoopbackMode = 0 };
            var size = Marshal.SizeOf<ActivationParams>();
            var blob = Marshal.AllocHGlobal(size);
            var variantPtr = Marshal.AllocHGlobal(Marshal.SizeOf<PropVariant>());
            try
            {
                Marshal.StructureToPtr(args, blob, false);
                Marshal.StructureToPtr(new PropVariant { vt = 65, cbSize = (uint)size, pBlobData = blob }, variantPtr, false);
                var handler = new CompletionHandler();
                var iid = typeof(IAudioClient).GUID;
                ActivateAudioInterfaceAsync(VirtualDevice, ref iid, variantPtr, handler, out var op);
                if (!handler.Done.Wait(5000))
                    throw new TimeoutException("Windows did not answer the sound capture request.");
                op.GetActivateResult(out var hr, out var obj);
                if (hr < 0)
                    throw new InvalidOperationException("Could not capture that app's sound (0x" + hr.ToString("X") + "). Needs Windows 10 2004 or newer.");
                return (IAudioClient)obj;
            }
            finally
            {
                Marshal.FreeHGlobal(blob);
                Marshal.FreeHGlobal(variantPtr);
            }
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ActivationParams
        {
            public int ActivationType;
            public uint TargetProcessId;
            public int ProcessLoopbackMode;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PropVariant
        {
            public ushort vt;
            public ushort r1, r2, r3;
            public uint cbSize;
            public IntPtr pBlobData;
        }

        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = false)]
        private static extern void ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            ref Guid riid,
            IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation activationOperation);

        [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IActivateAudioInterfaceAsyncOperation
        {
            void GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
        }

        [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IActivateAudioInterfaceCompletionHandler
        {
            void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
        }

        [ComImport, Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAgileObject
        {
        }

        [ClassInterface(ClassInterfaceType.None)]
        private sealed class CompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
        {
            public readonly ManualResetEventSlim Done = new(false);

            public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
            {
                Done.Set();
            }
        }
    }
}
