using System;
using NAudio.Wave;

namespace VRCX
{
    /// <summary>
    /// Aurora's built-in voice effects for the microphone (runs right after noise suppression).
    /// Works on 48 kHz stereo float; the voice is treated as mono and written to both channels.
    /// Pitch is its own control and stacks with the chosen effect.
    /// Effects: none, robot, radio, echo, reverb, ghost (a live port of GhostVerb, kx2158/ghostverb).
    /// </summary>
    internal sealed class VoiceFx : ISampleProvider
    {
        private const int Rate = 48000;
        private readonly ISampleProvider _src;
        private float[] _read = Array.Empty<float>();

        private volatile string _effect = "none";
        private float _amount = 0.5f;
        private float _pitch; // semitones, -12..12

        private readonly PitchShift _shift = new(2400);
        private readonly GhostVerb _ghost = new(Rate * 450 / 1000);
        private readonly Reverb _reverb = new();
        private readonly Echo _echo = new(Rate * 2);
        private readonly Biquad _radioHp = new(), _radioLp = new();
        private double _phase;
        private uint _noiseSeed = 0x9e3779b9;

        public VoiceFx(ISampleProvider src)
        {
            _src = src;
            WaveFormat = src.WaveFormat;
            _radioHp.HighPass(450, Rate, 0.8);
            _radioLp.LowPass(2900, Rate, 0.9);
        }

        public WaveFormat WaveFormat { get; }

        public void Set(string effect, float amount, float pitch)
        {
            var e = (effect ?? "none").ToLowerInvariant();
            if (e != _effect)
            {
                _reverb.Clear();
                _echo.Clear();
                _ghost.Clear();
            }
            _effect = e;
            _amount = Math.Clamp(amount, 0f, 1f);
            _pitch = Math.Clamp(pitch, -12f, 12f);
        }

        public int Read(float[] buffer, int offset, int count)
        {
            var n = _src.Read(buffer, offset, count);
            var ch = WaveFormat.Channels;
            var effect = _effect;
            var amount = _amount;
            var pitch = _pitch;
            if (effect == "none" && Math.Abs(pitch) < 0.05f)
                return n;

            var ratio = (float)Math.Pow(2, pitch / 12.0);
            for (var i = 0; i < n; i += ch)
            {
                float x = 0;
                for (var c = 0; c < ch; c++) x += buffer[offset + i + c];
                x /= ch;

                if (Math.Abs(pitch) >= 0.05f)
                    x = _shift.Process(x, ratio);

                var y = effect switch
                {
                    "robot" => Robot(x, amount),
                    "radio" => Radio(x, amount),
                    "echo" => x + _echo.Process(x, (int)(Rate * (0.22 + 0.16 * amount)), 0.25f + 0.45f * amount) * (0.35f + 0.5f * amount),
                    "reverb" => x * (1f - 0.35f * amount) + _reverb.Process(x, 0.78f + 0.2f * amount, 0.25f) * (0.25f + 0.75f * amount),
                    "ghost" => Ghost(x, amount),
                    _ => x
                };

                for (var c = 0; c < ch; c++) buffer[offset + i + c] = y;
            }
            return n;
        }

        private float Robot(float x, float a)
        {
            // ring modulation: the voice multiplied by a low tone gives the metallic, flat robot sound
            var f = 30 + 90 * a;
            _phase += 2 * Math.PI * f / Rate;
            if (_phase > 2 * Math.PI) _phase -= 2 * Math.PI;
            var ring = x * (float)Math.Sin(_phase) * 1.6f;
            return x * (1f - a) + ring * a;
        }

        private float Radio(float x, float a)
        {
            // thin band, a bit of drive and a little hiss
            var y = _radioLp.Process(_radioHp.Process(x));
            var drive = 1f + 7f * a;
            y = (float)Math.Tanh(y * drive) / (float)Math.Tanh(drive) * 0.9f;
            _noiseSeed = _noiseSeed * 1664525 + 1013904223;
            var hiss = ((_noiseSeed >> 9) / 8388608f - 1f) * 0.006f * a;
            return y + hiss;
        }

        private float Ghost(float x, float a)
        {
            // your voice stays instant; the reversed swell of each phrase rises in right after it
            var level = (float)Math.Pow(10, (-18 + 21 * a) / 20); // -18 dB .. +3 dB, GhostVerb's "Ghost Level"
            return x + _ghost.Process(x) * level;
        }

        /// <summary>
        /// GhostVerb's reverse reverb engine, live version. Audio is collected in chunks of L samples; each full
        /// chunk is reversed, run through a reverb with L samples of extra tail, and reversed back, giving a swell
        /// that builds up into the words. The plugin delays the dry voice by 2L so the swell lands before them;
        /// here the voice is not delayed, so the swell plays straight after each chunk instead.
        /// Settings match the plugin defaults: size 0.75, damping 0.5.
        /// </summary>
        private sealed class GhostVerb
        {
            private readonly int _l;
            private readonly float[] _in;
            private readonly float[] _scratch;
            private readonly float[] _ring;
            private readonly Reverb _verb = new();
            private int _inPos;
            private long _t;

            public GhostVerb(int chunk)
            {
                _l = chunk;
                _in = new float[chunk];
                _scratch = new float[chunk * 2];
                _ring = new float[chunk * 4];
            }

            public void Clear()
            {
                Array.Clear(_in);
                Array.Clear(_ring);
                _inPos = 0;
            }

            public float Process(float x)
            {
                _in[_inPos] = x;
                if (++_inPos == _l)
                {
                    Render();
                    _inPos = 0;
                }
                var i = (int)(_t % _ring.Length);
                var w = _ring[i];
                _ring[i] = 0f;
                _t++;
                return w;
            }

