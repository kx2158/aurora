using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;

namespace VRCX;

/// <summary>
/// Optional, off by default: counts how many times you unmute in VRChat. It only reads the MuteSelf value VRChat sends on
/// this PC (UDP port 9001) and keeps a number in memory. It runs only while it is switched on in Aura.
/// </summary>
public partial class AppApi
{
    private const string MuteAddress = "/avatar/parameters/MuteSelf";
    private static CancellationTokenSource muteCts;
    private static int unmuteCount;
    private static int muteState = -1; // -1 unknown, 0 unmuted, 1 muted

    public void StartUnmuteCounter()
    {
        StopUnmuteCounter();
        Interlocked.Exchange(ref unmuteCount, 0);
        muteState = -1;
        var cts = new CancellationTokenSource();
        muteCts = cts;
        var thread = new Thread(() => MuteLoop(cts.Token)) { IsBackground = true };
        thread.Start();
    }

    public void StopUnmuteCounter()
    {
        try { muteCts?.Cancel(); } catch { }
        muteCts = null;
    }

    public int GetUnmuteCount() => Volatile.Read(ref unmuteCount);

    private static void MuteLoop(CancellationToken token)
    {
        try
        {
            using var client = new UdpClient();
            client.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true);
            client.Client.Bind(new IPEndPoint(IPAddress.Loopback, 9001));
            client.Client.ReceiveTimeout = 500;
            while (!token.IsCancellationRequested)
            {
                try
                {
                    var from = new IPEndPoint(IPAddress.Any, 0);
                    var data = client.Receive(ref from);
                    ScanMute(data, 0, data.Length);
                }
                catch (SocketException)
                {
                    // receive timeout: check for cancel and try again
                }
            }
        }
        catch
        {
            // port busy or blocked: the counter just stays at its number
        }
    }

    private static void ScanMute(byte[] d, int from, int end)
    {
        if (end - from < 8) return;
        var i = from;
        var head = OscString(d, ref i, end);
        if (head == "#bundle")
        {
            i += 8;
            while (i + 4 <= end)
            {
                var size = (d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3];
                i += 4;
                if (size <= 0 || i + size > end) break;
                ScanMute(d, i, i + size);
                i += size;
            }

            return;
        }

        if (head != MuteAddress) return;
        var tags = OscString(d, ref i, end);
        int now;
        if (tags.StartsWith(",T")) now = 1;
        else if (tags.StartsWith(",F")) now = 0;
        else return;
        if (muteState == 1 && now == 0) Interlocked.Increment(ref unmuteCount);
        muteState = now;
    }
}
