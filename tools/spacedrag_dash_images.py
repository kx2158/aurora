"""Draws the Space Drag tile that shows in the SteamVR dashboard (SpaceDrag/openvr/dash_on.png and dash_off.png).
The tile is 512 x 256. The left part (x < 316) is the on/off switch, the right part is the Reset button.
SpaceDrag/Program.cs splits the click on the same x, so change both together."""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'SpaceDrag', 'openvr')
S = 2  # draw at 2x, then shrink for smooth edges
FONT = '/usr/share/fonts/opentype/inter/'


def font(name, size):
    return ImageFont.truetype(FONT + name, size * S)


def tile(on):
    im = Image.new('RGBA', (512 * S, 256 * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box = lambda x0, y0, x1, y1: [x0 * S, y0 * S, x1 * S, y1 * S]
    d.rounded_rectangle(box(10, 10, 502, 246), radius=24 * S, fill=(21, 21, 26, 245))

    d.text((36 * S, 36 * S), 'SPACE DRAG', font=font('Inter-SemiBold.otf', 17), fill=(205, 205, 210, 255))
    d.text((36 * S, 66 * S), 'Left grip pulls the world', font=font('Inter-Regular.otf', 15), fill=(130, 130, 138, 255))

    # on / off switch
    track = (205, 205, 210, 255) if on else (58, 58, 64, 255)
    d.rounded_rectangle(box(36, 128, 152, 186), radius=29 * S, fill=track, outline=(150, 150, 158, 255), width=2 * S)
    kx = 124 if on else 64
    d.ellipse(box(kx - 22, 135, kx + 22, 179), fill=(21, 21, 26, 255) if on else (150, 150, 158, 255))
    d.text((176 * S, 130 * S), 'ON' if on else 'OFF', font=font('Inter-SemiBold.otf', 46), fill=(240, 240, 244, 255) if on else (130, 130, 138, 255))
    d.text((36 * S, 206 * S), 'Click to turn off' if on else 'Click to turn on', font=font('Inter-Regular.otf', 15), fill=(110, 110, 118, 255))

    # divider and reset button
    d.line([316 * S, 36 * S, 316 * S, 220 * S], fill=(48, 48, 54, 255), width=2 * S)
    d.rounded_rectangle(box(340, 128, 486, 186), radius=29 * S, fill=(50, 50, 56, 255), outline=(150, 150, 158, 255), width=2 * S)
    f = font('Inter-SemiBold.otf', 22)
    w = d.textlength('RESET', font=f)
    d.text((413 * S - w / 2, 142 * S), 'RESET', font=f, fill=(240, 240, 244, 255))
    d.text((340 * S, 206 * S), 'Put the space back', font=font('Inter-Regular.otf', 15), fill=(110, 110, 118, 255))
    return im.resize((512, 256), Image.LANCZOS)


for on in (True, False):
    tile(on).save(os.path.join(OUT, 'dash_%s.png' % ('on' if on else 'off')))
