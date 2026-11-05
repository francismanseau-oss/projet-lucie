#!/usr/bin/env python3
"""Audit lecture seule — tailles/formats des 66 produits boutique."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "catalog" / "products.json").read_text(encoding="utf-8"))
products = catalog["products"]

SIZE_LETTER = re.compile(r"\b(XXL|XL|L-XL|M-L|S-M|Small)\b", re.I)
SIZE_SINGLE = re.compile(r"(?:^|[\s—–-])([SML])(?=$|[\s—–-])")
MOIS = re.compile(r"(\d+)\s*[-–à]\s*(\d+)\s*mois", re.I)
ANS = re.compile(r"(\d+)\s*[-–à]\s*(\d+)\s*ans", re.I)
AGE_LABEL = re.compile(
    r"\b(8-10-12|10-14|13-1|0-7|5-12|7-18|8-18|8-24|2-4|4-6|6-8|8-10|10-12|2-3)\b",
    re.I,
)
AUDIENCE = re.compile(r"\b(bébé|bebe|enfant|fille|ado|dame|homme|adulte)\b", re.I)
POINTURES = re.compile(r"pointures?\s*(\d+)\s*[àa]\s*(\d+)", re.I)
SHOE = re.compile(r"\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b")


def extract(p: dict) -> dict:
    name = p["name_fr"]
    pid = p["id"]
    letters: list[str] = []
    # D’abord les gammes composées, puis on retire ces zones avant S/M/L seuls
    name_for_single = name
    for m in SIZE_LETTER.finditer(name):
        tok = m.group(1)
        letters.append("S" if tok.lower() == "small" else tok.upper())
        name_for_single = name_for_single.replace(m.group(0), " ", 1)
    for m in SIZE_SINGLE.finditer(name_for_single):
        letters.append(m.group(1).upper())
    seen: set[str] = set()
    letters = [x for x in letters if not (x in seen or seen.add(x))]

    audience = None
    m = AUDIENCE.search(name)
    if m:
        audience = m.group(1).lower().replace("bébé", "bebe")

    age_band = None
    for pat in (MOIS, ANS, AGE_LABEL):
        m = pat.search(name) or pat.search(pid)
        if m:
            age_band = m.group(0)
            break

    pointure_range = None
    m = POINTURES.search(name)
    if m:
        pointure_range = f"{m.group(1)}-{m.group(2)}"

    shoe = None
    if p["category"] in ("pantoufles", "mukluks", "semelles"):
        m = SHOE.search(name)
        if m and "mois" not in name.lower():
            shoe = f"{m.group(1)}-{m.group(2)}"

    if pointure_range or shoe:
        system = "pointure"
    elif letters:
        system = "lettre_SML"
    elif age_band:
        system = "tranche_age"
    elif audience:
        system = "audience_sans_taille"
    else:
        system = "aucune_taille"

    return {
        "id": pid,
        "n": p.get("product_number"),
        "cat": p["category"],
        "name": name,
        "price": p["price_cad"],
        "letters": letters,
        "age_band": age_band,
        "audience": audience,
        "shoe": shoe,
        "pointure_range": pointure_range,
        "system": system,
        "availability": p.get("availability"),
        "active": p.get("active"),
    }


def strip_size(name: str) -> str:
    s = SIZE_LETTER.sub(" ", name)
    s = re.sub(r"(^|[\s—–-])([SML])(?=$|[\s—–-])", r"\1", s, flags=re.I)
    s = re.sub(
        r"\b\d{1,2}\s*[-–]\s*\d{1,2}(?:\s*[-–]\s*\d{1,2})?\s*(ans|mois)?\b",
        " ",
        s,
        flags=re.I,
    )
    s = POINTURES.sub(" ", s)
    s = re.sub(r"\s*[—–]\s*", " — ", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" —")
    return s


rows = [extract(p) for p in products]
schema_keys = sorted({k for p in products for k in p})
has_variant_field = any(
    any(k in p for k in ("variants", "sizes", "formats", "options", "size"))
    for p in products
)

by_sys: dict[str, list] = defaultdict(list)
for r in rows:
    by_sys[r["system"]].append(r)

by_cat: dict[str, list] = defaultdict(list)
for r in rows:
    by_cat[r["cat"]].append(r)

fam: dict[str, list] = defaultdict(list)
for r in rows:
    fam[f"{r['cat']} | {strip_size(r['name'])}"].append(r)

multi = {k: v for k, v in fam.items() if len(v) > 1}
single = {k: v for k, v in fam.items() if len(v) == 1}

out = {
    "total": len(products),
    "schema_keys": schema_keys,
    "has_variant_or_size_field": has_variant_field,
    "by_system": {k: len(v) for k, v in sorted(by_sys.items(), key=lambda x: -len(x[1]))},
    "categories": {},
    "multi_sku_families": [],
    "single_sku": [],
    "all": rows,
}

for cat, v in sorted(by_cat.items()):
    systems: dict[str, int] = defaultdict(int)
    for r in v:
        systems[r["system"]] += 1
    out["categories"][cat] = {
        "count": len(v),
        "systems": dict(systems),
        "letters": sorted({L for r in v for L in r["letters"]}),
        "age_bands": sorted({r["age_band"] for r in v if r["age_band"]}),
        "pointures": sorted(
            {r["shoe"] or r["pointure_range"] for r in v if r["shoe"] or r["pointure_range"]}
        ),
        "products": [
            {
                "n": r["n"],
                "name": r["name"],
                "system": r["system"],
                "letters": r["letters"],
                "age_band": r["age_band"],
                "shoe": r["shoe"] or r["pointure_range"],
                "price": r["price"],
            }
            for r in sorted(v, key=lambda x: x["n"] or 0)
        ],
    }

for k, v in sorted(multi.items()):
    out["multi_sku_families"].append(
        {
            "family": k,
            "skus": [
                {
                    "n": r["n"],
                    "name": r["name"],
                    "tag": "/".join(r["letters"])
                    or r["age_band"]
                    or r["shoe"]
                    or r["pointure_range"]
                    or "?",
                    "price": r["price"],
                }
                for r in sorted(v, key=lambda x: x["n"] or 0)
            ],
        }
    )

for k, v in sorted(single.items()):
    r = v[0]
    out["single_sku"].append(
        {
            "n": r["n"],
            "name": r["name"],
            "system": r["system"],
            "tag": "/".join(r["letters"])
            or r["age_band"]
            or r["shoe"]
            or r["pointure_range"]
            or "AUCUNE",
            "price": r["price"],
            "cat": r["cat"],
        }
    )

out_path = ROOT / "guides" / "AUDIT-TAILLES-FORMATS-66.json"
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")

# Rapport lisible
lines: list[str] = []
lines.append("# Audit tailles & formats — 66 produits boutique")
lines.append("")
lines.append("**Date :** 2026-11-05")
lines.append("**Périmètre :** `catalog/products.json` (lecture seule) — aucun changement de code tailles.")
lines.append("**Illustrations mensurations :** conservées telles quelles (travail précédent non touché).")
lines.append("")
lines.append("## Constat central")
lines.append("")
lines.append(
    "Aujourd’hui, **chaque taille = un produit séparé** (SKU). "
    "Il n’y a **aucun champ** `sizes` / `variants` / `formats` dans le catalogue. "
    "La boutique n’offre **pas de sélecteur** de taille : le client choisit la carte produit "
    "dont le nom contient déjà la taille (ex. « Mitaines homme M-L — coyote »)."
)
lines.append("")
lines.append(f"- Produits : **{out['total']}**")
lines.append(f"- Champ variante/taille dans le JSON : **{'oui' if out['has_variant_or_size_field'] else 'non'}**")
lines.append(f"- Clés schéma : `{', '.join(out['schema_keys'])}`")
lines.append("")
lines.append("## Répartition par système de taille")
lines.append("")
for k, n in out["by_system"].items():
    label = {
        "lettre_SML": "Lettres (S / M / L / M-L / L-XL…)",
        "tranche_age": "Tranche d’âge / mois",
        "pointure": "Pointure (chaussures / semelles)",
        "audience_sans_taille": "Public indiqué (dame/homme/bébé…) **sans** taille",
        "aucune_taille": "Aucune taille ni public dans le nom",
    }.get(k, k)
    lines.append(f"- **{label}** : {n}")
lines.append("")
lines.append("## Par catégorie")
lines.append("")
for cat, info in out["categories"].items():
    lines.append(f"### {cat} ({info['count']})")
    lines.append("")
    if info["letters"]:
        lines.append(f"- Lettres présentes : {', '.join(info['letters'])}")
    if info["age_bands"]:
        lines.append(f"- Tranches âge : {', '.join(info['age_bands'])}")
    if info["pointures"]:
        lines.append(f"- Pointures : {', '.join(info['pointures'])}")
    lines.append(f"- Systèmes : {info['systems']}")
    lines.append("")
    lines.append("| N° | Nom | Système | Tag taille | Prix |")
    lines.append("|---:|-----|---------|------------|-----:|")
    for p in info["products"]:
        tag = (
            "/".join(p["letters"])
            or p["age_band"]
            or p["shoe"]
            or "—"
        )
        lines.append(
            f"| {p['n']} | {p['name']} | {p['system']} | {tag} | {p['price']} |"
        )
    lines.append("")

lines.append("## Familles multi-SKU (même modèle, plusieurs formats déjà en catalogue)")
lines.append("")
lines.append(
    f"**{len(out['multi_sku_families'])} familles** seulement ont plus d’un SKU "
    "après retrait de la taille du nom. Ailleurs, **un seul format** existe."
)
lines.append("")
for f in out["multi_sku_families"]:
    lines.append(f"### {f['family']}")
    lines.append("")
    for s in f["skus"]:
        lines.append(f"- #{s['n']} — **{s['tag']}** — {s['name']} ({s['price']} $)")
    lines.append("")

lines.append("## Produits sans taille choisissable (nom sans format clair)")
lines.append("")
sans = [r for r in out["all"] if r["system"] in ("aucune_taille", "audience_sans_taille")]
lines.append(f"**{len(sans)} produits** n’ont ni lettre, ni tranche d’âge, ni pointure dans le nom :")
lines.append("")
for r in sorted(sans, key=lambda x: x["n"] or 0):
    lines.append(f"- #{r['n']} [{r['cat']}] {r['name']} — _{r['system']}_")
lines.append("")

lines.append("## Tailles manquantes (lecture catalogue)")
lines.append("")
lines.append(
    "Le catalogue ne définit **pas** une grille cible (ex. S/M/L/XL pour toutes les mitaines). "
    "On ne peut donc lister que ce qui **existe déjà**, et ce qui est **évident comme trou** "
    "à l’intérieur des familles multi-SKU ou par catégorie."
)
lines.append("")
lines.append("### Trous visibles dans les familles multi-SKU")
lines.append("")
lines.append(
    "- **Mitaines — renard** : M (#119) et M-L (#120) existent ; **pas de S, L, XL** séparés."
)
lines.append(
    "- **Mitaines dame — renard** : M (#106) existe à côté de « Mitaines dame — renard roux » (#104) "
    "sans lettre — **incohérent** (modèle proche, une seule taille M)."
)
lines.append(
    "- **Pantoufles dame — vison et renard** : 8-9 (#304) et 9-10 (#305) ; **pas de 6-7, 7-8, 10-11** pour ce modèle."
)
lines.append(
    "- **Pantoufles enfant — … 2-3** : deux fourrures (mouton/coyote vs renard), **une seule pointure 2-3**."
)
lines.append("")
lines.append("### Couverture lettres observée (tous produits)")
letters_all = sorted({L for r in out["all"] for L in r["letters"]})
lines.append(f"- Lettres / gammes présentes quelque part : **{', '.join(letters_all) or 'aucune'}**")
lines.append("- **Absentes du catalogue entier** (jamais utilisées) : `S-M`, `L` seul, `XL` seul, `XXL` (selon extraction).")
lines.append("- Beaucoup de modèles n’offrent **qu’un seul** tag (souvent `M-L`) → pas de vrai choix client.")
lines.append("")
lines.append("### Couverture pointures observée")
pts = sorted(
    {
        r["shoe"] or r["pointure_range"]
        for r in out["all"]
        if r["shoe"] or r["pointure_range"]
    }
)
lines.append(f"- Pointures / plages présentes : **{', '.join(pts)}**")
lines.append(
    "- Semelles (#700) : plage **5 à 12** dans le **nom**, mais **un seul SKU** — "
    "pas de choix de pointure au panier (à clarifier avec Lucie : une paire multi-pointures ou sélection manquante)."
)
lines.append("")

lines.append("## Modifications nécessaires (proposition — pas encore codées)")
lines.append("")
lines.append("Pour que le client **choisisse son format** sur une fiche / carte :")
lines.append("")
lines.append("1. **Décision métier (Lucie)** — pour chaque famille : quelles tailles offrir (S/M/L/XL, M-L seulement, pointures, âges).")
lines.append("2. **Modèle données** — ajouter des variantes (ex. `sizes: [\"S\",\"M\",\"L\"]`) **ou** regrouper les SKU actuels sous un produit parent.")
lines.append("3. **UI boutique** — sélecteur taille obligatoire avant « Ajouter au panier ».")
lines.append("4. **Panier / Stripe / worker** — transmettre la taille choisie (metadata + e-mail Lucie).")
lines.append("5. **Stock / inventaire** — lier la quantité à la variante, pas seulement au modèle.")
lines.append("6. **Sur-mesure** — rester le fallback quand la taille n’existe pas (déjà en place côté créations personnalisées).")
lines.append("")
lines.append("## Ne pas faire avant autorisation")
lines.append("")
lines.append("- Pas de fusion/suppression de SKU.")
lines.append("- Pas de nouveau champ catalogue.")
lines.append("- Pas de sélecteur UI.")
lines.append("- Pas de déploiement / push.")
lines.append("")
lines.append(f"_Données brutes : `{out_path.name}` · script : `scripts/_audit-tailles-66.py`_")

md_path = ROOT / "guides" / "AUDIT-TAILLES-FORMATS-66.md"
md_path.write_text("\n".join(lines), encoding="utf-8")
print(f"OK {out_path}")
print(f"OK {md_path}")
print("total", out["total"])
print("by_system", out["by_system"])
print("multi_families", len(out["multi_sku_families"]))
print("sans_taille", len(sans))
print("letters_all", letters_all)
print("pointures", pts)
