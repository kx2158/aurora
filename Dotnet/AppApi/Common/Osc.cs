using System;
using System.Net.Sockets;

namespace VRCX;

/// <summary>
/// Sends one OSC packet (base64 from the app) to VRChat on this PC, port 9000 by default.
/// Used for Aurora's body trackers: /tracking/trackers/1..8 and /head.
/// </summary>
public partial class AppApi
{
    private static UdpClient _oscClient;
    private static readonly object OscLock = new();

    public bool SendOsc(string base64, int port)
    {
        try
        {
            var bytes = Convert.FromBase64String(base64);
            lock (OscLock)
            {
                _oscClient ??= new UdpClient();
                _oscClient.Send(bytes, bytes.Length, "127.0.0.1", port > 0 ? port : 9000);
            }

            return true;
        }
        catch
        {
            return false;
        }
    }
}
