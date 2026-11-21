using System;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace VRCX;

/// <summary>
/// Reads, and only reads, the avatar eye height VRChat sends on this PC (UDP port 9001, the OSC address
/// /avatar/parameters/EyeHeightAsMeters). Nothing about the body trackers goes through OSC.
/// </summary>
public partial class AppApi
{
    private const string EyeHeightAddress = "/avatar/parameters/EyeHeightAsMeters";

    /// <summary>
    /// Waits up to timeoutMs for VRChat to report the eye height of the avatar you are using and returns it in meters,
    /// or -1 when nothing arrived (VRChat not running, OSC switched off in VRChat, or the height did not change in
    /// that time: VRChat sends it when an avatar loads and when the height changes).
    /// </summary>
    public double ReadVrchatEyeHeight(int timeoutMs)
    {
        try
        {
            using var client = new UdpClient();
            client.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            client.Client.Bind(new IPEndPoint(IPAddress.Loopback, 9001));
            client.Client.ReceiveTimeout = 250;
            var until = Environment.TickCount64 + Math.Clamp(timeoutMs, 500, 30000);
            var last = -1.0;
            while (Environment.TickCount64 < until)
            {
                try
                {
                    var from = new IPEndPoint(IPAddress.Any, 0);
                    var data = client.Receive(ref from);
                    if (FindEyeHeight(data, 0, data.Length, out var h)) last = h;
                }
                catch (SocketException)
                {
                    // receive timeout: look at the clock and try again
                }
            }

            return last;
        }
        catch
        {
            return -1;
        }
    }

    private static string OscString(byte[] d, ref int i, int end)
    {
        var start = i;
        while (i < end && d[i] != 0) i++;
        var s = Encoding.ASCII.GetString(d, start, i - start);
        i = Math.Min(end, (i + 4) & ~3);
        return s;
    }

    private static bool FindEyeHeight(byte[] d, int from, int end, out double height)
    {
        height = -1;
        if (end - from < 8) return false;
        var i = from;
        var head = OscString(d, ref i, end);
        if (head == "#bundle")
        {
            i += 8; // time tag
            var found = false;
            while (i + 4 <= end)
            {
                var size = (d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3];
                i += 4;
                if (size <= 0 || i + size > end) break;
                if (FindEyeHeight(d, i, i + size, out var h))
                {
                    height = h;
                    found = true;
                }

                i += size;
            }

            return found;
        }

        if (head != EyeHeightAddress) return false;
        var tags = OscString(d, ref i, end);
        if (!tags.StartsWith(",f") || i + 4 > end) return false;
        var raw = new[] { d[i + 3], d[i + 2], d[i + 1], d[i] }; // big endian to little endian
        var value = BitConverter.ToSingle(raw, 0);
        if (float.IsNaN(value) || value <= 0) return false;
        height = value;
        return true;
    }
}
