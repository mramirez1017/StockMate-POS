"""Compose a true portrait (1080x1920) mobile login background from the
generated landscape scene.

The image generator only outputs landscape art, so we:
  1. crop off the decorative login card at the bottom of the scene,
  2. place the branded scene in the upper area of a tall portrait canvas,
  3. extend a matching dark-green vertical gradient below it, and
  4. feather the scene edges so it blends seamlessly into the gradient,
leaving clean negative space in the vertical center/bottom for the
centered "Sign in with Google" button.
"""

import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(
    os.path.expanduser("~"),
    ".cursor", "projects", "d-Programming-Files-StockMate-POS", "assets",
    "login-scene-source.png",
)
OUT = os.path.join(ROOT, "web", "public", "login-bg-mobile.png")

W, H = 1080, 1920


def avg_color(img: Image.Image) -> tuple[int, int, int]:
    px = img.resize((1, 1)).getpixel((0, 0))
    return (int(px[0]), int(px[1]), int(px[2]))


def main() -> None:
    art = Image.open(SRC).convert("RGB")
    aw, ah = art.size

    # 1) Drop the decorative login card at the bottom (~bottom 27%).
    crop_h = int(ah * 0.73)
    art = art.crop((0, 0, aw, crop_h))
    aw, ah = art.size

    # Representative colors for the extended gradient.
    top_color = avg_color(art.crop((0, 0, aw, 8)))
    side_color = avg_color(art.crop((0, 0, 24, ah)))  # dark-green background edge
    bottom_color = tuple(int(c * 0.40) for c in side_color)

    # 2) Vertical gradient canvas (top_color -> bottom_color), built as a
    # 1px column then stretched (fast, smooth).
    grad = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / (H - 1)
        grad.putpixel(
            (0, y),
            (
                int(top_color[0] * (1 - t) + bottom_color[0] * t),
                int(top_color[1] * (1 - t) + bottom_color[1] * t),
                int(top_color[2] * (1 - t) + bottom_color[2] * t),
            ),
        )
    canvas = grad.resize((W, H))

    # 3) Scale the scene to fit the width (small side margin) and place it
    # in the upper area.
    target_w = W - 40
    scale = target_w / aw
    art_resized = art.resize((target_w, int(ah * scale)), Image.LANCZOS)
    x0 = (W - art_resized.width) // 2
    y0 = 150

    # 4) Feathered alpha mask so the rectangular scene melts into the gradient.
    m = 80
    mask = Image.new("L", art_resized.size, 0)
    d = ImageDraw.Draw(mask)
    d.rectangle([m, m, art_resized.width - m, art_resized.height - m], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(m / 2))

    canvas.paste(art_resized, (x0, y0), mask)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    canvas.save(OUT, "PNG")
    print(f"Wrote {OUT} ({W}x{H})")


if __name__ == "__main__":
    main()
