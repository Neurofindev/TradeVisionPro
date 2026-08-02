#!/usr/bin/env python3
"""Import the revised chart-patterns DOCX as Volume 3, Part 4 content."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from convert_docx import convert_file


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    ROOT
    / "content"
    / "supplemental"
    / "3-analyse-technique-partie-4-figures-chartistes.json"
)
MEDIA_DIR = ROOT / "public" / "media" / "3-analyse-technique"
START_ID = "1-rappel-des-prerequis-du-volume-3"
QUIZ_ID = "11-qcm-d-auto-evaluation-10-questions"
SOURCES_ID = "sources-et-graphiques"


FIGURES = [
    {
        "caption": "Double sommet sur Amazon : deux tests de la même zone, puis rupture de la ligne de cou.",
        "alt": "Graphique journalier Amazon montrant deux sommets proches, un creux intermédiaire et la rupture baissière de la ligne de cou.",
        "source": "TradingView — graphique pédagogique Amazon",
        "sourceLinks": ["https://www.tradingview.com/chart/cJFsOApx/"],
    },
    {
        "caption": "Épaule-tête-épaule inversée sur Apple : le creux central est le plus profond, puis la ligne de cou est franchie.",
        "alt": "Graphique journalier Apple montrant une épaule-tête-épaule inversée et la cassure haussière de sa ligne de cou.",
        "source": "TradingView — graphique pédagogique Apple",
        "sourceLinks": ["https://www.tradingview.com/chart/cJFsOApx/"],
    },
    {
        "caption": "Triangle symétrique : la direction n’est connue qu’après la clôture hors de la structure.",
        "alt": "Schéma de triangle symétrique montrant des sommets descendants, des creux ascendants et une sortie de la structure.",
        "source": "TradingView — Chart Pattern Triangle",
        "sourceLinks": [
            "https://www.tradingview.com/support/solutions/43000653217-chart-pattern-triangle/"
        ],
    },
    {
        "caption": "Drapeau haussier sur Bitcoin : impulsion, canal descendant, cassure et prolongement haussier.",
        "alt": "Graphique journalier Bitcoin montrant un mât haussier, une consolidation en canal descendant puis une cassure haussière.",
        "source": "TradingView — graphique pédagogique Bitcoin",
        "sourceLinks": ["https://www.tradingview.com/chart/cJFsOApx/"],
    },
    {
        "caption": "Biseau ascendant : le prix monte encore, mais l’espace entre les deux lignes se contracte.",
        "alt": "Schéma de biseau ascendant avec deux lignes montantes convergentes et une cassure de la borne inférieure.",
        "source": "TradingView — Rising Wedge",
        "sourceLinks": [
            "https://www.tradingview.com/support/solutions/43000653219-chart-pattern-rising-wedge/"
        ],
    },
    {
        "caption": "Tasse avec anse : correction arrondie, petite consolidation finale, puis cassure de la résistance.",
        "alt": "Graphique représentant une tasse avec anse, son fond arrondi, la consolidation de l’anse et la zone de cassure.",
        "source": "TradingView — Cup and Handle",
        "sourceLinks": [
            "https://www.tradingview.com/support/solutions/43000732556-chart-pattern-cup-and-handle/"
        ],
    },
    {
        "caption": "Étude de cas Apple : épaule gauche, tête, épaule droite, cassure de la ligne de cou et extension haussière.",
        "alt": "Étude de cas Apple montrant les trois creux d’une épaule-tête-épaule inversée, sa ligne de cou et le mouvement suivant.",
        "source": "TradingView — layout pédagogique du cours",
        "sourceLinks": ["https://www.tradingview.com/chart/cJFsOApx/"],
    },
    {
        "caption": "Étude de cas Bitcoin : mât, canal descendant, cassure et extension.",
        "alt": "Étude de cas Bitcoin montrant une impulsion haussière, un drapeau descendant et la reprise du mouvement après cassure.",
        "source": "TradingView — layout pédagogique du cours",
        "sourceLinks": ["https://www.tradingview.com/chart/cJFsOApx/"],
    },
    {
        "caption": "Faux signal sur Bitcoin : la ligne de cou est brièvement traversée, puis rapidement reprise.",
        "alt": "Graphique Bitcoin en douze heures montrant une cassure baissière non confirmée, la réintégration de la ligne de cou et le rebond du prix.",
        "source": "TradingView — layout pédagogique du cours",
        "sourceLinks": ["https://www.tradingview.com/chart/cJFsOApx/"],
    },
]


def normalize_blocks(blocks: list[dict]) -> list[dict]:
    start_index = next(
        index
        for index, block in enumerate(blocks)
        if block.get("type") == "heading" and block.get("id") == START_ID
    )
    quiz_index = next(
        index
        for index, block in enumerate(blocks)
        if block.get("type") == "heading" and block.get("id") == QUIZ_ID
    )
    sources_index = next(
        index
        for index, block in enumerate(blocks)
        if block.get("type") == "heading" and block.get("id") == SOURCES_ID
    )
    selected = blocks[start_index:quiz_index] + blocks[sources_index:]

    normalized: list[dict] = []
    figure_index = 0
    skip_caption = False
    for block in selected:
        if skip_caption:
            skip_caption = False
            if block.get("type") == "paragraph" and any(
                segment.get("href")
                for segment in block.get("segments", [])
                if isinstance(segment, dict)
            ):
                continue

        if block.get("type") == "figure":
            if figure_index >= len(FIGURES):
                raise ValueError("The document contains more figures than expected")
            block.update(FIGURES[figure_index])
            normalized.append(block)
            figure_index += 1
            skip_caption = True
            continue

        normalized.append(block)

    if figure_index != len(FIGURES):
        raise ValueError(f"Expected {len(FIGURES)} figures, imported {figure_index}")
    if any(block.get("id") == QUIZ_ID for block in normalized):
        raise ValueError("The printed QCM must not be duplicated inside the course content")
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Revised source DOCX for Volume 3, Part 4")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    labels = json.loads((ROOT / "config" / "callout-labels.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="tradevisionpro-part4-") as temporary:
        raw_output = Path(temporary) / "raw.json"
        result = convert_file(
            source=args.source,
            output=raw_output,
            media_dir=MEDIA_DIR,
            public_media_url="/media/3-analyse-technique",
            label_variants=labels,
            metadata_overrides={"slug": "3-analyse-technique-figures-chartistes"},
        )

    supplemental = {
        "schemaVersion": 1,
        "source": result["source"],
        "metadata": {
            "title": "Les figures chartistes en trading",
            "subtitle": "Structures · confirmations · objectifs · faux signaux",
            "description": (
                "Reconnaître six familles classiques, attendre leur confirmation, définir "
                "l’invalidation et traiter l’objectif comme une projection — jamais comme une promesse."
            ),
            "edition": "VOLUME 3 · PARTIE 4 · NIVEAU DÉBUTANT · ÉDITION 2026",
        },
        "blocks": normalize_blocks(result["blocks"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(supplemental, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Imported {len(supplemental['blocks'])} blocks and {len(FIGURES)} figures "
        f"into {args.output}"
    )


if __name__ == "__main__":
    main()
