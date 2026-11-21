using System;
using System.IO.MemoryMappedFiles;
using System.Numerics;
using System.Text.Json;
using NLog;
using Valve.VR;

namespace VRCX;

/// <summary>
/// Hands Aurora's body tracker poses to the Aurora SteamVR driver (Driver/aurora_driver.cpp) through shared memory.
/// Aurora works in its body space (see BodySpace), a driver works in SteamVR's raw tracking space, so the poses are converted here.
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

    public void Write(string json)
    {
        try
        {
            lock (_lock)
            {
                if (!BodySpace.Ready || !Open())
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

                    // Aurora's body space back to raw tracking space (see BodySpace)
                    var p = new Vector3(pos[0].GetSingle(), pos[1].GetSingle(), pos[2].GetSingle());
                    var q = new Quaternion(rot[0].GetSingle(), rot[1].GetSingle(), rot[2].GetSingle(), rot[3].GetSingle());
                    BodySpace.ToRaw(ref p, ref q);
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
