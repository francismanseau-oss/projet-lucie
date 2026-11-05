#!/usr/bin/env python3
"""Génère mitaines-mesures-fr.webp et mitaines-mesures-en.webp.

Main étroite (~−20 % largeur), doigts longs, pouce naturel,
repères ①/② lisibles, textes contenus, hauteur adaptée au contenu.
"""
from __future__ import annotations

import math
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W = 1200
TITLE_TO_HAND_GAP = 70
BG = (252, 250, 247)
CARD = (255, 252, 248)
INK = (37, 32, 29)
MUTED = (122, 106, 92)
LINE = (203, 178, 158)
BLUE = (37, 99, 196)
HAND = (255, 255, 255)
HAND_OUT = (20, 20, 20)
STROKE = 5

OUT = Path(__file__).resolve().parents[1] / "assets" / "mesures"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def text_size(draw: ImageDraw.ImageDraw, text: str, f) -> tuple[int, int]:
    bb = draw.textbbox((0, 0), text, font=f)
    return bb[2] - bb[0], bb[3] - bb[1]


def wrap_lines(draw, text: str, f, max_w: int) -> list[str]:
    # wrap by words, never overflow max_w
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = w if not cur else f"{cur} {w}"
        if text_size(draw, trial, f)[0] <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            # mot trop long seul → coupe
            if text_size(draw, w, f)[0] > max_w:
                chunk = ""
                for ch in w:
                    t2 = chunk + ch
                    if text_size(draw, t2, f)[0] <= max_w:
                        chunk = t2
                    else:
                        if chunk:
                            lines.append(chunk)
                        chunk = ch
                cur = chunk
            else:
                cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def _finger_poly(cx: float, tip_y: float, base_y: float, half_w: float) -> list[tuple[float, float]]:
    tip_r = half_w
    pts: list[tuple[float, float]] = [(cx - half_w, base_y), (cx - half_w, tip_y + tip_r)]
    for i in range(0, 13):
        a = math.pi + (math.pi * i / 12)
        pts.append((cx + tip_r * math.cos(a), tip_y + tip_r + tip_r * math.sin(a)))
    pts.append((cx + half_w, tip_y + tip_r))
    pts.append((cx + half_w, base_y))
    return pts






def _cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    n: int = 24,
) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for i in range(n + 1):
        t = i / n
        u = 1.0 - t
        x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
        y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
        pts.append((x, y))
    return pts


