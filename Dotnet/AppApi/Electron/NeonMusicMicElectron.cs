namespace VRCX
{
    public partial class AppApi
    {
        /// <summary>Music to mic is only available in the Windows build.</summary>
        public string GetNeonAudioDevices() => "{}";
        public string GetNeonAudioApps() => "[]";
        public bool NeonMusicMicStart(string json) => false;
        public void NeonMusicMicStop() { }
        public void NeonMusicMicVolume(double music, double mic) { }
        public string NeonMusicMicStatus() => "{}";
    }
}