            private void Render()
            {
                var total = _l * 2;
                for (var k = 0; k < _l; k++) _scratch[k] = _in[_l - 1 - k];
                Array.Clear(_scratch, _l, _l);
                _verb.Clear();
                // JUCE's reverb: feedback = size * 0.28 + 0.7, damping * 0.4
                for (var k = 0; k < total; k++) _scratch[k] = _verb.Process(_scratch[k], 0.75f * 0.28f + 0.7f, 0.5f * 0.4f);
                Array.Reverse(_scratch, 0, total);
                var fade = Math.Max(1, _l / 10);
                for (var k = 0; k < total; k++)
                {
                    var g = 1.2f; // brings the swell to about the input level, as the plugin intends
                    if (k < fade) g *= 0.5f - 0.5f * (float)Math.Cos(Math.PI * k / fade);
                    var pos = (int)((_t + 1 + k) % _ring.Length);
                    _ring[pos] += _scratch[k] * g;
                }
            }
        }

        /// <summary>Delay-line pitch shifter: two read taps sliding through a short window, crossfaded.</summary>
        private sealed class PitchShift
        {
            private readonly float[] _buf = new float[8192];
            private readonly int _window;
            private int _w;
            private float _p;

            public PitchShift(int window) { _window = window; }

            public float Process(float x, float ratio)
            {
                _buf[_w] = x;
                _p += (1f - ratio) / _window;
                if (_p >= 1f) _p -= 1f;
                if (_p < 0f) _p += 1f;
                var p2 = _p + 0.5f;
                if (p2 >= 1f) p2 -= 1f;
                var y = Tap(_p * _window) * Gain(_p) + Tap(p2 * _window) * Gain(p2);
                _w = (_w + 1) & (_buf.Length - 1);
                return y;
            }

            private static float Gain(float p) => (float)Math.Sin(Math.PI * p);

            private float Tap(float delay)
            {
                var pos = _w - delay - 1;
                while (pos < 0) pos += _buf.Length;
                var i = (int)pos;
                var f = pos - i;
                var a = _buf[i & (_buf.Length - 1)];
                var b = _buf[(i + 1) & (_buf.Length - 1)];
                return a + (b - a) * f;
            }
        }

        private sealed class Echo
        {
            private readonly float[] _buf;
            private int _w;
            public Echo(int size) { _buf = new float[size]; }
            public void Clear() => Array.Clear(_buf);

            public float Process(float x, int delay, float feedback)
            {
                delay = Math.Clamp(delay, 1, _buf.Length - 1);
                var r = _w - delay;
                if (r < 0) r += _buf.Length;
                var y = _buf[r];
                _buf[_w] = x + y * feedback;
                _w = (_w + 1) % _buf.Length;
                return y;
            }
        }

        /// <summary>A small Schroeder-Moorer reverb (eight damped combs into four allpasses).</summary>
        private sealed class Reverb
        {
            private static readonly int[] CombLen = { 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617 };
            private static readonly int[] AllLen = { 556, 441, 341, 225 };
            private readonly float[][] _comb;
            private readonly float[] _combStore = new float[8];
            private readonly int[] _combPos = new int[8];
            private readonly float[][] _all;
            private readonly int[] _allPos = new int[4];

            public Reverb()
            {
                _comb = new float[8][];
                for (var i = 0; i < 8; i++) _comb[i] = new float[CombLen[i] * Rate / 44100];
                _all = new float[4][];
                for (var i = 0; i < 4; i++) _all[i] = new float[AllLen[i] * Rate / 44100];
            }

            public void Clear()
            {
                foreach (var c in _comb) Array.Clear(c);
                foreach (var a in _all) Array.Clear(a);
                Array.Clear(_combStore);
            }

            public float Process(float x, float room, float damp)
            {
                var input = x * 0.03f;
                float y = 0;
                for (var i = 0; i < 8; i++)
                {
                    var buf = _comb[i];
                    var o = buf[_combPos[i]];
                    _combStore[i] = o * (1 - damp) + _combStore[i] * damp;
                    buf[_combPos[i]] = input + _combStore[i] * room;
                    if (++_combPos[i] >= buf.Length) _combPos[i] = 0;
                    y += o;
                }
                for (var i = 0; i < 4; i++)
                {
                    var buf = _all[i];
                    var o = buf[_allPos[i]];
                    buf[_allPos[i]] = y + o * 0.5f;
                    y = o - y;
                    if (++_allPos[i] >= buf.Length) _allPos[i] = 0;
                }
                return y;
            }
        }

        private sealed class Biquad
        {
            private double _b0, _b1, _b2, _a1, _a2, _z1, _z2;

            public void LowPass(double f, double rate, double q) => Set(f, rate, q, false);
            public void HighPass(double f, double rate, double q) => Set(f, rate, q, true);

            private void Set(double f, double rate, double q, bool high)
            {
                var w = 2 * Math.PI * f / rate;
                var cos = Math.Cos(w);
                var alpha = Math.Sin(w) / (2 * q);
                var a0 = 1 + alpha;
                if (high)
                {
                    _b0 = (1 + cos) / 2 / a0; _b1 = -(1 + cos) / a0; _b2 = _b0;
                }
                else
                {
                    _b0 = (1 - cos) / 2 / a0; _b1 = (1 - cos) / a0; _b2 = _b0;
                }
                _a1 = -2 * cos / a0;
                _a2 = (1 - alpha) / a0;
            }

            public float Process(float x)
            {
                var y = _b0 * x + _z1;
                _z1 = _b1 * x - _a1 * y + _z2;
                _z2 = _b2 * x - _a2 * y;
                return (float)y;
            }
        }
    }
}
