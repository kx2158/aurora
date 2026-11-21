using System;
using System.Diagnostics;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Text.Json.Nodes;

namespace VRCX;

/// <summary>
/// Quest body tracking for Aurora. A small helper (BodyXr\Aurora.BodyXr.exe, built from the BodyXr folder) reads the
/// headset's OpenXR body tracking and writes the joints into shared memory "Local\AuroraBodyXr". This file starts
/// and stops it and turns what it wrote into JSON for the estimator. Layout (little endian), written by BodyXr.cpp:
///   0 magic, 4 version, 8 state, 12 jointCount, 16 updatedMs (u64), 24 seq, 28 confidence (f32), 32 fullBody,
///   36 note (96 bytes), 132 joints, each 32 bytes: position xyz, orientation xyzw (f32), flags (u32);
///   2820 headset pose: position xyz, orientation xyzw (f32), then valid (u32).
/// </summary>
public partial class AppApi
{
    private const string BodyXrProcess = "Aurora.BodyXr";
    private const int BodyXrJointsOffset = 132;
    private const int BodyXrJointSize = 32;

    // joint indexes of the Meta body skeleton (the first 70 are the default set, 70 and up only exist in the full body set)
    private static readonly (string name, int index)[] BodyXrJoints =
    {
        ("hips", 1), ("spineUpper", 4), ("chest", 5), ("neck", 6), ("head", 7),
        ("leftShoulder", 10), ("leftElbow", 11), ("leftWrist", 12),
        ("rightShoulder", 15), ("rightElbow", 16), ("rightWrist", 17),
        ("leftUpperLeg", 70), ("leftLowerLeg", 71), ("leftAnkle", 73),
        ("rightUpperLeg", 77), ("rightLowerLeg", 78), ("rightAnkle", 80)
    };

    private static string BodyXrExe() => Path.Join(Program.BaseDirectory, "BodyXr", "Aurora.BodyXr.exe");
    private static bool BodyXrRunning() => Process.GetProcessesByName(BodyXrProcess).Length > 0;

    /// <summary>Starts the helper if it is not running. Returns true when it is running afterwards.</summary>
    public bool StartBodyXr()
    {
        try
        {
            if (BodyXrRunning()) return true;
            var exe = BodyXrExe();
            if (!File.Exists(exe)) return false;
            Process.Start(new ProcessStartInfo
            {
                FileName = exe,
                WorkingDirectory = Path.GetDirectoryName(exe)!,
                UseShellExecute = false,
                CreateNoWindow = true
            });
            return true;
        }
        catch
        {
            return false;
        }
    }

    public bool StopBodyXr()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName(BodyXrProcess))
            {
                p.Kill();
                p.Dispose();
            }

            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// JSON: { installed, running, state, note, ageMs, confidence, full, view: [px, py, pz, qx, qy, qz, qw], joints: { name: [px, py, pz, qx, qy, qz, qw] } }.
    /// state: 0 starting, 1 no runtime or headset, 2 no body tracking, 3 session failed, 4 no data yet, 5 tracking.
    /// Joints are in the headset runtime's own space; Aurora lines them up with SteamVR's head. Only joints whose
    /// position and orientation are both valid are listed.
    /// </summary>
    public string ReadBodyXr()
    {
        var result = new JsonObject { ["installed"] = File.Exists(BodyXrExe()), ["running"] = false, ["state"] = 0, ["note"] = "" };
        try
        {
            result["running"] = BodyXrRunning();
            if (!(bool)result["running"]) return result.ToJsonString();
            using var file = MemoryMappedFile.OpenExisting("Local\\AuroraBodyXr", MemoryMappedFileRights.Read);
            using var view = file.CreateViewAccessor(0, 4096, MemoryMappedFileAccess.Read);
            if (view.ReadUInt32(0) != 0x52584241) return result.ToJsonString();
            var jointCount = (int)view.ReadUInt32(12);
            var updated = (long)view.ReadUInt64(16);
            result["state"] = (int)view.ReadUInt32(8);
            result["ageMs"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - updated;
            result["confidence"] = view.ReadSingle(28);
            result["full"] = view.ReadUInt32(32) != 0;
            var noteBytes = new byte[96];
            view.ReadArray(36, noteBytes, 0, 96);
            result["note"] = System.Text.Encoding.UTF8.GetString(noteBytes).TrimEnd('\0');
            if ((int)result["state"] == 5)
            {
                var joints = new JsonObject();
                foreach (var (name, index) in BodyXrJoints)
                {
                    if (index >= jointCount) continue;
                    var at = BodyXrJointsOffset + index * BodyXrJointSize;
                    var flags = view.ReadUInt32(at + 28);
                    if ((flags & 3) != 3) continue;
                    var a = new JsonArray();
                    for (var i = 0; i < 7; i++) a.Add(Math.Round(view.ReadSingle(at + i * 4), 5));
                    joints[name] = a;
                }

                result["joints"] = joints;
                if (view.ReadUInt32(2820 + 28) != 0)
                {
                    var v = new JsonArray();
                    for (var i = 0; i < 7; i++) v.Add(Math.Round(view.ReadSingle(2820 + i * 4), 5));
                    result["view"] = v;
                }
            }
        }
        catch (Exception ex)
        {
            result["error"] = ex.Message;
        }

        return result.ToJsonString();
    }
}
