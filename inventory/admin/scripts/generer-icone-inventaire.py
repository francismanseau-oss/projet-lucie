"""Icône inventaire : logo officiel + cercle vert et + blanc. Ne modifie pas le logo source."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
LOGO = ROOT / "assets" / "logo-fourrures-boreales.png"
OUT_DIR = ROOT / "inventory" / "admin" / "raccourcis"
PNG = OUT_DIR / "inventaire-fourrures-boreales.png"
ICO = OUT_DIR / "inventaire-fourrures-boreales.ico"


def content_box(im: Image.Image):
    gray = im.convert("L")
    mask = gray.point(lambda p: 255 if p < 245 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return (0, 0, im.width, im.height)
    return bbox


def main():
    src = Image.open(LOGO).convert("RGBA")
    box = content_box(src)
    emblem = src.crop(box)
    canvas = Image.new("RGBA", (256, 256), (248, 248, 246, 255))
    fitted = emblem.resize((214, 214), Image.Resampling.LANCZOS)
    canvas.paste(fitted, (14, 28), fitted)
    draw = ImageDraw.Draw(canvas)
    d = 68
    cx, cy = 178, 6
    draw.ellipse((cx, cy, cx + d, cy + d), fill=(31, 138, 76, 255))
    mx = cx + d / 2
    my = cy + d / 2
    arm, thick = 32, 10
    draw.rectangle((mx - thick / 2, my - arm / 2, mx + thick / 2, my + arm / 2), fill=(255, 255, 255, 255))
    draw.rectangle((mx - arm / 2, my - thick / 2, mx + arm / 2, my + thick / 2), fill=(255, 255, 255, 255))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    canvas.save(PNG)
    canvas.save(ICO, sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])
    print(PNG)
    print(ICO)


if __name__ == "__main__":
    main()
