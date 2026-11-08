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
                var mix = new NeonMusicMic(Str("app"), Str("loopDevice"), Str("mic"), Str("out"), (float)Num("musicVol", 0.8), (float)Num("micVol", 1.0), (int)Num("latency", 30));
                mix.InitialBass((float)Num("musicBass", 0), (float)Num("micBass", 0));
                mix.InitialNoise((float)Num("micNoise", 0));
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

        public void NeonMusicMicBass(double music, double mic)
        {
            _neonMusicMic?.SetBass((float)music, (float)mic);
        }

        /// <summary>Noise suppression on the microphone, 0 = off, 1 = strongest.</summary>
        public void NeonMusicMicNoise(double amount)
        {
            _neonMusicMic?.SetNoise((float)amount);
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
        private BassBoost _musicBass, _micBass;
        private NoiseSuppressor _micNoise;
        private float _micNoiseStart;
        private float _musicBassStart, _micBassStart;
        private float _musicStart, _micStart;
        private int _rate = 48000, _outChannels = 2;
        private readonly int _latency;
        public volatile float MicPeak, MusicPeak, OutPeak;
        public string Info = "";

        public NeonMusicMic(string app, string loopDevice, string mic, string output, float musicVol, float micVol, int latency)
        {
            _latency = Math.Clamp(latency, 8, 200);
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
                musicBuf = new BufferedWaveProvider(Standard(_loopCapture.WaveFormat)) { DiscardOnBufferOverflow = true, ReadFully = true, BufferDuration = TimeSpan.FromMilliseconds(300) };
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
                _musicBass = new BassBoost(Meter(To48kStereo(musicBuf.ToSampleProvider()), v => MusicPeak = v)) { Amount = _musicBassStart };
                _musicVol = new VolumeSampleProvider(_musicBass) { Volume = _musicStart };
                mixer.AddMixerInput(_musicVol);
            }

            // your real microphone
            if (!string.IsNullOrEmpty(_mic))
            {
                var micDevice = en.GetDevice(_mic);
                try { _micCapture = new WasapiCapture(micDevice, true, Math.Max(8, _latency / 2)); }
                catch { _micCapture = new WasapiCapture(micDevice); }
                var micBuf = new BufferedWaveProvider(Standard(_micCapture.WaveFormat)) { DiscardOnBufferOverflow = true, ReadFully = true, BufferDuration = TimeSpan.FromMilliseconds(Math.Max(50, _latency * 4)) };
                _micCapture.DataAvailable += (s, e) => { try { micBuf.AddSamples(e.Buffer, 0, e.BytesRecorded); } catch { } };
                _micCapture.RecordingStopped += (s, e) => { if (e.Exception != null) Log.Error(e.Exception, "Microphone stopped"); };
                _micCapture.StartRecording();
                // noise suppression runs first, so the meter and the bass boost only see your voice
                _micNoise = new NoiseSuppressor(To48kStereo(micBuf.ToSampleProvider())) { Amount = _micNoiseStart };
                _micBass = new BassBoost(Meter(_micNoise, v => MicPeak = v)) { Amount = _micBassStart };
                _micVol = new VolumeSampleProvider(_micBass) { Volume = _micStart };
                mixer.AddMixerInput(_micVol);
            }

            // the mix goes to the chosen output (the virtual cable)
            // gain above 100% can push the mix past full scale, so round the peaks off instead of crackling
            ISampleProvider final = Meter(new SoftLimit(mixer), v => OutPeak = v);
            Info = (_micCapture != null ? "mic " + _micCapture.WaveFormat + " | " : "") + "out " + outDev.FriendlyName + " " + outDev.AudioClient.MixFormat;
            if (_outChannels == 1)
                final = new StereoToMonoSampleProvider(final);
            var wave = final.ToWaveProvider();
            try
            {
                // event driven output gives the lowest delay, fall back to the polling mode if the device refuses
                _output = new WasapiOut(outDev, AudioClientShareMode.Shared, _latency <= 25, _latency);
                _output.Init(wave);
                _output.Play();
            }
            catch
            {
                _output?.Dispose();
                _output = new WasapiOut(outDev, AudioClientShareMode.Shared, false, Math.Max(_latency, 40));
                _output.Init(wave);
                _output.Play();
            }
        }

        public void InitialBass(float music, float mic)
        {
            _musicBassStart = music; _micBassStart = mic;
        }

        public void InitialNoise(float amount)
        {
            _micNoiseStart = amount;
        }

        public void SetNoise(float amount)
        {
            if (_micNoise != null) _micNoise.Amount = amount;
        }

        public void SetBass(float music, float mic)
        {
            if (_musicBass != null) _musicBass.Amount = music;
            if (_micBass != null) _micBass.Amount = mic;
        }

        /// <summary>
        /// Bass boost: a low shelf (up to +24 dB under ~150 Hz) followed by a little saturation, so the
        /// top of the slider is properly heavy. Amount 0 = off, 1 = crazy.
        /// </summary>
        private sealed class BassBoost : ISampleProvider
        {
            private readonly ISampleProvider _src;
            private NAudio.Dsp.BiQuadFilter[] _shelf = new NAudio.Dsp.BiQuadFilter[2];
            private NAudio.Dsp.BiQuadFilter[] _punch = new NAudio.Dsp.BiQuadFilter[2];
            private float _built = -1f;
            private volatile float _amount;
            public BassBoost(ISampleProvider src) { _src = src; }
            public float Amount { get => _amount; set => _amount = Math.Clamp(value, 0f, 1f); }
            public WaveFormat WaveFormat => _src.WaveFormat;

            public int Read(float[] buffer, int offset, int count)
            {
                var n = _src.Read(buffer, offset, count);
                var amount = _amount;
                if (amount < 0.005f) return n;
                if (Math.Abs(amount - _built) > 0.001f)
                {
                    var rate = _src.WaveFormat.SampleRate;
                    for (var c = 0; c < 2; c++)
                    {
                        _shelf[c] = NAudio.Dsp.BiQuadFilter.LowShelf(rate, 150f, 1f, amount * 24f);
                        _punch[c] = NAudio.Dsp.BiQuadFilter.PeakingEQ(rate, 60f, 1.2f, amount * 8f);
                    }
                    _built = amount;
                }
                var drive = 1f + amount * 2.5f;
                var norm = 1f / MathF.Tanh(drive);
                var channels = Math.Max(1, _src.WaveFormat.Channels);
                for (var i = 0; i < n; i++)
                {
                    var c = (i % channels) & 1;
                    var x = _punch[c].Transform(_shelf[c].Transform(buffer[offset + i]));
                    buffer[offset + i] = MathF.Tanh(x * drive) * norm;
                }
                return n;
            }
        }

        /// <summary>
        /// Noise suppression for the microphone (fans, keyboard, hum, room noise).
        /// Short-time spectral noise reduction: the sound is cut into 512-sample frames (about 11 ms of delay),
        /// the steady background noise is learned per frequency band, and bands that are mostly noise are
        /// turned down (Wiener gain with decision-directed SNR, which avoids the "underwater" artefacts of plain
        /// subtraction). When nobody is talking, a soft gate lowers what is left.
        /// Amount 0 = off (sound passes untouched), 1 = strongest.
        /// </summary>
        private sealed class NoiseSuppressor : ISampleProvider
        {
            private const int M = 9;            // 2^9 = 512 point FFT
            private const int N = 1 << M;
            private const int Hop = N / 2;
            private const int Bins = N / 2 + 1;

            private readonly ISampleProvider _src;
            private readonly int _channels;
            private readonly float[] _window = new float[N];
            private readonly float[] _frame = new float[N];       // last N mono input samples
            private readonly float[] _accum = new float[N];       // overlap-add output
            private readonly NAudio.Dsp.Complex[] _fft = new NAudio.Dsp.Complex[N];
            private readonly float[] _noise = new float[Bins];
            private readonly float[] _prevGain = new float[Bins];
            private readonly float[] _prevPost = new float[Bins];
            private readonly float[] _gain = new float[Bins];
            private readonly float[] _pending = new float[Hop];
            private int _pendingCount;
            private readonly float[] _out = new float[1 << 16];  // ring of processed mono samples
            private int _outHead, _outCount;
            private float[] _read = Array.Empty<float>();
            private int _frames;
            private float _gate = 1f;
            private volatile float _amount;

            public NoiseSuppressor(ISampleProvider src)
            {
                _src = src;
                _channels = Math.Max(1, src.WaveFormat.Channels);
                // square root Hann on analysis and synthesis sums to exactly 1 at 50% overlap
                for (var i = 0; i < N; i++)
                    _window[i] = MathF.Sqrt(0.5f * (1f - MathF.Cos(2f * MathF.PI * i / N)));
                for (var k = 0; k < Bins; k++)
                {
                    _prevGain[k] = 1f;
                    _prevPost[k] = 1f;
                }
                // one hop of silence up front keeps the output steady (total delay is one frame, 512 samples)
                _outCount = Hop;
            }

            public float Amount { get => _amount; set => _amount = Math.Clamp(value, 0f, 1f); }
            public WaveFormat WaveFormat => _src.WaveFormat;

            public int Read(float[] buffer, int offset, int count)
            {
                if (_read.Length < count) _read = new float[count];
                var n = _src.Read(_read, 0, count);
                var frames = n / _channels;
                for (var f = 0; f < frames; f++)
                {
                    var sum = 0f;
                    for (var c = 0; c < _channels; c++) sum += _read[f * _channels + c];
                    _pending[_pendingCount++] = sum / _channels;
                    if (_pendingCount == Hop)
                    {
                        ProcessHop();
                        _pendingCount = 0;
                    }
                }
                for (var f = 0; f < frames; f++)
                {
                    var v = 0f;
                    if (_outCount > 0)
                    {
                        v = _out[_outHead];
                        _outHead = (_outHead + 1) & (_out.Length - 1);
                        _outCount--;
                    }
                    for (var c = 0; c < _channels; c++) buffer[offset + f * _channels + c] = v;
                }
                return frames * _channels;
            }

            private void ProcessHop()
            {
                Array.Copy(_frame, Hop, _frame, 0, N - Hop);
                Array.Copy(_pending, 0, _frame, N - Hop, Hop);

                for (var i = 0; i < N; i++)
                {
                    _fft[i].X = _frame[i] * _window[i];
                    _fft[i].Y = 0f;
                }
                NAudio.Dsp.FastFourierTransform.FFT(true, M, _fft);

                var amount = _amount;
                _frames++;
                var learning = _frames < 40; // first ~0.2 s: learn the room
                float speech = 0f, noiseSum = 0f;

                for (var k = 0; k < Bins; k++)
                {
                    var p = _fft[k].X * _fft[k].X + _fft[k].Y * _fft[k].Y + 1e-12f;
                    // noise floor: follows quiet moments fast, creeps up slowly (about 3 dB per second)
                    if (learning)
                        _noise[k] = _frames == 1 ? p : _noise[k] * 0.9f + p * 0.1f;
                    else if (p < _noise[k])
                        _noise[k] = _noise[k] * 0.85f + p * 0.15f;
                    else
                        _noise[k] = Math.Min(p, _noise[k] * 1.0037f);

                    if (k > 2 && k < 90) // roughly 300 Hz to 8 kHz, where a voice lives
                    {
                        speech += p;
                        noiseSum += _noise[k];
                    }

                    var over = 1f + amount * 3f;                       // stronger setting = assume more noise
                    var post = p / (_noise[k] * over);
                    var prior = 0.98f * _prevGain[k] * _prevGain[k] * _prevPost[k] + 0.02f * Math.Max(post - 1f, 0f);
                    var g = prior / (1f + prior);
                    _prevPost[k] = post;
                    _gain[k] = g;
                }

                // frequency smoothing takes the edge off single bins flickering ("musical noise")
                var floor = MathF.Pow(10f, -(8f + amount * 28f) / 20f);    // -8 dB .. -36 dB at most
                for (var k = 0; k < Bins; k++)
                {
                    var a = _gain[Math.Max(0, k - 1)];
                    var b = _gain[k];
                    var c = _gain[Math.Min(Bins - 1, k + 1)];
                    var g = (a + 2f * b + c) * 0.25f;
                    g = Math.Max(floor, g);
                    // blend with "off" by the amount, so 0 really is untouched
                    g = 1f + (g - 1f) * Math.Min(1f, amount * 2f);
                    _prevGain[k] = g;
                    _gain[k] = g;
                }

                // soft gate: when the voice band is close to the noise floor nobody is talking
                var ratio = speech / (noiseSum + 1e-9f);
                var open = ratio > 3.0f || amount < 0.01f;
                var target = open ? 1f : 1f - 0.85f * amount;
                _gate += (target - _gate) * (open ? 0.5f : 0.08f);       // opens fast, closes gently

                for (var k = 0; k < Bins; k++)
                {
                    var g = _gain[k] * _gate;
                    _fft[k].X *= g;
                    _fft[k].Y *= g;
                    if (k > 0 && k < N / 2)
                    {
                        _fft[N - k].X *= g;
                        _fft[N - k].Y *= g;
                    }
                }
                NAudio.Dsp.FastFourierTransform.FFT(false, M, _fft);

                for (var i = 0; i < N; i++) _accum[i] += _fft[i].X * _window[i];

                // the first half is finished now
                for (var i = 0; i < Hop; i++)
                {
                    if (_outCount >= _out.Length) break; // nobody is reading, drop
                    _out[(_outHead + _outCount) & (_out.Length - 1)] = _accum[i];
                    _outCount++;
                }
                Array.Copy(_accum, Hop, _accum, 0, N - Hop);
                Array.Clear(_accum, N - Hop, Hop);
            }
        }

        public void SetVolumes(float music, float mic)
        {
            if (_musicVol != null) _musicVol.Volume = Math.Clamp(music, 0f, 10f);
            if (_micVol != null) _micVol.Volume = Math.Clamp(mic, 0f, 5f);
        }

        private sealed class SoftLimit : ISampleProvider
        {
            private readonly ISampleProvider _src;
            public SoftLimit(ISampleProvider src) { _src = src; }
            public WaveFormat WaveFormat => _src.WaveFormat;
            public int Read(float[] buffer, int offset, int count)
            {
                var n = _src.Read(buffer, offset, count);
                for (var i = 0; i < n; i++)
                {
                    var x = buffer[offset + i];
                    var a = Math.Abs(x);
                    if (a > 0.7f)
                    {
                        // smooth curve from 0.7 up to a ceiling of 1.0
                        var y = 0.7f + 0.3f * MathF.Tanh((a - 0.7f) / 0.3f);
                        buffer[offset + i] = x < 0 ? -y : y;
                    }
                }
                return n;
            }
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
            Buffer = new BufferedWaveProvider(format) { DiscardOnBufferOverflow = true, ReadFully = true, BufferDuration = TimeSpan.FromMilliseconds(300) };
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
