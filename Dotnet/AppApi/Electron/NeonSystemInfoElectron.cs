namespace VRCX
{
    public partial class AppApi
    {
        /// <summary>Window, music and system info are only available in the Windows build for now.</summary>
        public void NeonMediaControl(string action)
        {
        }

        public string GetNeonSystemInfo()
        {
            return "{}";
        }
    }
}
