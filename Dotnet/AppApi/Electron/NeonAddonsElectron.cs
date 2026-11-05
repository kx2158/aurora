namespace VRCX
{
    public partial class AppApi
    {
        /// <summary>Add-ons are only available in the Windows build for now.</summary>
        public void OpenNeonAddonsFolder()
        {
        }

        public string ListNeonAddons()
        {
            return "[]";
        }

        public string ReadNeonAddonFile(string addonId, string relativePath)
        {
            return "";
        }
    }
}
