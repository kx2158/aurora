using System;
using System.Data.SQLite;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Text.Json;
using System.Threading;
using NLog;
using NLog.Targets;
#if !LINUX
using System.Windows.Forms;
using VRCX.Overlay;
#endif

namespace VRCX
{
    public static class Program
    {
        public static string BaseDirectory { get; private set; }
        public static string AppDataDirectory;
        public static string ConfigLocation { get; private set; }
        public static string Version { get; private set; }
        public static bool LaunchDebug;
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();
        public static AppApi AppApiInstance { get; private set; }

        private static void CopyMissing(string from, string to)
        {
            Directory.CreateDirectory(to);
            foreach (var file in Directory.GetFiles(from))
            {
                var target = Path.Join(to, Path.GetFileName(file));
                if (!File.Exists(target))
                    File.Copy(file, target);
            }
            foreach (var dir in Directory.GetDirectories(from))
                CopyMissing(dir, Path.Join(to, Path.GetFileName(dir)));
        }

        private static void SetProgramDirectories()
        {
            if (string.IsNullOrEmpty(AppDataDirectory))
            {
                var roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                var neonDirectory = Path.Join(roaming, "Neon");
                var legacyDirectory = Path.Join(roaming, "VRCX");

                // data from before the rename: move the whole folder over so nothing is lost
                if (!Directory.Exists(neonDirectory) && Directory.Exists(legacyDirectory))
                {
                    try
                    {
                        Directory.Move(legacyDirectory, neonDirectory);
                    }
                    catch
                    {
                        neonDirectory = legacyDirectory;
                    }
                }

                // Neon folder already exists (an earlier run made it) but holds no history: pull the old data in
                else if (Directory.Exists(neonDirectory) && Directory.Exists(legacyDirectory)
                         && !File.Exists(Path.Join(neonDirectory, "Neon.sqlite3"))
                         && !File.Exists(Path.Join(neonDirectory, "VRCX.sqlite3"))
                         && (File.Exists(Path.Join(legacyDirectory, "VRCX.sqlite3"))
                             || File.Exists(Path.Join(legacyDirectory, "Neon.sqlite3"))))
                {
                    try
                    {
                        CopyMissing(legacyDirectory, neonDirectory);
                    }
                    catch
                    {
                        neonDirectory = legacyDirectory;
                    }
                }

                AppDataDirectory = neonDirectory;
            }

            BaseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            RenameLegacyFiles();
            ConfigLocation = Path.Join(AppDataDirectory, "Neon.sqlite3");

            if (!Directory.Exists(AppDataDirectory))
            {
                Directory.CreateDirectory(AppDataDirectory);

                // Migrate config to AppData
                if (File.Exists(Path.Join(BaseDirectory, "Neon.json")))
                {
                    File.Move(Path.Join(BaseDirectory, "Neon.json"), Path.Join(AppDataDirectory, "Neon.json"));
                    File.Copy(Path.Join(AppDataDirectory, "Neon.json"),
                        Path.Join(AppDataDirectory, "Neon-backup.json"));
                }

                if (File.Exists(Path.Join(BaseDirectory, "Neon.sqlite3")))
                {
                    File.Move(Path.Join(BaseDirectory, "Neon.sqlite3"),
                        Path.Join(AppDataDirectory, "Neon.sqlite3"));
                    File.Copy(Path.Join(AppDataDirectory, "Neon.sqlite3"),
                        Path.Join(AppDataDirectory, "Neon-backup.sqlite3"));
                }
            }

            // Migrate cache to userdata for Cef 115 update
            var oldCachePath = Path.Join(AppDataDirectory, "cache");
            var newCachePath = Path.Join(AppDataDirectory, "userdata", "cache");
            if (Directory.Exists(oldCachePath) && !Directory.Exists(newCachePath))
            {
                Directory.CreateDirectory(Path.Join(AppDataDirectory, "userdata"));
                Directory.Move(oldCachePath, newCachePath);
            }
        }

        /// <summary>Gives the data files their new names (history, settings and their backups).</summary>
        private static void RenameLegacyFiles()
        {
            try
            {
                if (!Directory.Exists(AppDataDirectory))
                    return;

                foreach (var file in Directory.GetFiles(AppDataDirectory, "VRCX*"))
                {
                    var name = Path.GetFileName(file);
                    var target = Path.Join(AppDataDirectory, "Neon" + name.Substring(4));
                    if (!File.Exists(target))
                        File.Move(file, target);
                }
            }
            catch (Exception ex)
            {
                logger.Warn(ex, "Could not rename old data files");
            }
        }

