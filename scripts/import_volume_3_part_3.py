#!/usr/bin/env python3
"""Import the technical-indicators DOCX as Volume 3, Part 3 content."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from convert_docx import convert_file


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "content" / "supplemental" / "3-analyse-technique-partie-3-indicateurs-techniques.json"
MEDIA_DIR = ROOT / "public" / "media" / "3-analyse-technique"
EXPECTED_FIGURES = 5


def normalize_blocks(blocks: list[dict]) -> list[dict]:
    figures = [block for block in blocks if block.get("type") == "figure"]
    if len(figures) != EXPECTED_FIGURES:
        raise ValueError(f"Expected {EXPECTED_FIGURES} figures, imported {len(figures)}")
    for figure in figures:
        if not figure.get("caption") or not figure.get("source") or not figure.get("alt"):
            raise ValueError("Every Part 3 figure must include a caption, source and alternative text")
    return blocks


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Source DOCX for Volume 3, Part 3")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    labels = json.loads((ROOT / "config" / "callout-labels.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(prefix="tradevisionpro-part3-") as temporary:
        raw_output = Path(temporary) / "raw.json"
        result = convert_file(
            source=args.source,
            output=raw_output,
            media_dir=MEDIA_DIR,
            public_media_url="/media/3-analyse-technique",
            label_variants=labels,
            metadata_overrides={"slug": "3-analyse-technique-indicateurs-techniques"},
        )

    cover_lines = [
        line.replace("VOLUME 3 · NIVEAU", "VOLUME 3 · PARTIE 3 · NIVEAU")
        for line in result["metadata"].get("coverLines", [])
    ]
    supplemental = {
        "schemaVersion": 1,
        "source": result["source"],
        "metadata": {
            "title": "Les indicateurs techniques",
            "subtitle": "RSI · MACD · moyennes mobiles · volume",
            "description": (
                "Un indicateur ne prédit pas le marché : il transforme l’information déjà visible "
                "pour t’aider à mieux la lire."
            ),
            "edition": "VOLUME 3 · PARTIE 3 · NIVEAU DÉBUTANT · ÉDITION 2026",
            "coverLines": cover_lines,
        },
        "blocks": normalize_blocks(result["blocks"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(supplemental, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Imported {len(supplemental['blocks'])} blocks and {EXPECTED_FIGURES} figures "
        f"into {args.output}"
    )


if __name__ == "__main__":
    main()
