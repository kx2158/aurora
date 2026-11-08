namespace VRCX
{
    /// <summary>The desktop overlay is only available in the Windows build.</summary>
    public partial class AppApi
    {
        public bool SetDeskOverlayHotkey(string combo) => false;
        public void ToggleDeskOverlay() { }
        public void DeskOverlayState(string json) { }
    }
}
