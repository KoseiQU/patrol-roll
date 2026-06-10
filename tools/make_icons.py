#!/usr/bin/env python3
"""
パとるロール — アイコン生成スクリプト (P1)
Pillow があれば Pillow で、なければ純Python PNG writer でフォールバック生成。
絵柄: ティール→ブルー縦グラデの角丸正方形、中央に白いマップピン、ピン頭にオレンジのカメラレンズ丸。
"""
import os
import struct
import zlib
import math

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)

# ── colour helpers ─────────────────────────────────────
def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

TEAL = (24, 185, 196)
BLUE = (26, 143, 227)
WHITE = (255, 255, 255)
ORANGE = (255, 138, 61)
BG = (238, 246, 249)

# ── pure-Python PNG writer (no deps) ──────────────────
def write_png(path, pixels, w, h):
    """pixels: list of (r,g,b,a) tuples, row-major."""
    def chunk(name, data):
        c = struct.pack(">I", len(data)) + name + data
        return c + struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)

    raw = b""
    for y in range(h):
        row = b"\x00"  # filter type None
        for x in range(w):
            px = pixels[y * w + x]
            row += bytes(px[:4])
        raw += row

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", idat)
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)

def circle_mask(cx, cy, r, x, y):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2

def rounded_rect_mask(x, y, w, h, r):
    """Returns True if (x,y) is inside the rounded rectangle."""
    if x < 0 or x >= w or y < 0 or y >= h:
        return False
    corners = [(r, r), (w - r - 1, r), (r, h - r - 1), (w - r - 1, h - r - 1)]
    for cx, cy in corners:
        if x < r and y < r and not circle_mask(cx, cy, r, x, y): return False
        if x >= w - r and y < r and not circle_mask(w - r - 1, r, r, x, y): return False
        if x < r and y >= h - r and not circle_mask(r, h - r - 1, r, x, y): return False
        if x >= w - r and y >= h - r and not circle_mask(w - r - 1, h - r - 1, r, x, y): return False
    return True

def make_icon_pixels(size, maskable=False):
    """Generate RGBA pixel list for the icon."""
    w = h = size
    # safe zone for maskable: 80% centred → content in inner 80%
    scale = 0.8 if maskable else 1.0
    off = int(size * (1 - scale) / 2)
    inner = int(size * scale)

    radius = int(inner * 0.22)
    pixels = []

    for y in range(h):
        for x in range(w):
            # map to inner coordinate
            ix = x - off
            iy = y - off

            in_shape = rounded_rect_mask(ix, iy, inner, inner, radius)

            if not in_shape:
                pixels.append((0, 0, 0, 0))
                continue

            # gradient: teal (top) → blue (bottom)
            t = iy / max(inner - 1, 1)
            bg = lerp_color(TEAL, BLUE, t)

            # ── map pin ────────────────────────────────────
            # pin centred horizontally, slightly above centre
            pcx = inner // 2
            pcy = int(inner * 0.42)
            pr  = int(inner * 0.22)   # pin head radius
            # tail: triangle pointing down from pin head bottom
            tail_tip_y = int(inner * 0.74)

            # check if inside pin head circle
            in_head = circle_mask(pcx, pcy, pr, ix, iy)

            # check if inside pin tail (isoceles triangle)
            tail_top_y = pcy + pr
            tail_half_w_at_y = lambda py: max(0, (tail_tip_y - py) / max(tail_tip_y - tail_top_y, 1) * (pr * 0.55))
            in_tail = (iy >= tail_top_y and iy <= tail_tip_y and
                       abs(ix - pcx) <= tail_half_w_at_y(iy))

            in_pin = in_head or in_tail

            # ── camera lens dot (orange circle in pin head) ─
            lens_r = int(pr * 0.40)
            in_lens = circle_mask(pcx, pcy, lens_r, ix, iy)

            if in_pin and not in_lens:
                # white pin with slight anti-alias at edge — just solid white
                pixels.append((*WHITE, 255))
            elif in_pin and in_lens:
                pixels.append((*ORANGE, 255))
            else:
                pixels.append((*bg, 255))

    return pixels

def generate_pillow(path, size, maskable=False):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = 0.8 if maskable else 1.0
    off = int(size * (1 - scale) / 2)
    inner = int(size * scale)
    radius = int(inner * 0.22)

    # rounded rect background with gradient (simulate with rows)
    mask = Image.new("L", (inner, inner), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, inner - 1, inner - 1], radius=radius, fill=255)

    grad = Image.new("RGBA", (inner, inner))
    for iy in range(inner):
        t = iy / max(inner - 1, 1)
        r = int(TEAL[0] + (BLUE[0] - TEAL[0]) * t)
        g = int(TEAL[1] + (BLUE[1] - TEAL[1]) * t)
        b = int(TEAL[2] + (BLUE[2] - TEAL[2]) * t)
        for ix in range(inner):
            grad.putpixel((ix, iy), (r, g, b, 255))

    grad.putalpha(mask)
    img.paste(grad, (off, off), grad)

    # pin
    pcx = off + inner // 2
    pcy = off + int(inner * 0.42)
    pr  = int(inner * 0.22)
    tail_tip_y = off + int(inner * 0.74)

    pin_draw = ImageDraw.Draw(img)
    # pin head
    pin_draw.ellipse([pcx - pr, pcy - pr, pcx + pr, pcy + pr], fill=WHITE)
    # pin tail
    tail_pts = [
        (pcx - int(pr * 0.55), pcy + int(pr * 0.7)),
        (pcx + int(pr * 0.55), pcy + int(pr * 0.7)),
        (pcx, tail_tip_y)
    ]
    pin_draw.polygon(tail_pts, fill=WHITE)
    # lens dot
    lens_r = int(pr * 0.40)
    pin_draw.ellipse([pcx - lens_r, pcy - lens_r, pcx + lens_r, pcy + lens_r], fill=ORANGE)

    img.save(path, "PNG")
    print(f"  [Pillow] {path}")

def generate_fallback(path, size, maskable=False):
    pixels = make_icon_pixels(size, maskable)
    write_png(path, pixels, size, size)
    print(f"  [fallback PNG] {path}")

def generate(path, size, maskable=False):
    try:
        generate_pillow(path, size, maskable)
    except ImportError:
        try:
            import subprocess, sys
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "pillow"],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            generate_pillow(path, size, maskable)
        except Exception:
            generate_fallback(path, size, maskable)

if __name__ == "__main__":
    print("Generating icons…")
    generate(os.path.join(OUT, "icon-192.png"),          192)
    generate(os.path.join(OUT, "icon-512.png"),          512)
    generate(os.path.join(OUT, "icon-maskable-512.png"), 512, maskable=True)
    generate(os.path.join(OUT, "apple-touch-icon.png"),  180)
    print("Done.")
