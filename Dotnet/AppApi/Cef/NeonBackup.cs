using System;
using System.IO;
using System.Linq;

namespace VRCX
{
    public partial class AppApi
    {
        /// <summary>
        /// Folder for the automatic database backups (Documents\Neon-backups\auto). Creates it and
        /// keeps only the newest files, so history (time together, online times) can never be lost for good.
        /// </summary>
        public string GetNeonBackupFolder(int keep)
        {
            try
            {
                var dir = Path.Join(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Neon-backups", "auto");
                Directory.CreateDirectory(dir);
                var files = new DirectoryInfo(dir).GetFiles("Neon-*.sqlite3").OrderByDescending(f => f.Name).ToList();
                foreach (var old in files.Skip(Math.Max(3, keep)))
                {
                    try { old.Delete(); } catch { }
                }
                return dir;
            }
            catch
            {
                return "";
            }
        }
    }
}
