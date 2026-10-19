"""Draw the Akari icon: a lit kato-mado (火灯窓) window on a rainy night.

Writes, under src/renderer/assets:
  icon.png        512 px tile: window icon on Windows, README
  brand-mark.png  64 px tile drawn for the 25 px title-bar mark
  icon.ico        Windows sizes 16-256, each drawn for its size
  icon.icns       Mac sizes 32-1024 on Apple's icon grid (824 px body in a
                  1024 px canvas, with its drop shadow)

Small sizes are drawn, not shrunk: rain and the shoji lattice go first, then
the art is cropped closer so the window keeps its outline at 16 px.

Requires Python 3 with Pillow and CairoSVG:
  python3 -m pip install pillow cairosvg
  python3 scripts/make-icon.py
"""
import io
import math
from pathlib import Path

import cairosvg
from PIL import Image, ImageFilter

DEST = Path(__file__).resolve().parents[1] / 'src' / 'renderer' / 'assets'

NIGHT_TOP, NIGHT_BOTTOM = '#18263a', '#05080d'
LAMP = '#ffc978'
GLASS = ('#fff8e6', '#ffe9b8', '#f7c977', '#e0975a')  # lamp side to the arch tip
WOOD = '#3a2414'
SILL, SILL_EDGE = '#26323a', '#3a4a54'
RAIN = '#9fb6c8'


def window_outline():
    """Kato-mado outline, symmetric about x = 512 on a 1024 canvas.

    Slightly tapered jambs, the outward flick where the arch springs, a bell
    that rises from the flick and a concave neck into the point.
    """
    cx, bottom, hb, hj, jt = 512, 860, 214, 198, 566
    ear_x, ear_y = 56, 24
    curl_x, curl_y = 200, 506
    shoulder = (446, 296)
    tip, bulge, neck = 180, 2.8, 0.5
    ex, ey = cx - hj - ear_x, jt - ear_y
    ux, uy = cx - curl_x, curl_y
    sx, sy = shoulder
    left = [  # each entry: control 1, control 2, end point (left side, upwards)
        ((cx - hj - 14, jt - 1), (ex + 8, jt - 6), (ex, ey)),
        ((ex + 18, ey), (ux - 6, uy + 30), (ux, uy)),
        ((ux + 6 * bulge, uy - 30 * bulge), (sx - 60, sy + 48), (sx, sy)),
        ((sx + 60 * neck, sy - 48 * neck), (cx - 4, tip + 44), (cx, tip)),
    ]
    p = lambda pt: f'{pt[0]:.1f},{pt[1]:.1f}'
    mirror = lambda pt: (2 * cx - pt[0], pt[1])
    d = f'M{p((cx - hb, bottom))} L{p((cx - hj, jt))} '
    starts = [(cx - hj, jt)] + [seg[2] for seg in left[:-1]]
    d += ' '.join(f'C{p(c1)} {p(c2)} {p(end)}' for c1, c2, end in left)
    for (c1, c2, _), start in zip(reversed(left), reversed(starts)):
        d += f' C{p(mirror(c2))} {p(mirror(c1))} {p(mirror(start))}'
    return d + f' L{p(mirror((cx - hb, bottom)))} Z'


WINDOW = window_outline()
RAIN_STREAKS = [(196, 132), (132, 404), (214, 640), (300, 70), (842, 120),
                (900, 380), (828, 600), (930, 820), (110, 840), (742, 40)]


