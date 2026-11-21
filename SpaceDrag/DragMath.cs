using System;
using System.Numerics;

namespace AuroraSpaceDrag;

/// <summary>
/// The whole idea of space drag, with no OpenVR in it so it can be checked on its own.
///
/// SteamVR keeps one matrix that says where "standing space" (the space games see) sits inside the raw tracking
/// space of the headset: raw = R * standing + t. Space drag only changes t. While a hand is held, the hand is kept
/// still in standing space: when you pull it toward you, the world comes with it and you travel the other way.
///
///   grab:    remember the hand's raw position (h0) and the current t (t0)
///   hold:    t = t0 + k * (h - h0)         k is the multiplier, 1 is 1:1
///
/// With k = 1 the hand's standing position is exactly where it was at the grab, whatever R is.
/// </summary>
public static class DragMath
{
    /// <summary>The play space offset to use while a hand is held.</summary>
    public static Vector3 Offset(Vector3 t0, Vector3 hand0, Vector3 hand, double multiplier, bool allowVertical)
    {
        var d = hand - hand0;
        if (!allowVertical) d.Y = 0;
        return t0 + d * (float)multiplier;
    }

    /// <summary>Comfort mode: the offset only changes in steps of the given size, so the world jumps a little at a time.</summary>
    public static Vector3 Quantize(Vector3 from, Vector3 to, float step)
    {
        if (step <= 0) return to;
        var d = to - from;
        return from + new Vector3(Snap(d.X, step), Snap(d.Y, step), Snap(d.Z, step));
    }

    private static float Snap(float v, float step) => MathF.Round(v / step) * step;

    /// <summary>
    /// Picks which hand drives the drag. pressed says which hands are holding the button right now, current is the hand
    /// that was driving (or null). A hand that is already driving keeps it; otherwise the first pressed hand takes it, and
    /// when the driving hand lets go the other one takes over if it is still held. allowed is "left", "right" or "both".
    /// </summary>
    public static string PickHand(bool leftPressed, bool rightPressed, string current, string allowed)
    {
        leftPressed &= allowed is "left" or "both";
        rightPressed &= allowed is "right" or "both";
        if (current == "left" && leftPressed) return "left";
        if (current == "right" && rightPressed) return "right";
        if (leftPressed) return "left";
        if (rightPressed) return "right";
        return null;
    }

    /// <summary>A matrix with the same rotation as basis and a new translation.</summary>
    public static float[,] WithTranslation(float[,] basis, Vector3 t)
    {
        var m = (float[,])basis.Clone();
        m[0, 3] = t.X;
        m[1, 3] = t.Y;
        m[2, 3] = t.Z;
        return m;
    }

    /// <summary>True for a matrix that is safe to hand to SteamVR (finite, and a real rotation part).</summary>
    public static bool IsSane(float[,] m)
    {
        for (var r = 0; r < 3; r++)
        for (var c = 0; c < 4; c++)
            if (!float.IsFinite(m[r, c])) return false;
        // each row of the 3x3 part should be about unit length
        for (var r = 0; r < 3; r++)
        {
            var len = MathF.Sqrt(m[r, 0] * m[r, 0] + m[r, 1] * m[r, 1] + m[r, 2] * m[r, 2]);
            if (len < 0.9f || len > 1.1f) return false;
        }
        return true;
    }
}
