"""Standardize the app icon on the login backgrounds.

The AI-generated login art drew its own icon that doesn't match the real
StockMate POS app icon (the green rounded square with a white open box +
checkmark, used by the web favicon, the sidebar, and the Android launcher).

This script stamps the REAL app icon (web/public/favicon-512.png, which has a
transparent background) over the mismatched icon on:
  - the desktop/tablet landscape background (web/public/login-bg.png), and
  - the mobile portrait background, rebuilt from the generated scene.
"""

import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "web", "public")
ASSETS = os.path.join(
    os.path.expanduser("~"),
    ".cursor", "projects", "d-Programming-Files-StockMate-POS", "assets",
)
ICON = os.path.join(PUBLIC, "favicon-512.png")
SCENE = os.path.join(ASSETS, "login-scene-source.png")

PORTRAIT_W, PORTRAIT_H = 1080, 1920


def load_icon_square() -> Image.Image:
    """The real app icon as a clean rounded green square with a transparent bg.

    The source icons (favicon/sidebar/launcher) are rendered on a white-ish
    background with a soft shadow, so alpha/white detection is useless. We
    isolate the icon by detecting GREEN pixels only (the brand square), crop to
    that square, then apply a fresh rounded-rectangle alpha mask so the corners
    are transparent and the white background/shadow is removed entirely.
    """
    ic = Image.open(ICON).convert("RGBA")
    px = ic.load()
    w, h = ic.size
    mask = Image.new("L", (w, h), 0)
    mpx = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if g > 80 and (g - r) > 25 and (g - b) > 10:
                mpx[x, y] = 255
    eroded = mask.filter(ImageFilter.MinFilter(7))
    bbox = eroded.getbbox()
    if not bbox:
        return ic
    ic = ic.crop(bbox)

    # Build a rounded-rect alpha so corners/background are clean transparency.
    iw, ih = ic.size
    radius = int(min(iw, ih) * 0.20)
    alpha = Image.new("L", (iw, ih), 0)
    ImageDraw.Draw(alpha).rounded_rectangle([0, 0, iw - 1, ih - 1], radius=radius, fill=255)
    ic.putalpha(alpha)
    return ic


def stamp_icon(base: Image.Image, center: tuple[int, int], target_w: int) -> None:
    ic = load_icon_square()
    w, h = ic.size
    nh = int(h * target_w / w)
    ic = ic.resize((target_w, nh), Image.LANCZOS)
    x = int(center[0] - target_w / 2)
    y = int(center[1] - nh / 2)
    base.paste(ic, (x, y), ic)


def avg_color(img: Image.Image) -> tuple[int, int, int]:
    px = img.resize((1, 1)).getpixel((0, 0))
    return (int(px[0]), int(px[1]), int(px[2]))


def build_desktop() -> None:
    desk = Image.open(os.path.join(PUBLIC, "login-bg.png")).convert("RGB")
    # Icon sits top-left next to the "StockMate POS" wordmark.
    stamp_icon(desk, center=(164, 133), target_w=150)
    desk.save(os.path.join(PUBLIC, "login-bg.png"), "PNG")
    print("Updated desktop login-bg.png")


def build_mobile() -> None:
    scene = Image.open(SCENE).convert("RGB")
    # Replace the generated top-center icon with the real one.
    stamp_icon(scene, center=(744, 90), target_w=162)

    aw, ah = scene.size
    crop_h = int(ah * 0.73)  # drop the decorative login card at the bottom
    scene = scene.crop((0, 0, aw, crop_h))
    aw, ah = scene.size

    top_color = avg_color(scene.crop((0, 0, aw, 8)))
    side_color = avg_color(scene.crop((0, 0, 24, ah)))
    bottom_color = tuple(int(c * 0.40) for c in side_color)

    grad = Image.new("RGB", (1, PORTRAIT_H))
    for y in range(PORTRAIT_H):
        t = y / (PORTRAIT_H - 1)
        grad.putpixel(
            (0, y),
            (
                int(top_color[0] * (1 - t) + bottom_color[0] * t),
                int(top_color[1] * (1 - t) + bottom_color[1] * t),
                int(top_color[2] * (1 - t) + bottom_color[2] * t),
            ),
        )
    canvas = grad.resize((PORTRAIT_W, PORTRAIT_H))

    target_w = PORTRAIT_W - 40
    scale = target_w / aw
    art = scene.resize((target_w, int(ah * scale)), Image.LANCZOS)
    x0 = (PORTRAIT_W - art.width) // 2
    y0 = 150

    # Asymmetric feather: keep the top branding crisp, blend sides/bottom.
    mask = Image.new("L", art.size, 0)
    ImageDraw.Draw(mask).rectangle(
        [70, 24, art.width - 70, art.height - 90], fill=255
    )
    mask = mask.filter(ImageFilter.GaussianBlur(34))

    canvas.paste(art, (x0, y0), mask)
    canvas.save(os.path.join(PUBLIC, "login-bg-mobile.png"), "PNG")
    print(f"Updated mobile login-bg-mobile.png ({PORTRAIT_W}x{PORTRAIT_H})")


if __name__ == "__main__":
    build_desktop()
    build_mobile()
