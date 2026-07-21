#!/usr/bin/env python3
"""Import the Japanese-candlestick DOCX as Volume 3, Part 2 content."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from convert_docx import convert_file


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "content" / "supplemental" / "3-analyse-technique-partie-2-bougies-japonaises.json"
MEDIA_DIR = ROOT / "public" / "media" / "3-analyse-technique"

FIGURES = [
    ("Anatomie d’une bougie japonaise", "Comparaison de l’anatomie d’une bougie haussière et d’une bougie baissière."),
    ("Doji", "Schéma d’un doji montrant une ouverture et une clôture presque identiques."),
    ("Marteau", "Schéma d’un marteau avec une longue mèche basse après une baisse."),
    ("Marteau inversé", "Schéma d’un marteau inversé avec une longue mèche haute après une baisse."),
    ("Pendu", "Schéma d’un pendu avec une longue mèche basse après une hausse."),
    ("Étoile filante", "Schéma d’une étoile filante montrant le rejet des prix élevés."),
    ("Avalement haussier", "Schéma d’un avalement haussier en deux bougies."),
    ("Avalement baissier", "Schéma d’un avalement baissier en deux bougies."),
    ("Harami haussier", "Schéma d’un harami haussier signalant un essoufflement de la baisse."),
    ("Harami baissier", "Schéma d’un harami baissier signalant un essoufflement de la hausse."),
    ("Ligne pénétrante", "Schéma d’une ligne pénétrante illustrant une reprise acheteuse."),
    ("Nuage noir", "Schéma d’un nuage noir illustrant un rejet vendeur."),
    ("Étoile du matin", "Schéma d’une étoile du matin en trois bougies."),
    ("Étoile du soir", "Schéma d’une étoile du soir en trois bougies."),
    ("Trois soldats blancs", "Schéma de trois soldats blancs montrant une pression acheteuse persistante."),
    ("Trois corbeaux noirs", "Schéma de trois corbeaux noirs montrant une pression vendeuse persistante."),
    ("Trois méthodes ascendantes", "Schéma de trois méthodes ascendantes, figure de continuation haussière."),
    ("Trois méthodes descendantes", "Schéma de trois méthodes descendantes, figure de continuation baissière."),
]


def normalize_blocks(blocks: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    figure_index = 0
    skip_pedagogical_caption = False

    for block in blocks:
        if block.get("type") == "figure":
            title, alt = FIGURES[figure_index]
            block["caption"] = title
            block["alt"] = alt
            block["source"] = "Schéma pédagogique original — prix fictifs, proportions indicatives."
            normalized.append(block)
            figure_index += 1
            skip_pedagogical_caption = True
            continue

        if (
            skip_pedagogical_caption
            and block.get("type") == "paragraph"
            and str(block.get("text", "")).startswith("Schéma pédagogique original")
        ):
            skip_pedagogical_caption = False
            continue
        skip_pedagogical_caption = False

        if (
            block.get("type") == "callout"
            and str(block.get("label", "")).upper().startswith("LE LIEN AVEC LES AUTRES VOLUMES")
        ):
            block["text"] = (
                "Le Volume 1 donne le cadre d’analyse et de risque. Le Volume 2 montre les conséquences "
                "d’un mauvais financement ou d’un contrôle insuffisant. La Partie 1 du Volume 3 pose le "
                "contexte, les unités de temps, les tendances, les supports et les résistances. Cette Partie 2 "
                "revient au langage premier du marché : le prix lui-même."
            )

        normalized.append(block)

    if figure_index != len(FIGURES):
        raise ValueError(f"Expected {len(FIGURES)} figures, imported {figure_index}")
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Source DOCX for Volume 3, Part 2")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    labels = json.loads((ROOT / "config" / "callout-labels.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="tradevisionpro-part2-") as temporary:
        raw_output = Path(temporary) / "raw.json"
        result = convert_file(
            source=args.source,
            output=raw_output,
            media_dir=MEDIA_DIR,
            public_media_url="/media/3-analyse-technique",
            label_variants=labels,
            metadata_overrides={"slug": "3-analyse-technique-bougies-japonaises"},
        )

    cover_lines = [
        line.replace("VOLUME 4", "VOLUME 3 · PARTIE 2")
        for line in result["metadata"].get("coverLines", [])
    ]
    supplemental = {
        "schemaVersion": 1,
        "source": result["source"],
        "metadata": {
            "title": "L’essentiel des bougies japonaises",
            "subtitle": "Anatomie · psychologie · contexte · figures essentielles",
            "description": "Une bougie raconte ce qui s’est passé. Le contexte décide si cette histoire est utile.",
            "edition": "VOLUME 3 · PARTIE 2 · NIVEAU DÉBUTANT · ÉDITION 2026",
            "coverLines": cover_lines,
        },
        "blocks": normalize_blocks(result["blocks"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(supplemental, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(supplemental['blocks'])} blocks and {len(FIGURES)} figures into {args.output}")


if __name__ == "__main__":
    main()
