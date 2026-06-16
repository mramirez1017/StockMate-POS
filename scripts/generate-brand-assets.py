"""Generate all StockMate web + Android image assets from brand source art.

Sources (committed under ./assets):
  - assets/brand-icon-source.png  : transparent rounded-square app icon mark
  - assets/login-bg-source.png    : login / hero background art

Run:  python scripts/generate-brand-assets.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
WEB_PUBLIC = ROOT / "web" / "public"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"
ANDROID_DRAWABLE = ANDROID_RES / "drawable-nodpi"

ICON_SOURCE = ASSETS / "brand-icon-source.png"
LOGIN_SOURCE = ASSETS / "login-bg-source.png"

MIPMAP_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

# Adaptive foreground safe zone is ~66% of the canvas.
ADAPTIVE_ICON_SCALE = 0.66

FAVICON_SIZES = [16, 32, 48, 64, 128, 192, 512]


def square_trimmed(source: Image.Image, pad_ratio: float = 0.0) -> Image.Image:
    """Crop to the visible art, then center on a transparent square canvas."""
    icon = source.convert("RGBA")
    bbox = icon.getbbox()
    if bbox:
        icon = icon.crop(bbox)
    side = int(max(icon.size) * (1 + pad_ratio * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    offset = ((side - icon.width) // 2, (side - icon.height) // 2)
    canvas.paste(icon, offset, icon)
    return canvas


def save_web_assets(icon_square: Image.Image) -> None:
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)

    icon_square.resize((512, 512), Image.Resampling.LANCZOS).save(
        WEB_PUBLIC / "app-logo.png", optimize=True
    )
    icon_square.resize((192, 192), Image.Resampling.LANCZOS).save(
        WEB_PUBLIC / "sidebar-icon.png", optimize=True
    )

    base = icon_square.resize((512, 512), Image.Resampling.LANCZOS)
    base.save(WEB_PUBLIC / "favicon.png", optimize=True)
    for size in FAVICON_SIZES:
        base.resize((size, size), Image.Resampling.LANCZOS).save(
            WEB_PUBLIC / f"favicon-{size}.png", optimize=True
        )


def save_login_background_assets() -> None:
    login = Image.open(LOGIN_SOURCE).convert("RGBA")
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
    login.save(WEB_PUBLIC / "login-bg.png", optimize=True)
    ANDROID_DRAWABLE.mkdir(parents=True, exist_ok=True)
    login.save(ANDROID_DRAWABLE / "login_background.png", optimize=True)


def save_android_sidebar_icon(icon_square: Image.Image) -> None:
    ANDROID_DRAWABLE.mkdir(parents=True, exist_ok=True)
    icon_square.resize((192, 192), Image.Resampling.LANCZOS).save(
        ANDROID_DRAWABLE / "sidebar_icon.png", optimize=True
    )


def save_android_launcher(icon_square: Image.Image) -> None:
    for folder, size in MIPMAP_SIZES.items():
        out_dir = ANDROID_RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        legacy = icon_square.resize((size, size), Image.Resampling.LANCZOS)
        legacy.save(out_dir / "ic_launcher.png", optimize=True)
        legacy.save(out_dir / "ic_launcher_round.png", optimize=True)

    for folder, canvas_size in FOREGROUND_SIZES.items():
        out_dir = ANDROID_RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        target = max(1, int(canvas_size * ADAPTIVE_ICON_SCALE))
        fitted = icon_square.copy()
        fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        offset = ((canvas_size - fitted.width) // 2, (canvas_size - fitted.height) // 2)
        canvas.paste(fitted, offset, fitted)
        canvas.save(out_dir / "ic_launcher_foreground.png", optimize=True)


def main() -> None:
    if not ICON_SOURCE.exists():
        raise FileNotFoundError(ICON_SOURCE)
    if not LOGIN_SOURCE.exists():
        raise FileNotFoundError(LOGIN_SOURCE)

    icon_square = square_trimmed(Image.open(ICON_SOURCE))

    save_web_assets(icon_square)
    save_login_background_assets()
    save_android_sidebar_icon(icon_square)
    save_android_launcher(icon_square)
    print("Brand assets generated successfully.")


if __name__ == "__main__":
    main()
