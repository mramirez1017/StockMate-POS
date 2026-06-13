"""Generate web and Android launcher assets from StockMate icon sources."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WEB_PUBLIC = ROOT / "web" / "public"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

WEB_SOURCE = ROOT / "stockmate icon inside app.png"
ANDROID_SOURCE = ROOT / "stockmate icon.png"
ANDROID_LOGIN_SOURCE = ROOT / "android app login screen.png"

ANDROID_DRAWABLE = ANDROID_RES / "drawable-nodpi"

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


def save_web_assets() -> None:
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
    logo = Image.open(WEB_SOURCE).convert("RGBA")

    logo.save(WEB_PUBLIC / "app-logo.png", optimize=True)

    # Sidebar: icon + wordmark only (drop tagline), with inset padding so it fits the header.
    width, height = logo.size
    compact = logo.crop((0, 0, width, int(height * 0.46)))
    pad_x, pad_y = 28, 24
    padded = Image.new(
        "RGBA",
        (compact.width + pad_x * 2, compact.height + pad_y * 2),
        (0, 0, 0, 0),
    )
    padded.paste(compact, (pad_x, pad_y), compact)
    padded.save(WEB_PUBLIC / "app-logo-sidebar.png", optimize=True)

    # Crisp sidebar icon mark (cart graphic only — no wordmark baked in).
    icon_src = Image.open(ANDROID_SOURCE).convert("RGBA")
    iw, ih = icon_src.size
    mark = icon_src.crop((0, 0, iw, int(ih * 0.66)))
    mark = mark.crop(mark.getbbox() or (0, 0, *mark.size))
    side = max(mark.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(mark, ((side - mark.width) // 2, (side - mark.height) // 2), mark)
    square.resize((192, 192), Image.Resampling.LANCZOS).save(
        WEB_PUBLIC / "sidebar-icon.png",
        optimize=True,
    )

    # Square favicon from the icon mark on the left of the horizontal logo.
    side = min(logo.size)
    favicon = logo.crop((0, 0, side, side))
    favicon.save(WEB_PUBLIC / "favicon.png", optimize=True)

    sizes = [16, 32, 48, 64, 128, 192, 512]
    for size in sizes:
        favicon.resize((size, size), Image.Resampling.LANCZOS).save(
            WEB_PUBLIC / f"favicon-{size}.png",
            optimize=True,
        )


def save_login_background_assets() -> None:
    login = Image.open(ANDROID_LOGIN_SOURCE).convert("RGBA")
    WEB_PUBLIC.mkdir(parents=True, exist_ok=True)
    login.save(WEB_PUBLIC / "login-bg.png", optimize=True)
    ANDROID_DRAWABLE.mkdir(parents=True, exist_ok=True)
    login.save(ANDROID_DRAWABLE / "login_background.png", optimize=True)


def save_android_assets() -> None:
    icon = Image.open(ANDROID_SOURCE).convert("RGBA")

    for folder, size in MIPMAP_SIZES.items():
        out_dir = ANDROID_RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        resized = icon.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(out_dir / "ic_launcher.png", optimize=True)
        resized.save(out_dir / "ic_launcher_round.png", optimize=True)

    for folder, size in FOREGROUND_SIZES.items():
        out_dir = ANDROID_RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        icon.resize((size, size), Image.Resampling.LANCZOS).save(
            out_dir / "ic_launcher_foreground.png",
            optimize=True,
        )


def main() -> None:
    if not WEB_SOURCE.exists():
        raise FileNotFoundError(WEB_SOURCE)
    if not ANDROID_SOURCE.exists():
        raise FileNotFoundError(ANDROID_SOURCE)
    if not ANDROID_LOGIN_SOURCE.exists():
        raise FileNotFoundError(ANDROID_LOGIN_SOURCE)

    save_web_assets()
    save_android_assets()
    save_login_background_assets()
    print("Icons generated successfully.")


if __name__ == "__main__":
    main()