def draw_hand(draw: ImageDraw.ImageDraw, ox: int, oy: int) -> dict:
    """Paume + 4 doigts + pouce extérieur : un seul contour (aucune ligne dans la paume)."""
    knuckle_y = oy + 175
    half_ws = [15, 17, 15, 13]
    lengths = [168, 198, 178, 148]
    finger_defs = []
    c = ox + 170
    for i, (hw, ln) in enumerate(zip(half_ws, lengths)):
        finger_defs.append((c, hw, ln))
        if i < 3:
            c += hw + half_ws[i + 1] + 11

    palm_left = finger_defs[0][0] - finger_defs[0][1] - 2
    palm_right = finger_defs[-1][0] + finger_defs[-1][1] + 2
    palm_cx = (palm_left + palm_right) / 2
    palm_w = palm_right - palm_left
    wrist_y = oy + 370

    # Côté gauche = silhouette unique : paume → pouce hors paume (incliné) → poignet
    # Aucun trait vertical dans la zone du pouce (prouvé : fill blanc continu)
    shoulder = (palm_left, knuckle_y + 28)
    # Attache basse (base de paume) ; bout arrondi vers le haut-gauche
    attach_hi = (palm_left - 4, oy + 278)
    tip = (palm_left - 102, oy + 292)  # hors paume, légèrement penché à gauche
    attach_lo = (palm_left - 6, oy + 352)
    wrist_L = (palm_left, wrist_y)

    left_side = (
        _cubic(shoulder, (palm_left, oy + 220), (palm_left - 2, oy + 255), attach_hi, n=14)
        + _cubic(attach_hi, (palm_left - 55, oy + 250), (tip[0] + 10, tip[1] - 8), tip, n=24)[1:]
        + _cubic(tip, (tip[0] - 8, tip[1] + 48), (palm_left - 58, oy + 355), attach_lo, n=24)[1:]
        + _cubic(attach_lo, (palm_left - 3, oy + 360), (palm_left, wrist_y - 6), wrist_L, n=12)[1:]
    )
    assert max(p[0] for p in left_side) <= palm_left + 0.5

    # Silhouette unique (sens horaire depuis le poignet gauche)
    outline: list[tuple[float, float]] = [wrist_L]
    outline.extend(reversed(left_side[1:-1]))
    outline.append(shoulder)
    outline.append((palm_left, knuckle_y + 4))
    for cx, half_w, flen in finger_defs:
        tip_y = knuckle_y - flen
        tip_r = half_w
        outline.append((cx - half_w, knuckle_y + 4))
        outline.append((cx - half_w, tip_y + tip_r))
        for i in range(0, 13):
            a = math.pi + (math.pi * i / 12)
            outline.append((cx + tip_r * math.cos(a), tip_y + tip_r + tip_r * math.sin(a)))
        outline.append((cx + half_w, tip_y + tip_r))
        outline.append((cx + half_w, knuckle_y + 4))
    outline += [
        (palm_right, knuckle_y + 4),
        (palm_right, wrist_y),
        (palm_cx, wrist_y + 14),
        (palm_left, wrist_y),
    ]

    draw.polygon(outline, fill=HAND, outline=None)
    draw.line(outline, fill=HAND_OUT, width=STROKE, joint="curve")

    draw.arc(
        [palm_left + 28, wrist_y - 6, palm_right - 16, wrist_y + 16],
        200,
        340,
        fill=HAND_OUT,
        width=3,
    )

    middle_tip = (finger_defs[1][0], knuckle_y - finger_defs[1][2])
    wrist_center = (palm_cx, wrist_y + 3)
    palm_center = (palm_cx, oy + 268)
    # Tour de main = paume seule (hors pouce)
    tape_box = (palm_left + 4, oy + 222, palm_right - 4, oy + 318)

    return {
        "middle_tip": middle_tip,
        "wrist": wrist_center,
        "palm_center": palm_center,
        "tape_box": tape_box,
        "palm_left": palm_left,
        "palm_right": palm_right,
        "palm_w": palm_w,
        "bottom": wrist_y + 22,
        "thumb_left": min(p[0] for p in left_side),
    }