def art(detail):
    """SVG for one level of detail.

    2: everything (about 96 px and up); 1: no rain or lattice, one mullion,
    cropped closer (32-95 px); 0: the lit outline only (under 32 px).
    """
    view = {2: '0 0 1024 1024', 1: '72 96 880 880', 0: '112 136 800 800'}[detail]
    s = [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">
<defs>
<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{NIGHT_TOP}"/><stop offset="1" stop-color="{NIGHT_BOTTOM}"/></linearGradient>
<radialGradient id="halo" cx="512" cy="590" r="480" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{LAMP}" stop-opacity=".34"/><stop offset=".45" stop-color="{LAMP}" stop-opacity=".11"/><stop offset="1" stop-color="{LAMP}" stop-opacity="0"/></radialGradient>
<radialGradient id="pool" cx="512" cy="900" r="300" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 900) scale(1 .22) translate(0 -900)"><stop offset="0" stop-color="{LAMP}" stop-opacity=".26"/><stop offset="1" stop-color="{LAMP}" stop-opacity="0"/></radialGradient>
<radialGradient id="glass" cx="512" cy="880" r="700" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{GLASS[0]}"/><stop offset=".38" stop-color="{GLASS[1]}"/><stop offset=".76" stop-color="{GLASS[2]}"/><stop offset="1" stop-color="{GLASS[3]}"/></radialGradient>
<clipPath id="window"><path d="{WINDOW}"/></clipPath>
</defs>
<rect width="1024" height="1024" fill="url(#night)"/>''']
    if detail == 2:
        streaks = ''.join(f'<line x1="{x}" y1="{y}" x2="{x - 44}" y2="{y + 108}"/>' for x, y in RAIN_STREAKS)
        s.append(f'<g stroke="{RAIN}" stroke-opacity=".26" stroke-width="9" stroke-linecap="round">{streaks}</g>')
    s.append('<rect width="1024" height="1024" fill="url(#halo)"/>')
    s.append('<rect x="160" y="860" width="704" height="100" fill="url(#pool)"/>')
    s.append(f'<path d="{WINDOW}" fill="url(#glass)"/>')
    inside = []
    if detail >= 1:
        inside.append(f'<line x1="512" y1="860" x2="512" y2="160" stroke="{WOOD}" stroke-opacity=".5" stroke-width="{13 if detail == 2 else 22}"/>')
    if detail == 2:
        rails = ''.join(f'<line x1="240" y1="{y}" x2="784" y2="{y}"/>' for y in (566, 664, 762))
        stiles = ''.join(f'<line x1="{x}" y1="860" x2="{x}" y2="160"/>' for x in (414, 610))
        inside.append(f'<g stroke="{WOOD}" stroke-opacity=".24" stroke-width="7">{rails}{stiles}</g>')
        # A soft inner edge gives the frame some depth.
        inside.append(f'<path d="{WINDOW}" fill="none" stroke="#2a1608" stroke-opacity=".22" stroke-width="30"/>')
    if inside:
        s.append('<g clip-path="url(#window)">' + ''.join(inside) + '</g>')
    s.append(f'<rect x="270" y="858" width="484" height="28" rx="8" fill="{SILL}"/>'
             f'<rect x="270" y="858" width="484" height="5" rx="2.5" fill="{SILL_EDGE}"/>')
    s.append('</svg>')
    return '\n'.join(s)


def detail_for(pixels):
    return 2 if pixels >= 96 else 1 if pixels >= 32 else 0


def squircle(n=5.0, steps=900):
    """Superellipse close to the continuous-corner shape of Mac and iOS icons."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        x = 512 + 512 * math.copysign(abs(c) ** (2 / n), c)
        y = 512 + 512 * math.copysign(abs(s) ** (2 / n), s)
        pts.append(f'{x:.2f},{y:.2f}')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M{" L".join(pts)} Z" fill="#fff"/></svg>'


SQUIRCLE = squircle()


def render(svg, pixels):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=pixels, output_height=pixels)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def tile(pixels, margin, shadow=False):
    """The art clipped to the squircle, `margin` (a fraction) in from each edge.

    Small sizes are drawn at 4x and reduced, which keeps the edges smooth.
    """
    scale = 4 if pixels < 256 else 1
    canvas_px = pixels * scale
    body = round(canvas_px * (1 - 2 * margin))
    offset = (canvas_px - body) // 2
    body_detail = detail_for(round(pixels * (1 - 2 * margin)))
    mask = render(SQUIRCLE, body).getchannel('A')
    out = Image.new('RGBA', (canvas_px, canvas_px), (0, 0, 0, 0))
    if shadow:
        alpha = Image.new('L', (canvas_px, canvas_px), 0)
        alpha.paste(mask, (offset, offset + round(canvas_px * 0.012)))
        alpha = alpha.filter(ImageFilter.GaussianBlur(canvas_px * 0.014)).point(lambda v: v // 2)
        shade = Image.new('RGBA', (canvas_px, canvas_px), (0, 0, 0, 0))
        shade.putalpha(alpha)
        out.alpha_composite(shade)
    layer = Image.new('RGBA', (canvas_px, canvas_px), (0, 0, 0, 0))
    layer.paste(render(art(body_detail), body), (offset, offset), mask)
    out.alpha_composite(layer)
    return out if scale == 1 else out.resize((pixels, pixels), Image.LANCZOS)


def icns(images):
    """Every size iconutil writes, as PNG entries (Pillow's writer skips 16 and 32 px)."""
    types = [(b'icp4', 16), (b'icp5', 32), (b'icp6', 64), (b'ic07', 128), (b'ic08', 256), (b'ic09', 512),
             (b'ic10', 1024), (b'ic11', 32), (b'ic12', 64), (b'ic13', 256), (b'ic14', 512)]
    entries = []
    for kind, px in types:
        data = io.BytesIO()
        images[px].save(data, 'PNG', optimize=True)
        entries.append(kind + (8 + len(data.getvalue())).to_bytes(4, 'big') + data.getvalue())
    toc = b''.join(entry[:8] for entry in entries)
    toc = b'TOC ' + (8 + len(toc)).to_bytes(4, 'big') + toc
    body = toc + b''.join(entries)
    return b'icns' + (8 + len(body)).to_bytes(4, 'big') + body


def main():
    tile(512, margin=0.02).save(DEST / 'icon.png', optimize=True)
    tile(64, margin=0.02).save(DEST / 'brand-mark.png', optimize=True)

    windows = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
    frames = [tile(px, margin=0.02) for px in windows]
    frames[-1].save(DEST / 'icon.ico', sizes=[(px, px) for px in windows], append_images=frames[:-1])

    # Apple's grid: an 824 px body centred in 1024 px, with a soft shadow.
    mac = {px: tile(px, margin=100 / 1024, shadow=True) for px in (16, 32, 64, 128, 256, 512, 1024)}
    (DEST / 'icon.icns').write_bytes(icns(mac))
    for name in ('icon.png', 'brand-mark.png', 'icon.ico', 'icon.icns'):
        print(DEST / name)


if __name__ == '__main__':
    main()
