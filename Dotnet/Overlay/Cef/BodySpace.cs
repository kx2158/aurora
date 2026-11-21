using System;
using System.Numerics;
using Valve.VR;

namespace VRCX;

/// <summary>
/// The space Aurora's body estimation works in. It is SteamVR's standing space, except that a horizontal move of
/// the play space (space drag, or any other tool moving the world around you) does not move it: your body stays
/// where you physically stand. Poses go in as raw tracking poses times this, and trackers come back out through its
/// inverse, so while you drag the space the estimated body does not walk, and the trackers travel with you exactly
/// like the headset does. Height (the floor) and rotation still follow SteamVR, and a recenter re-anchors it.
/// </summary>
internal static class BodySpace
{
    private static readonly object Lock = new();
    private static bool _anchored;
    private static float _fixedX, _fixedZ;
    private static Matrix4x4 _rawToBody = Matrix4x4.Identity; // row vector convention: body = raw * _rawToBody
    private static Matrix4x4 _bodyToRaw = Matrix4x4.Identity;
    private static Quaternion _bodyToRawRot = Quaternion.Identity;
    public static bool Ready { get; private set; }

    /// <summary>A recenter or room setup: anchor again to where the standing space is now.</summary>
    public static void Reanchor()
    {
        lock (Lock) _anchored = false;
    }

    /// <summary>Call every loop on the OpenVR thread.</summary>
    public static void Update(CVRSystem system)
    {
        // standing = Z * raw
        var z = system.GetRawZeroPoseToStandingAbsoluteTrackingPose();
        lock (Lock)
        {
            if (!_anchored)
            {
                _fixedX = z.m3;
                _fixedZ = z.m11;
                _anchored = true;
            }
            var m = new Matrix4x4(
                z.m0, z.m4, z.m8, 0,
                z.m1, z.m5, z.m9, 0,
                z.m2, z.m6, z.m10, 0,
                _fixedX, z.m7, _fixedZ, 1);
            if (!Matrix4x4.Invert(m, out var inverse))
                return;
            _rawToBody = m;
            _bodyToRaw = inverse;
            _bodyToRawRot = Quaternion.Normalize(Quaternion.CreateFromRotationMatrix(inverse));
            Ready = true;
        }
    }

    /// <summary>A raw tracking pose in body space.</summary>
    public static HmdMatrix34_t ToBody(HmdMatrix34_t raw)
    {
        Matrix4x4 b;
        lock (Lock) b = _rawToBody;
        var r = new Matrix4x4(
            raw.m0, raw.m4, raw.m8, 0,
            raw.m1, raw.m5, raw.m9, 0,
            raw.m2, raw.m6, raw.m10, 0,
            raw.m3, raw.m7, raw.m11, 1);
        var o = r * b;
        return new HmdMatrix34_t
        {
            m0 = o.M11, m1 = o.M21, m2 = o.M31, m3 = o.M41,
            m4 = o.M12, m5 = o.M22, m6 = o.M32, m7 = o.M42,
            m8 = o.M13, m9 = o.M23, m10 = o.M33, m11 = o.M43
        };
    }

    /// <summary>A body space position and rotation back in raw tracking space, for the driver.</summary>
    public static void ToRaw(ref Vector3 pos, ref Quaternion rot)
    {
        lock (Lock)
        {
            pos = Vector3.Transform(pos, _bodyToRaw);
            rot = Quaternion.Normalize(_bodyToRawRot * rot);
        }
    }
}
