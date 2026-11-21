using System;
using System.IO.MemoryMappedFiles;
using System.Numerics;
using System.Text.Json;
using NLog;
using Valve.VR;

namespace VRCX;

/// <summary>
/// Hands Aurora's body tracker poses to the Aurora SteamVR driver (Driver/aurora_driver.cpp) through shared memory.
/// Aurora works in standing space, a driver works in SteamVR's raw tracking space, so the poses are converted here.
/// Layout (packed): u32 magic, u32 reserved, u64 updatedMs, then 8 slots of { u32 valid, f64 pos[3], f64 rot[4] }.
/// </summary>
internal sealed class TrackerDriverFeed
{
    private static readonly Logger logger = LogManager.GetCurrentClassLogger();
    private static readonly string[] Names = { "hips", "chest", "leftFoot", "rightFoot", "leftKnee", "rightKnee", "leftElbow", "rightElbow" };
    private const uint Magic = 0x41555231;
    private const int SlotSize = 4 + 3 * 8 + 4 * 8;
    private const int HeaderSize = 16;
    private const int TotalSize = HeaderSize + 8 * SlotSize;

    private readonly object _lock = new();
    private MemoryMappedFile _file;
    private MemoryMappedViewAccessor _view;
    private Matrix4x4 _standingToRaw = Matrix4x4.Identity;
    private Quaternion _standingToRawRot = Quaternion.Identity;
    private bool _haveTransform;

    /// <summary>Called from the OpenVR thread: remembers how to get from standing space back to raw space.</summary>
    public void UpdateTransform(CVRSystem system)
    {
        try
        {
            var m = system.GetRawZeroPoseToStandingAbsoluteTrackingPose();
            var rotation = new Matrix4x4(
                m.m0, m.m4, m.m8, 0,
                m.m1, m.m5, m.m9, 0,
                m.m2, m.m6, m.m10, 0,
                m.m3, m.m7, m.m11, 1);
            // standing = Z * raw, so raw = inverse(Z) * standing
            if (!Matrix4x4.Invert(rotation, out var inverse))
                return;
            lock (_lock)
            {
                _standingToRaw = inverse;
                _standingToRawRot = Quaternion.Normalize(Quaternion.CreateFromRotationMatrix(inverse));
                _haveTransform = true;
            }
        }
        catch (Exception ex)
        {
            logger.Error(ex);
        }
    }

    public void Write(string json)
    {
        try
        {
            lock (_lock)
            {
                if (!_haveTransform || !Open())
                    return;

                using var doc = JsonDocument.Parse(json);
                _view.Write(8, (ulong)Environment.TickCount64);
                for (var i = 0; i < Names.Length; i++)
                {
                    var at = HeaderSize + i * SlotSize;
                    if (!doc.RootElement.TryGetProperty(Names[i], out var pose) ||
                        !pose.TryGetProperty("pos", out var pos) || !pose.TryGetProperty("rot", out var rot))
                    {
                        _view.Write(at, 0u);
                        continue;
                    }

                    var p = Vector3.Transform(new Vector3(pos[0].GetSingle(), pos[1].GetSingle(), pos[2].GetSingle()), _standingToRaw);
                    var q = Quaternion.Normalize(_standingToRawRot *
                        new Quaternion(rot[0].GetSingle(), rot[1].GetSingle(), rot[2].GetSingle(), rot[3].GetSingle()));
                    _view.Write(at + 4, (double)p.X);
                    _view.Write(at + 12, (double)p.Y);
                    _view.Write(at + 20, (double)p.Z);
                    _view.Write(at + 28, (double)q.X);
                    _view.Write(at + 36, (double)q.Y);
                    _view.Write(at + 44, (double)q.Z);
                    _view.Write(at + 52, (double)q.W);
                    _view.Write(at, 1u);
                }
            }
        }
        catch (Exception ex)
        {
            logger.Error(ex);
        }
    }

    // the driver creates the mapping when SteamVR loads it, so this fails until SteamVR is up with the driver
    private bool Open()
    {
        if (_view != null)
            return true;
        try
        {
            _file = MemoryMappedFile.OpenExisting("Local\\AuroraTrackers", MemoryMappedFileRights.ReadWrite);
            _view = _file.CreateViewAccessor(0, TotalSize, MemoryMappedFileAccess.ReadWrite);
            return _view.ReadUInt32(0) == Magic;
        }
        catch
        {
            _view?.Dispose();
            _file?.Dispose();
            _view = null;
            _file = null;
            return false;
        }
    }

    public void Close()
    {
        lock (_lock)
        {
            _view?.Dispose();
            _file?.Dispose();
            _view = null;
            _file = null;
        }
    }
}
