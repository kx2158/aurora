using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace VRCX
{
    public partial class AppApi
    {
        /// <summary>
        /// Sends text to the VRChat chatbox over OSC (UDP to 127.0.0.1:9000 by default).
        /// Written from the public VRChat OSC documentation, not taken from any other chatbox app.
        /// </summary>
        /// <param name="text">The text to show (VRChat shows at most 144 characters).</param>
        /// <param name="sendImmediately">True sends it now, false only puts it in the keyboard field.</param>
        /// <param name="notify">True plays the notification sound.</param>
        /// <param name="port">The OSC port VRChat listens on.</param>
        public void SendOscChatbox(string text, bool sendImmediately = true, bool notify = false, int port = 9000)
        {
            if (string.IsNullOrEmpty(text))
                return;
            if (text.Length > 144)
                text = text.Substring(0, 144);
            SendOsc("/chatbox/input", ",s" + (sendImmediately ? "T" : "F") + (notify ? "T" : "F"), text, port);
        }

        /// <summary>Shows or hides the typing indicator bubble.</summary>
        public void SendOscTyping(bool typing, int port = 9000)
        {
            SendOsc("/chatbox/typing", typing ? ",T" : ",F", null, port);
        }

        private static void SendOsc(string address, string tags, string text, int port)
        {
            var packet = new List<byte>();
            AddOscString(packet, address);
            AddOscString(packet, tags);
            if (text != null)
                AddOscString(packet, text);

            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.SendTo(packet.ToArray(), new IPEndPoint(IPAddress.Loopback, port));
        }

        // OSC strings are UTF-8, end with a zero byte and are padded to a multiple of 4 bytes.
        private static void AddOscString(List<byte> packet, string value)
        {
            var bytes = Encoding.UTF8.GetBytes(value);
            packet.AddRange(bytes);
            var pad = 4 - (bytes.Length % 4);
            for (var i = 0; i < pad; i++)
                packet.Add(0);
        }
    }
}
