#!/usr/bin/env python3
"""Optimise assets UI (logo, favicon) — pas les photos produits Lucie.

Originaux conservés dans assets/_originals-ui/.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ORIG = ASSETS / "_originals-ui"

TARGETS = [
    "logo-fourrures-boreales.png",
    "favicon-flocon.png",
]


def main() -> None:
    ORIG.mkdir(parents=True, exist_ok=True)
    before = after = 0
    for name in TARGETS:
        f = ASSETS / name
        if not f.exists():
            print(f"skip missing {name}")
            continue
        dest = ORIG / name
        if not dest.exists():
            shutil.copy2(f, dest)
        src_size = dest.stat().st_size
        before += src_size
        # Ne pas réécrire le PNG (souvent plus lourd) — conserver l'original,
        # produire seulement un WebP plus léger à côté.
        shutil.copy2(dest, f)
        im = Image.open(dest)
        if im.mode in ("RGBA", "P"):
            im = im.convert("RGBA")
        else:
            im = im.convert("RGB")
        webp = f.with_suffix(".webp")
        im.save(webp, "WEBP", quality=82, method=6)
        after += webp.stat().st_size
        print(f"{name}: PNG {src_size // 1024}KB conservé → WebP {webp.stat().st_size // 1024}KB")
    if before:
        print(f"WebP générés : {after / 1024:.0f}KB (PNG originaux inchangés)")
    print("Photos produits / famille Lucie: non touchees.")


if __name__ == "__main__":
    main()
