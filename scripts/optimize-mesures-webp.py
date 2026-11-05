#!/usr/bin/env python3
"""Recompresse les WebP de mensurations (pas les photos produits Lucie).

Conserve une copie dans assets/mesures/_originals/ avant optimisation.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MESURES = ROOT / "assets" / "mesures"
ORIG = MESURES / "_originals"


def main() -> None:
    ORIG.mkdir(parents=True, exist_ok=True)
    files = sorted(MESURES.glob("*-mesures-*.webp"))
    before = 0
    after = 0
    for f in files:
        dest = ORIG / f.name
        if not dest.exists():
            shutil.copy2(f, dest)
        src_size = dest.stat().st_size
        before += src_size
        im = Image.open(dest).convert("RGB")
        assert im.size == (1200, 900), (f.name, im.size)
        im.save(f, "WEBP", quality=78, method=6)
        out_size = f.stat().st_size
        after += out_size
        print(f"{f.name}: {src_size // 1024}KB -> {out_size // 1024}KB")
    saved = 100 * (1 - after / before) if before else 0
    print(f"TOTAL {before / 1024:.0f}KB -> {after / 1024:.0f}KB ({saved:.1f}% saved)")
    print("Photos produits Lucie: non touchees.")


if __name__ == "__main__":
    main()
