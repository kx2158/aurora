using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Windows.Media.Editing;
using Windows.Storage;

namespace VRCX
{
    /// <summary>
    /// Video frames for the animated sticker maker, using Windows' own decoders (Media Foundation). Aurora's browser
    /// engine ships without H.264, so most MP4 and MOV files cannot be played or read there. The page sends the file
    /// over in chunks, opens it here, then asks for single frames as PNG.
    /// </summary>
    public partial class AppApiCef
    {
        private sealed class VideoSession
        {
            public string Path;
            public MediaComposition Composition;
            public int Width;
            public int Height;
        }

        private static readonly ConcurrentDictionary<string, VideoSession> VideoSessions = new();
        private static readonly Regex VideoTokenPattern = new("^[A-Za-z0-9]{8,40}$", RegexOptions.Compiled);

        private static string VideoDir() => System.IO.Path.Join(System.IO.Path.GetTempPath(), "AuroraStickers");

        private static string VideoPath(string token, string ext = "")
        {
            if (!VideoTokenPattern.IsMatch(token ?? ""))
                throw new ArgumentException("bad token");
            return System.IO.Path.Join(VideoDir(), token + ext);
        }

        /// <summary>Starts a new upload of a video file. Old leftovers from earlier sessions are cleaned up.</summary>
        public bool VideoBegin(string token)
        {
            try
            {
                Directory.CreateDirectory(VideoDir());
                foreach (var f in Directory.GetFiles(VideoDir()))
                {
                    try
                    {
                        if (DateTime.UtcNow - File.GetLastWriteTimeUtc(f) > TimeSpan.FromHours(1))
                            File.Delete(f);
                    }
                    catch
                    {
                        // in use, leave it
                    }
                }

                File.WriteAllBytes(VideoPath(token, ".part"), Array.Empty<byte>());
                return true;
            }
            catch (Exception ex)
            {
                logger.Error(ex, "VideoBegin");
                return false;
            }
        }

        /// <summary>Adds the next chunk (base64) to the video being sent.</summary>
        public bool VideoAppend(string token, string base64)
        {
            try
            {
                var path = VideoPath(token, ".part");
                if (!File.Exists(path))
                    return false;
                var bytes = Convert.FromBase64String(base64);
                using var fs = new FileStream(path, FileMode.Append, FileAccess.Write);
                fs.Write(bytes, 0, bytes.Length);
                return true;
            }
            catch (Exception ex)
            {
                logger.Error(ex, "VideoAppend");
                return false;
            }
        }

        /// <summary>
        /// Opens the video that was sent. ext is the file's extension without the dot (mp4, mov, ...).
        /// Returns JSON: { durationMs, width, height } or { error }.
        /// </summary>
        public async Task<string> VideoOpen(string token, string ext)
        {
            var result = new JsonObject();
            try
            {
                ext = Regex.Replace(ext ?? "", "[^A-Za-z0-9]", "");
                if (ext.Length == 0 || ext.Length > 5)
                    ext = "mp4";
                var part = VideoPath(token, ".part");
                var path = VideoPath(token, "." + ext);
                if (File.Exists(path))
                    File.Delete(path);
                File.Move(part, path);

                var file = await StorageFile.GetFileFromPathAsync(path);
                var clip = await MediaClip.CreateFromFileAsync(file);
                var props = clip.GetVideoEncodingProperties();
                var composition = new MediaComposition();
                composition.Clips.Add(clip);
                VideoSessions[token] = new VideoSession
                {
                    Path = path,
                    Composition = composition,
                    Width = (int)props.Width,
                    Height = (int)props.Height
                };
                result["durationMs"] = clip.OriginalDuration.TotalMilliseconds;
                result["width"] = (int)props.Width;
                result["height"] = (int)props.Height;
            }
            catch (Exception ex)
            {
                logger.Error(ex, "VideoOpen");
                result["error"] = ex.Message;
            }

            return result.ToJsonString();
        }

        /// <summary>One frame of the opened video at this time, as a base64 PNG no bigger than maxSize on its long side.</summary>
        public async Task<string> VideoFrame(string token, double ms, int maxSize)
        {
            if (!VideoSessions.TryGetValue(token ?? "", out var s))
                return "";
            try
            {
                var longSide = Math.Max(1, Math.Max(s.Width, s.Height));
                var scale = Math.Min(1.0, Math.Max(16, maxSize) / (double)longSide);
                var w = Math.Max(1, (int)Math.Round(s.Width * scale));
                var h = Math.Max(1, (int)Math.Round(s.Height * scale));
                var at = TimeSpan.FromMilliseconds(Math.Max(0, ms));
                using var stream = await s.Composition.GetThumbnailAsync(at, w, h, VideoFramePrecision.NearestFrame);
                using var input = stream.AsStreamForRead();
                // the thumbnail comes back as a bitmap in some container; ImageSharp reads whichever it is
                using var image = SixLabors.ImageSharp.Image.Load(input);
                using var output = new MemoryStream();
                SixLabors.ImageSharp.ImageExtensions.SaveAsPng(image, output);
                return Convert.ToBase64String(output.ToArray());
            }
            catch (Exception ex)
            {
                logger.Error(ex, "VideoFrame");
                return "";
            }
        }

        /// <summary>Forgets the video and deletes its temporary file.</summary>
        public void VideoClose(string token)
        {
            try
            {
                if (VideoSessions.TryRemove(token ?? "", out var s))
                {
                    s.Composition = null;
                    try
                    {
                        File.Delete(s.Path);
                    }
                    catch
                    {
                        // still locked by the decoder; the next VideoBegin cleans it up after an hour
                    }
                }

                var part = VideoPath(token, ".part");
                if (File.Exists(part))
                    File.Delete(part);
            }
            catch (Exception ex)
            {
                logger.Error(ex, "VideoClose");
            }
        }
    }
}
