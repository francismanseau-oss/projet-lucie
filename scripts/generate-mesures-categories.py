#!/usr/bin/env python3
"""Génère les 12 illustrations restantes (6 catégories × FR/EN), 1200×900, une langue/image."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 900
BG = (252, 250, 247)
CARD = (255, 252, 248)
INK = (37, 32, 29)
MUTED = (122, 106, 92)
ACCENT = (150, 80, 53)
LINE = (203, 178, 158)
TAPE = (196, 140, 90)
TAPE_EDGE = (120, 70, 40)
SKIN = (232, 214, 196)
SKIN_OUT = (120, 90, 70)
FABRIC = (210, 190, 170)

OUT = Path(__file__).resolve().parents[1] / "assets" / "mesures"


def font(size: int, bold: bool = False):
    for path in (
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def badge(draw, xy, n):
    r = 28
    x, y = xy
    draw.ellipse([x - r, y - r, x + r, y + r], fill=ACCENT)
    f = font(32, True)
    t = str(n)
    bb = draw.textbbox((0, 0), t, font=f)
    draw.text((x - (bb[2] - bb[0]) / 2, y - (bb[3] - bb[1]) / 2 - 2), t, fill=(255, 255, 255), font=f)


def tape_ellipse(draw, box):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    for t in range(-8, 9):
        col = TAPE if abs(t) < 6 else TAPE_EDGE
        draw.ellipse([cx - rx + t, cy - ry + t, cx + rx - t, cy + ry - t], outline=col, width=2)
    for ang in range(0, 360, 15):
        rad = math.radians(ang)
        px = cx + (rx - 2) * math.cos(rad)
        py = cy + (ry - 2) * math.sin(rad)
        qx = cx + (rx - 12) * math.cos(rad)
        qy = cy + (ry - 12) * math.sin(rad)
        draw.line([(px, py), (qx, qy)], fill=TAPE_EDGE, width=2)


def dim_v(draw, x, y0, y1):
    draw.line([(x, y0), (x, y1)], fill=ACCENT, width=4)
    draw.polygon([(x, min(y0, y1)), (x - 11, min(y0, y1) + 20), (x + 11, min(y0, y1) + 20)], fill=ACCENT)
    draw.polygon([(x, max(y0, y1)), (x - 11, max(y0, y1) - 20), (x + 11, max(y0, y1) - 20)], fill=ACCENT)


def dim_h(draw, y, x0, x1):
    draw.line([(x0, y), (x1, y)], fill=ACCENT, width=4)
    draw.polygon([(min(x0, x1), y), (min(x0, x1) + 20, y - 11), (min(x0, x1) + 20, y + 11)], fill=ACCENT)
    draw.polygon([(max(x0, x1), y), (max(x0, x1) - 20, y - 11), (max(x0, x1) - 20, y + 11)], fill=ACCENT)


def frame(draw):
    draw.rounded_rectangle([40, 40, W - 40, H - 40], radius=16, fill=CARD, outline=LINE, width=3)


def panel_legend(draw, lang, items, foot, provisional=True, panel_box=None):
    panel_x, panel_top, panel_r, panel_bot = panel_box or (700, 155, 1140, 820)
    draw.rounded_rectangle([panel_x, panel_top, panel_r, panel_bot], radius=12, fill=BG, outline=LINE, width=2)
    y = panel_top + 28
    for n, ttl, a, b in items:
        badge(draw, (panel_x + 48, y + 28), n)
        draw.text((panel_x + 90, y), ttl, fill=INK, font=font(26, True))
        draw.text((panel_x + 90, y + 40), a, fill=MUTED, font=font(20))
        if b:
            draw.text((panel_x + 90, y + 68), b, fill=MUTED, font=font(20))
        y += 120 if len(items) > 1 else 150
    if provisional:
        prov = (
            "Mesures provisoires — à valider avec Lucie"
            if lang == "fr"
            else "Provisional measures — pending Lucie validation"
        )
        draw.text((panel_x + 36, panel_bot - 70), prov, fill=ACCENT, font=font(17, True))
    draw.text((panel_x + 36, panel_bot - 38), foot, fill=MUTED, font=font(16, True))


def titles(draw, title, sub):
    draw.text((70, 58), title, fill=INK, font=font(34, True))
    draw.text((70, 106), sub, fill=MUTED, font=font(22))


# --- silhouettes ---

def _cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    n: int = 16,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(n + 1):
        t = i / n
        u = 1.0 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def _toe_lobe(cx: float, tip_y: float, base_y: float, half_w: float, n: int = 16) -> list[tuple[float, float]]:
    """Orteil en capsule courte : côtés légèrement bombés + bout semi-circulaire."""
    tip_r = half_w * 1.05
    shaft = max(8.0, base_y - tip_y - tip_r)
    # Légère courbure des côtés (évite le look « tube »)
    bulge = half_w * 0.12
    pts: list[tuple[float, float]] = []
    # côté gauche base → haut
    pts += _cubic(
        (cx - half_w * 0.85, base_y),
        (cx - half_w - bulge, base_y - shaft * 0.35),
        (cx - half_w - bulge * 0.5, tip_y + tip_r + 4),
        (cx - tip_r, tip_y + tip_r),
        n=8,
    )[:-1]
    for i in range(0, n + 1):
        a = math.pi + (math.pi * i / n)
        pts.append((cx + tip_r * math.cos(a), tip_y + tip_r + tip_r * math.sin(a)))
    # côté droit haut → base
    pts += _cubic(
        (cx + tip_r, tip_y + tip_r),
        (cx + half_w + bulge * 0.5, tip_y + tip_r + 4),
        (cx + half_w + bulge, base_y - shaft * 0.35),
        (cx + half_w * 0.85, base_y),
        n=8,
    )[1:]
    return pts


def draw_foot(draw, ox, oy, scale=1.0):
    """Pied droit vu de dessus — allongé (~+37 % vs ancienne hauteur), largeur stable.

    Proportions locales ≈ L/l ~ 2.6 : avant-pied large, milieu rétréci, talon arrondi,
    5 orteils distincts (gros → petit), 2e orteil le plus long.
    """
    s = scale

    def P(x: float, y: float) -> tuple[float, float]:
        return (ox + x * s, oy + y * s)

    # Largeur locale ~220 ; hauteur tip→talon ~635 (+~38 % vs ancienne ~460)
    # (cx, half_w, tip_y, base_y) — orteils plus courts, tailles décroissantes
    toes = [
        (140, 29, 38, 125),
        (194, 21, 24, 118),  # plus long
        (240, 17, 36, 116),
        (280, 13, 50, 120),
        (312, 10, 68, 128),
    ]

    heel_l = P(178, 605)
    heel_b = P(232, 652)
    heel_r = P(290, 605)
    mid_l = P(168, 405)   # rétrécissement marqué
    ball_l = P(118, 205)  # avant-pied le plus large
    mid_r = P(300, 400)
    ball_r = P(332, 195)
    big_l = P(toes[0][0] - toes[0][1] * 0.9, toes[0][3])

    outline: list[tuple[float, float]] = []
    outline += _cubic(heel_l, P(165, 560), P(160, 480), mid_l, n=22)[:-1]
    outline += _cubic(mid_l, P(155, 300), P(125, 245), ball_l, n=22)[:-1]
    outline += _cubic(ball_l, P(116, 175), P(124, 145), big_l, n=12)[:-1]

    for i, (cx, hw, tip_y, base_y) in enumerate(toes):
        lobe = [P(x, y) for x, y in _toe_lobe(cx, tip_y, base_y, hw, n=20)]
        if i == 0:
            outline.extend(lobe)
        else:
            prev = outline[-1]
            mid_gap = P((toes[i - 1][0] + cx) / 2, (toes[i - 1][3] + base_y) / 2 + 18)
            c1 = P((prev[0] - ox) / s + 2, toes[i - 1][3] + 10)
            outline += _cubic(prev, c1, mid_gap, lobe[0], n=8)[1:]
            outline.extend(lobe[1:])

    pinky = outline[-1]
    outline += _cubic(pinky, P(320, 135), P(328, 165), ball_r, n=12)[1:]
    outline += _cubic(ball_r, P(340, 265), P(318, 330), mid_r, n=20)[1:]
    outline += _cubic(mid_r, P(308, 500), P(302, 560), heel_r, n=20)[1:]
    outline += _cubic(heel_r, P(270, 668), P(192, 668), heel_l, n=24)[1:]

    clean: list[tuple[float, float]] = []
    for pt in outline:
        if not clean or abs(pt[0] - clean[-1][0]) + abs(pt[1] - clean[-1][1]) > 0.5:
            clean.append(pt)
    outline = clean

    draw.polygon(outline, fill=SKIN, outline=None)
    draw.line(outline + [outline[0]], fill=SKIN_OUT, width=3, joint="curve")

    for i in range(4):
        cx0, hw0, _, by0 = toes[i]
        cx1, hw1, _, by1 = toes[i + 1]
        gx = (cx0 + hw0 + cx1 - hw1) / 2
        gy = (by0 + by1) / 2
        draw.line([P(gx, gy - 2), P(gx, gy + 16)], fill=SKIN_OUT, width=2)

    longest = min(toes, key=lambda t: t[2])
    toe_pt = P(longest[0], longest[2])
    return {
        "heel": heel_b,
        "toe": toe_pt,
        "ball_l": ball_l,
        "ball_r": ball_r,
        "mid": P(230, 360),
        "left": min(pt[0] for pt in outline),
        "right": max(pt[0] for pt in outline),
        "top": min(pt[1] for pt in outline),
        "bottom": max(pt[1] for pt in outline),
    }


def draw_head_side(draw, ox, oy):
    """Profil tête simplifié (pour tour de tête)."""
    # ovale tête
    draw.ellipse([ox + 180, oy + 140, ox + 480, oy + 520], fill=SKIN, outline=SKIN_OUT, width=3)
    # oreille
    draw.ellipse([ox + 150, oy + 280, ox + 210, oy + 370], fill=SKIN, outline=SKIN_OUT, width=2)
    # front line zone
    forehead_y = oy + 220
    return {"forehead_y": forehead_y, "cx": ox + 330, "box": (ox + 160, forehead_y - 30, ox + 500, forehead_y + 50)}


def draw_earmuff_head(draw, ox, oy):
    """Vue de face schématique + bandeau."""
    draw.ellipse([ox + 200, oy + 160, ox + 480, oy + 500], fill=SKIN, outline=SKIN_OUT, width=3)
    # oreilles / cache
    draw.ellipse([ox + 140, oy + 280, ox + 220, oy + 380], fill=FABRIC, outline=SKIN_OUT, width=2)
    draw.ellipse([ox + 460, oy + 280, ox + 540, oy + 380], fill=FABRIC, outline=SKIN_OUT, width=2)
    # bandeau
    draw.arc([ox + 180, oy + 200, ox + 500, oy + 360], 200, 340, fill=ACCENT, width=10)
    return {"box": (ox + 170, oy + 200, ox + 510, oy + 340), "cx": ox + 340}


def draw_scarf(draw, ox, oy):
    """Rectangle foulard + flèches L/l."""
    x0, y0, x1, y1 = ox + 80, oy + 260, ox + 560, oy + 420
    draw.rounded_rectangle([x0, y0, x1, y1], radius=8, fill=FABRIC, outline=SKIN_OUT, width=3)
    # franges
    for x in range(int(x0 + 20), int(x1), 28):
        draw.line([(x, y1), (x, y1 + 28)], fill=SKIN_OUT, width=2)
    return {"x0": x0, "y0": y0, "x1": x1, "y1": y1}


def draw_insole(draw, ox, oy):
    """Empreinte semelle."""
    pts = [
        (ox + 220, oy + 500),
        (ox + 160, oy + 380),
        (ox + 170, oy + 220),
        (ox + 230, oy + 110),
        (ox + 320, oy + 80),
        (ox + 400, oy + 110),
        (ox + 450, oy + 220),
        (ox + 455, oy + 380),
        (ox + 400, oy + 500),
    ]
    draw.polygon(pts, fill=(245, 235, 220), outline=SKIN_OUT, width=3)
    heel = (ox + 300, oy + 490)
    toe = (ox + 320, oy + 90)
    w_l, w_r = (ox + 180, oy + 250), (ox + 445, oy + 250)
    return {"heel": heel, "toe": toe, "w_l": w_l, "w_r": w_r}


CATALOG = {
    "pantoufles": {
        "title": {"fr": "Comment mesurer pour vos pantoufles", "en": "How to measure for your slippers"},
        "sub": {
            "fr": "Deux mesures proposées — provisoires (validation Lucie)",
            "en": "Two proposed measurements — provisional (Lucie validation)",
        },
        "items": {
            "fr": [
                (1, "Longueur du pied", "Du talon jusqu’au bout du", "plus long orteil."),
                (2, "Largeur du pied", "Au plus large de l’avant-pied.", ""),
            ],
            "en": [
                (1, "Foot length", "From the heel to the tip of", "the longest toe."),
                (2, "Foot width", "Across the widest part of", "the forefoot."),
            ],
        },
        "alt": {
            "fr": "Schéma : longueur du pied (1) et largeur du pied (2) pour pantoufles.",
            "en": "Diagram: foot length (1) and foot width (2) for slippers.",
        },
    },
    # NOTE 2026-11-05 Francis : mukluks = surtout bébé — ne plus générer de schéma pied adulte.
    # L’UI masque le diagramme (hide_diagram). Gardé ici pour historique seulement.
    "mukluks": {
        "title": {"fr": "Comment mesurer pour vos mukluks", "en": "How to measure for your mukluks"},
        "skip_foot_diagram": True,
        "sub": {
            "fr": "Deux mesures proposées — provisoires (validation Lucie)",
            "en": "Two proposed measurements — provisional (Lucie validation)",
        },
        "items": {
            "fr": [
                (1, "Longueur du pied", "Du talon jusqu’au bout du", "plus long orteil."),
                (2, "Largeur du pied", "Au plus large de l’avant-pied.", ""),
            ],
            "en": [
                (1, "Foot length", "From the heel to the tip of", "the longest toe."),
                (2, "Foot width", "Across the widest part of", "the forefoot."),
            ],
        },
        "alt": {
            "fr": "Schéma : longueur du pied (1) et largeur du pied (2) pour mukluks.",
            "en": "Diagram: foot length (1) and foot width (2) for mukluks.",
        },
    },
    "semelles": {
        "title": {"fr": "Comment mesurer pour vos semelles", "en": "How to measure for your insoles"},
        "sub": {
            "fr": "Longueur requise · largeur facultative — provisoire",
            "en": "Length required · width optional — provisional",
        },
        "items": {
            "fr": [
                (1, "Longueur du pied", "Du talon jusqu’au bout du", "plus long orteil."),
                (2, "Largeur du pied (facultatif)", "Au plus large de l’avant-pied.", ""),
            ],
            "en": [
                (1, "Foot length", "From the heel to the tip of", "the longest toe."),
                (2, "Foot width (optional)", "Across the widest part of", "the forefoot."),
            ],
        },
        "alt": {
            "fr": "Schéma : longueur du pied (1) et largeur du pied facultative (2) pour semelles.",
            "en": "Diagram: foot length (1) and optional foot width (2) for insoles.",
        },
    },
    "chapeaux": {
        "title": {"fr": "Comment mesurer pour vos chapeaux", "en": "How to measure for your hats"},
        "sub": {
            "fr": "Une mesure proposée — provisoire (validation Lucie)",
            "en": "One proposed measurement — provisional (Lucie validation)",
        },
        "items": {
            "fr": [(1, "Tour de tête", "Autour de la tête, au niveau", "du front.")],
            "en": [(1, "Head circumference", "Around the head at", "forehead level.")],
        },
        "alt": {
            "fr": "Schéma : tour de tête au niveau du front (1).",
            "en": "Diagram: head circumference at forehead level (1).",
        },
    },
    "cache-oreilles": {
        "title": {"fr": "Comment mesurer pour vos cache-oreilles", "en": "How to measure for your earmuffs"},
        "sub": {
            "fr": "Une mesure proposée — provisoire (validation Lucie)",
            "en": "One proposed measurement — provisional (Lucie validation)",
        },
        "items": {
            "fr": [(1, "Tour de tête", "Autour de la tête, au niveau", "du front.")],
            "en": [(1, "Head circumference", "Around the head at", "forehead level.")],
        },
        "alt": {
            "fr": "Schéma : tour de tête (1) pour cache-oreilles.",
            "en": "Diagram: head circumference (1) for earmuffs.",
        },
    },
    "foulards": {
        "title": {"fr": "Comment indiquer les mesures de foulard", "en": "How to indicate scarf measurements"},
        "sub": {
            "fr": "Longueur et largeur provisoires — à valider avec Lucie",
            "en": "Provisional length and width — pending Lucie validation",
        },
        "items": {
            "fr": [
                (1, "Longueur souhaitée", "Mesurez la longueur totale", "du foulard désiré."),
                (2, "Largeur souhaitée", "Mesurez la largeur totale", "du foulard désiré."),
            ],
            "en": [
                (1, "Desired length", "Measure the total length", "of the scarf you want."),
                (2, "Desired width", "Measure the total width", "of the scarf you want."),
            ],
        },
        "alt": {
            "fr": "Schéma foulard : longueur (1) et largeur (2) — mesures provisoires.",
            "en": "Scarf diagram: length (1) and width (2) — provisional measures.",
        },
    },
}


def draw_category(draw, cat: str):
    # Mukluks : ne plus dessiner de pied (décision Francis 2026-11-05)
    if cat == "mukluks":
        return None
    if cat == "pantoufles":
        # Pied allongé ; sous le sous-titre pour éviter chevauchement badge ②
        f = draw_foot(draw, 100, 188, 0.90)
        # ① Longueur — à droite du pied
        ax = min(f["right"] + 40, 640)
        dim_v(draw, ax, f["heel"][1], f["toe"][1])
        draw.line([(f["heel"][0], f["heel"][1]), (ax, f["heel"][1])], fill=ACCENT, width=2)
        draw.line([(f["toe"][0], f["toe"][1]), (ax, f["toe"][1])], fill=ACCENT, width=2)
        badge(draw, (ax, (f["heel"][1] + f["toe"][1]) / 2), 1)
        # ② Largeur — au-dessus des orteils (extérieur), sous le sous-titre
        wy = f["top"] - 32
        assert wy - 30 > 135, f"badge ② trop haut (wy={wy})"
        dim_h(draw, wy, f["ball_l"][0], f["ball_r"][0])
        draw.line([(f["ball_l"][0], f["ball_l"][1]), (f["ball_l"][0], wy)], fill=ACCENT, width=2)
        draw.line([(f["ball_r"][0], f["ball_r"][1]), (f["ball_r"][0], wy)], fill=ACCENT, width=2)
        badge(draw, ((f["ball_l"][0] + f["ball_r"][0]) / 2, wy), 2)
        return f
    elif cat == "semelles":
        f = draw_insole(draw, 100, 140)
        dim_v(draw, f["toe"][0] + 100, f["heel"][1], f["toe"][1])
        badge(draw, (f["toe"][0] + 100, (f["heel"][1] + f["toe"][1]) // 2), 1)
        dim_h(draw, f["w_l"][1], f["w_l"][0], f["w_r"][0])
        badge(draw, ((f["w_l"][0] + f["w_r"][0]) // 2, f["w_l"][1]), 2)
    elif cat == "chapeaux":
        h = draw_head_side(draw, 80, 120)
        tape_ellipse(draw, h["box"])
        badge(draw, (h["box"][2] + 20, h["forehead_y"]), 1)
    elif cat == "cache-oreilles":
        h = draw_earmuff_head(draw, 80, 120)
        tape_ellipse(draw, h["box"])
        badge(draw, (h["box"][2] + 15, (h["box"][1] + h["box"][3]) // 2), 1)
    elif cat == "foulards":
        # Foulard à gauche + ② aéré vs foulard et panneau (2026-11-05)
        # PANEL_X doit matcher panel_box dans render()
        PANEL_X = 720
        BADGE_R = 28
        GAP_EDGE = 30  # ≥25–30 px badge↔panneau et badge↔foulard
        s = draw_scarf(draw, 20, 140)  # was ox=80 — décale le foulard à gauche
        # ① longueur — même proportions relatives au foulard
        dim_h(draw, s["y0"] - 40, s["x0"], s["x1"])
        badge(draw, ((s["x0"] + s["x1"]) / 2, s["y0"] - 40), 1)
        # ② largeur — flèche centrée dans l’espace libre (badge centré sur la flèche)
        min_ax = s["x1"] + BADGE_R + GAP_EDGE
        max_ax = PANEL_X - GAP_EDGE - BADGE_R
        ax = (min_ax + max_ax) / 2
        dim_v(draw, ax, s["y0"], s["y1"])
        badge(draw, (ax, (s["y0"] + s["y1"]) / 2), 2)
        return {"panel_box": (PANEL_X, 155, 1145, 820)}


def render(cat: str, lang: str) -> Path:
    meta = CATALOG[cat]
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    frame(draw)
    titles(draw, meta["title"][lang], meta["sub"][lang])
    foot_info = draw_category(draw, cat)
    note = (
        "Les numéros correspondent aux champs du formulaire."
        if lang == "fr"
        else "Numbers match the form fields exactly."
    )
    # Panneau plus compact pour les schémas pied (moins de vide)
    if cat in ("pantoufles", "mukluks") and isinstance(foot_info, dict) and "bottom" in foot_info:
        panel_top = 155
        panel_bot = min(H - 55, max(int(foot_info["bottom"]) + 24, 520))
        panel_legend(
            draw,
            lang,
            meta["items"][lang],
            note,
            provisional=True,
            panel_box=(690, panel_top, 1145, panel_bot),
        )
    elif isinstance(foot_info, dict) and "panel_box" in foot_info:
        panel_legend(
            draw,
            lang,
            meta["items"][lang],
            note,
            provisional=True,
            panel_box=foot_info["panel_box"],
        )
    else:
        panel_legend(draw, lang, meta["items"][lang], note, provisional=True)
    out = OUT / f"{cat}-mesures-{lang}.webp"
    img.save(out, "WEBP", quality=92, method=6)
    return out


def main(only: list[str] | None = None):
    OUT.mkdir(parents=True, exist_ok=True)
    cats = only if only else list(CATALOG)
    for cat in cats:
        if cat not in CATALOG:
            raise SystemExit(f"Catégorie inconnue: {cat}")
        for lang in ("fr", "en"):
            path = render(cat, lang)
            im = Image.open(path)
            assert im.size == (W, H)
            print(f"OK {path.name} {im.size}")


if __name__ == "__main__":
    import sys

    args = [a for a in sys.argv[1:] if a in CATALOG]
    main(args or None)