def dashed_ellipse(draw, box, dash=13, gap=9, width=3) -> None:
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    peri = 2 * math.pi * math.sqrt((rx * rx + ry * ry) / 2)
    n = max(48, int(peri / 4))
    pts = [(cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]
    drawing = True
    seg_start = pts[0]
    acc = 0.0
    for i in range(1, len(pts)):
        xA, yA = pts[i - 1]
        xB, yB = pts[i]
        step = math.hypot(xB - xA, yB - yA)
        acc += step
        limit = dash if drawing else gap
        if acc >= limit:
            if drawing:
                draw.line([seg_start, (xB, yB)], fill=BLUE, width=width)
            seg_start = (xB, yB)
            acc = 0.0
            drawing = not drawing
        elif drawing:
            draw.line([(xA, yA), (xB, yB)], fill=BLUE, width=width)


def dashed_hline(draw, x0, x1, y, width=3) -> None:
    x, end = min(x0, x1), max(x0, x1)
    on = True
    while x < end:
        nx = min(end, x + (11 if on else 7))
        if on:
            draw.line([(x, y), (nx, y)], fill=BLUE, width=width)
        x = nx
        on = not on


def arrow_head(draw, tip, direction) -> None:
    x, y = tip
    if direction == "up":
        draw.polygon([(x, y), (x - 8, y + 14), (x + 8, y + 14)], fill=BLUE)
    elif direction == "down":
        draw.polygon([(x, y), (x - 8, y - 14), (x + 8, y - 14)], fill=BLUE)
    elif direction == "left":
        draw.polygon([(x, y), (x + 14, y - 8), (x + 14, y + 8)], fill=BLUE)
    else:
        draw.polygon([(x, y), (x - 14, y - 8), (x - 14, y + 8)], fill=BLUE)


def badge_outline(draw, xy, n, r=18) -> None:
    x, y = xy
    draw.ellipse([x - r, y - r, x + r, y + r], outline=BLUE, width=3, fill=CARD)
    f = font(24, bold=True)
    tw, th = text_size(draw, str(n), f)
    draw.text((x - tw / 2, y - th / 2 - 1), str(n), fill=BLUE, font=f)


def draw_circumference(draw, box) -> None:
    dashed_ellipse(draw, box)
    x0, y0, x1, y1 = box
    cy = (y0 + y1) / 2
    arrow_head(draw, (x0 + 14, cy), "right")
    arrow_head(draw, (x1 - 14, cy), "left")


def draw_length(draw, wrist, tip, arrow_x: float) -> None:
    y0, y1 = wrist[1], tip[1]
    dashed_hline(draw, tip[0] + 2, arrow_x + 12, y1)
    dashed_hline(draw, wrist[0] + 12, arrow_x + 12, y0)
    draw.line([(arrow_x, y0), (arrow_x, y1)], fill=BLUE, width=3)
    arrow_head(draw, (arrow_x, y1), "up")
    arrow_head(draw, (arrow_x, y0), "down")


def render(lang: str) -> Path:
    draft_h = 1000
    img = Image.new("RGB", (W, draft_h), BG)
    draw = ImageDraw.Draw(img)
    margin = 36
    card_l, card_t, card_r = margin, margin, W - margin

    title = "Comment mesurer pour vos mitaines" if lang == "fr" else "How to measure for your mittens"
    f_title = font(34, bold=True)
    draw.text((64, 48), title, fill=INK, font=f_title)
    title_bb = draw.textbbox((64, 48), title, font=f_title)

    sub = (
        "Deux mesures seulement — validées pour la fabrication"
        if lang == "fr"
        else "Two measurements only — confirmed for crafting"
    )
    f_sub = font(22)
    sub_y = title_bb[3] + 8
    draw.text((64, sub_y), sub, fill=MUTED, font=f_sub)
    text_bottom = draw.textbbox((64, sub_y), sub, font=f_sub)[3]

    panel_x0, panel_x1 = 690, 1160
    panel_pad = 28
    panel_inner_w = panel_x1 - panel_x0 - panel_pad * 2

    if lang == "fr":
        circ_title, len_title = "Tour de main", "Longueur de la main"
        items = [
            (1, "Tour de main", "Placez un ruban autour de la paume, au plus large, sans inclure le pouce."),
            (2, "Longueur de la main", "Du pli du poignet jusqu’au bout du majeur."),
        ]
        foot = "Les numéros correspondent aux champs du formulaire."
    else:
        circ_title, len_title = "Hand circumference", "Hand length"
        items = [
            (1, "Hand circumference", "Wrap a tape around the palm at its widest point, not including the thumb."),
            (2, "Hand length", "From the wrist crease to the tip of the middle finger."),
        ]
        foot = "Numbers match the form fields exactly."

    # tip_y ≈ oy + 175 - 198 = oy - 23
    oy = int(text_bottom + TITLE_TO_HAND_GAP + 23)
    pts = draw_hand(draw, 145, oy)  # décalage : pouce entièrement visible à gauche
    gap = pts["middle_tip"][1] - text_bottom
    assert gap >= TITLE_TO_HAND_GAP - 2, f"gap={gap}"

    # Flèche longueur entre main et panneau
    arrow_x = pts["palm_right"] + 48
    assert arrow_x + 100 < panel_x0, "pas assez d’espace pour labels ②"
    draw_circumference(draw, pts["tape_box"])
    draw_length(draw, pts["wrist"], pts["middle_tip"], arrow_x)

    # ① badge au centre ; libellé sous le poignet (hors contour)
    cx, cy = pts["palm_center"]
    badge_outline(draw, (cx, cy), 1)
    f1 = font(20, bold=True)
    label1_y = pts["bottom"] + 6
    lines1 = wrap_lines(draw, circ_title, f1, int(pts["palm_w"] + 80))
    for i, line in enumerate(lines1):
        tw, th = text_size(draw, line, f1)
        draw.text((cx - tw / 2, label1_y + i * (th + 2)), line, fill=BLUE, font=f1)

    # ② badge + libellé à droite de la flèche, colonne bornée avant le panneau
    mid_y = (pts["wrist"][1] + pts["middle_tip"][1]) / 2
    badge2_x = arrow_x + 34
    badge_outline(draw, (badge2_x, mid_y - 8), 2)
    f2 = font(17, bold=True)
    max_w2 = int(panel_x0 - 14 - (badge2_x + 22))
    lines2 = wrap_lines(draw, len_title, f2, max(40, max_w2))
    ty = mid_y + 18
    for line in lines2:
        draw.text((badge2_x - 8, ty), line, fill=BLUE, font=f2)
        ty += text_size(draw, line, f2)[1] + 2

    # Panneau — hauteur selon wrap
    panel_top = int(text_bottom + 14)
    f_item_t = font(22, bold=True)
    f_item_b = font(17)
    f_foot = font(15, bold=True)

    # Pré-calcul hauteur
    y_cursor = 0
    prepared = []
    for n, ttl, body in items:
        ttl_lines = wrap_lines(draw, ttl, f_item_t, panel_inner_w - 44)
        body_lines = wrap_lines(draw, body, f_item_b, panel_inner_w - 44)
        block_h = 8 + len(ttl_lines) * 28 + len(body_lines) * 22 + 18
        prepared.append((n, ttl_lines, body_lines, block_h))
        y_cursor += block_h
    foot_lines = wrap_lines(draw, foot, f_foot, panel_inner_w - 8)
    foot_h = len(foot_lines) * 20 + 22
    panel_content_h = 24 + y_cursor + foot_h + 14
    label1_bottom = label1_y + len(lines1) * 24
    # Une seule hauteur de panneau = max(contenu texte, bas main+libellé)
    panel_bottom = max(panel_top + panel_content_h, label1_bottom + 8)

    draw.rounded_rectangle([panel_x0, panel_top, panel_x1, panel_bottom], radius=12, fill=BG, outline=LINE, width=2)

    y = panel_top + 22
    for n, ttl_lines, body_lines, block_h in prepared:
        badge_outline(draw, (panel_x0 + panel_pad + 14, y + 14), n, r=16)
        tx = panel_x0 + panel_pad + 40
        yy = y
        for line in ttl_lines:
            draw.text((tx, yy), line, fill=INK, font=f_item_t)
            yy += 26
        for line in body_lines:
            draw.text((tx, yy), line, fill=MUTED, font=f_item_b)
            yy += 20
        y += block_h

    fy = panel_bottom - foot_h + 4
    for line in foot_lines:
        draw.text((panel_x0 + panel_pad, fy), line, fill=BLUE, font=f_foot)
        fy += 18

    content_bottom = max(label1_bottom, panel_bottom)
    card_b = content_bottom + 14
    final_h = int(card_b + margin)

    draw.rounded_rectangle([card_l, card_t, card_r, card_b], radius=14, outline=LINE, width=3)

    out_img = img.crop((0, 0, W, final_h))
    out = OUT / f"mitaines-mesures-{lang}.webp"
    out_img.save(out, "WEBP", quality=92, method=6)
    print(
        f"  [{lang}] H={final_h} gap={gap:.0f} palm_w={pts['palm_w']:.0f} "
        f"tip={pts['middle_tip'][1]:.0f} arrow_x={arrow_x:.0f}"
    )
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = []
    for lang in ("fr", "en"):
        path = render(lang)
        im = Image.open(path)
        sizes.append(im.size)
        # Vérifs anti-débordement simples : bande titre sans trait de doigt
        px = im.load()
        dark = 0
        # zone entre sous-titre (~130) et tip-gap : déjà assert gap
        for y in range(130, 175):
            for x in range(100, 450):
                r, g, b = px[x, y]
                if r < 45 and g < 45 and b < 45:
                    dark += 1
        print(f"OK {path.name} {im.size} dark_in_title_gap_band={dark}")
        assert dark == 0, f"doigts dans la zone titre ({dark})"
    assert sizes[0] == sizes[1], sizes


if __name__ == "__main__":
    main()
