using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AuroraSpaceDrag;

/// <summary>
/// What Aurora's card controls. Aurora writes this file, the helper reads it (and re-reads it whenever it changes),
/// so there is no network port or pipe to set up. Every value is clamped on read, so a hand edited or half written
/// file can never put the helper in a bad state.
/// </summary>
public sealed class DragSettings
{
    [JsonPropertyName("enabled")] public bool Enabled { get; set; } = true;
    /// <summary>"left", "right" or "both" (both: the hand that grabbed first holds the drag, the other can take over when it lets go).</summary>
    [JsonPropertyName("hand")] public string Hand { get; set; } = "both";
    /// <summary>How far the world moves for one unit of hand movement. 1 is 1:1.</summary>
    [JsonPropertyName("multiplier")] public double Multiplier { get; set; } = 1.0;
    /// <summary>When false, dragging only moves you along the floor.</summary>
    [JsonPropertyName("allowVertical")] public bool AllowVertical { get; set; } = true;
    /// <summary>Comfort mode: the world moves in small steps instead of continuously, which is easier on the stomach.</summary>
    [JsonPropertyName("comfort")] public bool Comfort { get; set; } = false;
    /// <summary>Each increase asks the helper to put the play space back where SteamVR has it.</summary>
    [JsonPropertyName("resetCounter")] public int ResetCounter { get; set; } = 0;

    public const double MinMultiplier = 0.25;
    public const double MaxMultiplier = 6.0;

    public DragSettings Clamped()
    {
        var hand = (Hand ?? "both").ToLowerInvariant();
        return new DragSettings
        {
            Enabled = Enabled,
            Hand = hand is "left" or "right" ? hand : "both",
            Multiplier = double.IsFinite(Multiplier) ? Math.Clamp(Multiplier, MinMultiplier, MaxMultiplier) : 1.0,
            AllowVertical = AllowVertical,
            Comfort = Comfort,
            ResetCounter = ResetCounter
        };
    }

    public static DragSettings Load(string path)
    {
        try
        {
            if (File.Exists(path))
                return (JsonSerializer.Deserialize<DragSettings>(File.ReadAllText(path)) ?? new DragSettings()).Clamped();
        }
        catch
        {
            // a half written file: keep going with defaults, the next read will see the finished one
        }

        return new DragSettings();
    }
}
