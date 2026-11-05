#!/usr/bin/env python3
"""Génère des WebP boutique depuis les PNG produits — PNG originaux intacts.

Sortie : assets/produits/webp/<même-nom>.webp
- Redimension max 800px (côté long), proportionnel, pas de recadrage
- Qualité 82 (détail fourrure)
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "produits"
OUT = SRC / "webp"
MAX_SIDE = 800
QUALITY = 82


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pngs = sorted(SRC.glob("*.png"))
    before = after = 0
    for png in pngs:
        before += png.stat().st_size
        im = Image.open(png)
        # Conserver mode adapté (RGBA → RGB+fond neutre pour WebP photo)
        if im.mode in ("RGBA", "P"):
            bg = Image.new("RGB", im.size, (245, 240, 234))
            rgba = im.convert("RGBA")
            bg.paste(rgba, mask=rgba.split()[-1] if rgba.mode == "RGBA" else None)
            im = bg
        else:
            im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, MAX_SIDE / max(w, h))
        if scale < 1.0:
            nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
            im = im.resize((nw, nh), Image.Resampling.LANCZOS)
        dest = OUT / (png.stem + ".webp")
        im.save(dest, "WEBP", quality=QUALITY, method=6)
        after += dest.stat().st_size
        print(f"{png.name}: {png.stat().st_size // 1024}KB -> {dest.name} {dest.stat().st_size // 1024}KB ({im.size[0]}x{im.size[1]})")
    print(
        f"TOTAL PNG {before / 1024 / 1024:.2f}MB -> WebP {after / 1024 / 1024:.2f}MB "
        f"({100 * (1 - after / before):.1f}% si WebP seul) · {len(pngs)} fichiers · PNG intacts"
    )


if __name__ == "__main__":
    main()