        private static void GetVersion()
        {
            try
            {
                var versionFile = File.ReadAllText(Path.Join(BaseDirectory, "Version")).Trim();

                // look for trailing git hash "-22bcd96" to indicate nightly build
                var version = versionFile.Split('-');
                if (version.Length > 0 && version[^1].Length == 7)
                    Version = $"Aurora Nightly {versionFile}";
                else
                    Version = $"Aurora {versionFile}";
            }
            catch (Exception ex)
            {
                logger.Error(ex, "Failed to read version file");
                Version = "Aurora Nightly Build";
            }
        }

        private static void ConfigureLogger()
        {
            var fileName = Path.Join(AppDataDirectory, "logs", "Neon.log");
            if (StartupArgs.LaunchArguments.IsOverlay)
                fileName = Path.Join(AppDataDirectory, "logs", "Neon.Overlay.log");

            LogManager.Setup().LoadConfiguration(builder =>
            {
                var fileTarget = new FileTarget("fileTarget")
                {
                    FileName = fileName,
                    //Layout = "${longdate} [${level:uppercase=true}] ${logger} - ${message} ${exception:format=tostring}",
                    // Layout with padding between the level/logger and message so that the message always starts at the same column
                    Layout =
                        "${longdate} [${level:uppercase=true:padding=-5}] ${logger:padding=-20} - ${message} ${exception:format=tostring}",
                    ArchiveSuffixFormat = "{0:000}",
                    ArchiveEvery = FileArchivePeriod.Day,
                    MaxArchiveFiles = 4,
                    MaxArchiveDays = 7,
                    ArchiveAboveSize = 10000000,
                    ArchiveOldFileOnStartup = true,
                    KeepFileOpen = true,
                    AutoFlush = true,
                    Encoding = System.Text.Encoding.UTF8
                };
                builder.ForLogger().FilterMinLevel(LogLevel.Debug).WriteTo(fileTarget);

                var consoleTarget = new ConsoleTarget("consoleTarget")
                {
                    Layout = "${longdate} [${level:uppercase=true:padding=-5}] ${logger:padding=-20} - ${message} ${exception:format=tostring}",
                    DetectConsoleAvailable = true
                };
                builder.ForLogger().FilterMinLevel(LogLevel.Debug).WriteTo(consoleTarget);
            });
        }

#if !LINUX
        [STAThread]
        [SuppressMessage("Interoperability", "CA1416:Validate platform compatibility")]
        private static void Main()
        {
            BrowserSubprocess.Start();
            if (Wine.GetIfWine())
            {
                MessageBox.Show(
                    "Aurora has detected Wine.\nAurora needs Windows.",
                    "Wine Detected", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            try
            {
                Run();
            }

            #region Handle CEF Explosion

            catch (FileNotFoundException e)
            {
                logger.Error(e, "Handled Exception, Missing file found in Handle Cef Explosion.");

                var result = MessageBox.Show(
                    "Aurora has encountered an error with the CefSharp backend,\nthis is typically caused by missing files or dependencies.\nWould you like to try autofix by automatically installing vc_redist?.",
                    "Aurora CefSharp not found.", MessageBoxButtons.YesNo, MessageBoxIcon.Error);
                switch (result)
                {
                    case DialogResult.Yes:
                        logger.Fatal("Handled Exception, user selected auto install of vc_redist.");
                        Update.DownloadInstallRedist().GetAwaiter().GetResult();
                        MessageBox.Show(
                            "vc_redist has finished installing, if the issue persists upon next restart, please reinstall Aurora from the latest release,\nNeon will now restart.",
                            "vc_redist installation complete", MessageBoxButtons.OK);
                        Thread.Sleep(5000);
                        AppApiInstance.RestartApplication(false);
                        break;

                    case DialogResult.No:
                        logger.Fatal("Handled Exception, user chose manual.");
                        MessageBox.Show(
                            "Aurora will now close, try reinstalling Aurora using the latest setup as a potential fix.",
                            "Aurora CefSharp not found", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        Thread.Sleep(5000);
                        Environment.Exit(0);
                        break;
                }
            }

            #endregion

            #region Handle Database Error

            catch (SQLiteException e)
            {
                logger.Fatal(e, "Unhandled SQLite Exception, closing.");
                var messageBoxResult = MessageBox.Show(
                    "A fatal database error has occured.\n" +
                    "Please try to repair your database by following the steps in the provided repair guide, or alternatively rename your \"%AppData%\\Neon\" folder to reset Neon. " +
                    "If the issue still persists after following the repair guide please join the Discord (https://vrcx.app/discord) for further assistance. " +
                    "Would you like to open the webpage for database repair steps?\n" +
                    e, "Database error", MessageBoxButtons.YesNo, MessageBoxIcon.Error);
                if (messageBoxResult == DialogResult.Yes)
                {
                    AppApiInstance.OpenLink("https://github.com/kx2158/aurora");
                }
            }

            #endregion

            catch (Exception e)
            {
                var cpuError = WinApi.GetCpuErrorMessage();
                if (cpuError != null)
                {
                    var messageBoxResult = MessageBox.Show(cpuError.Value.Item1, "Potentially Faulty CPU Detected",
                        MessageBoxButtons.YesNo, MessageBoxIcon.Error);
                    if (messageBoxResult == DialogResult.Yes)
                    {
                        AppApiInstance.OpenLink(cpuError.Value.Item2);
                    }
                }

                logger.Fatal(e, "Unhandled Exception, program dying");
                var result = MessageBox.Show(e.ToString(), $"{Version} crashed, open Discord for support?", MessageBoxButtons.YesNo, MessageBoxIcon.Error);
                if (result == DialogResult.Yes)
                {
                    AppApiInstance.OpenLink("https://vrcx.app/discord");
                }
                Environment.Exit(0);
            }
        }

        [SuppressMessage("Interoperability", "CA1416:Validate platform compatibility")]
        private static void Run()
        {
            var args = Environment.GetCommandLineArgs();
            StartupArgs.ArgsCheck(args);
            SetProgramDirectories();
            VRCXStorage.Instance.Load();
            ConfigureLogger();
            GetVersion();
            if (StartupArgs.LaunchArguments.IsOverlay)
                OverlayProgram.OverlayMain();

            Update.Check();

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            logger.Info("{0} Starting...", Version);
            logger.Info("Args: {0}", JsonSerializer.Serialize(StartupArgs.Args));
            if (!string.IsNullOrEmpty(StartupArgs.LaunchArguments.LaunchCommand))
                logger.Info("Launch Command: {0}", StartupArgs.LaunchArguments.LaunchCommand);
            logger.Debug("Wine detection: {0}", Wine.GetIfWine());

            IPCServer.Instance.Init();
            SQLite.Instance.Init();
            AppApiInstance = new AppApiCef();

            ProcessMonitor.Instance.Init();
            Discord.Instance.Init();
            WebApi.Instance.Init();
            LogWatcher.Instance.Init();
            AutoAppLaunchManager.Instance.Init();
            CefService.Instance.Init();
            OverlayServer.Instance.Init();

            Application.Run(new MainForm());

            logger.Info("{0} Exiting...", Version);
            WebApi.Instance.SaveCookies();
            OverlayServer.Instance.Exit();
            CefService.Instance.Exit();
            AutoAppLaunchManager.Instance.Exit();
            LogWatcher.Instance.Exit();
            WebApi.Instance.Exit();
            Discord.Instance.Exit();
            VRCXStorage.Instance.Save();
            SQLite.Instance.Exit();
            ProcessMonitor.Instance.Exit();
        }
#else
        public static VRCXVRInterface VRCXVRInstance;

        public static void PreInit(string version, string[] args)
        {
            Version = version;
            StartupArgs.ArgsCheck(args);
            SetProgramDirectories();
        }

        public static void Init()
        {
            ConfigureLogger();
            Update.Check();

            logger.Info("{0} Starting...", Version);
            logger.Info("Args: {0}", JsonSerializer.Serialize(StartupArgs.Args));
            if (!string.IsNullOrEmpty(StartupArgs.LaunchArguments.LaunchCommand))
                logger.Info("Launch Command: {0}", StartupArgs.LaunchArguments.LaunchCommand);

            AppApiInstance = new AppApiElectron();

            VRCXVRInstance = new VRCXVRElectron();
            VRCXVRInstance.Init();
        }
#endif
    }

#if LINUX
    public class ProgramElectron
    {
        public void PreInit(string version, string[] args)
        {
            Program.PreInit(version, args);
        }

        public void Init()
        {
            Program.Init();
        }
    }
#endif
}
