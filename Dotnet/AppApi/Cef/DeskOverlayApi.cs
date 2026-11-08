namespace VRCX
{
    /// <summary>Desktop overlay (the panel a hotkey shows over VRChat). See Cef/DeskOverlay.cs.</summary>
    public partial class AppApi
    {
        /// <summary>Sets the hotkey, for example "Ctrl+Shift+A"; empty turns it off. False if Windows refused it.</summary>
        public bool SetDeskOverlayHotkey(string combo)
        {
            return DeskHotkey.Set(combo);
        }

        /// <summary>Shows or hides the overlay, like pressing the hotkey.</summary>
        public void ToggleDeskOverlay()
        {
            DeskOverlayForm.Toggle();
        }

        /// <summary>The app's live state for the overlay (timers, chatbox, mic) as JSON.</summary>
        public void DeskOverlayState(string json)
        {
            DeskOverlayForm.PushState(json);
        }
    }
}
