#!/usr/bin/env python3
"""Discover source DOCX files, convert them and write the volume manifest."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from convert_docx import convert_file, slugify


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "content" / "source"
GENERATED_DIR = ROOT / "content" / "generated"
MEDIA_ROOT = ROOT / "public" / "media"


def inferred_config(source: Path, occupied_orders: set[int]) -> dict[str, Any]:
    number_match = re.search(r"(?:volume|v)\s*[_ -]?(\d+)", source.stem, re.IGNORECASE)
    order = int(number_match.group(1)) if number_match else 1
    while order in occupied_orders:
        order += 1
    return {
        "id": f"volume-{order}",
        "order": order,
        "slug": f"{order}-{slugify(source.stem)}",
        "source": source.relative_to(ROOT).as_posix(),
    }


def main() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    configs = json.loads((ROOT / "config" / "volumes.json").read_text(encoding="utf-8"))
    labels = json.loads((ROOT / "config" / "callout-labels.json").read_text(encoding="utf-8"))
    by_source = {Path(item["source"]).name.casefold(): item for item in configs}
    occupied_orders = {int(item["order"]) for item in configs}
    manifest: list[dict[str, Any]] = []

    sources = sorted(SOURCE_DIR.glob("*.docx"), key=lambda path: path.name.casefold())
    if not sources:
        raise SystemExit(f"No .docx files found in {SOURCE_DIR}")

    for source in sources:
        config = dict(by_source.get(source.name.casefold()) or inferred_config(source, occupied_orders))
        occupied_orders.add(int(config["order"]))
        slug = config["slug"]
        output = GENERATED_DIR / f"{slug}.json"
        media_dir = MEDIA_ROOT / slug
        supplemental_blocks: list[dict[str, Any]] = []
        supplemental_paths = config.get("supplementalContent") or []
        if isinstance(supplemental_paths, str):
            supplemental_paths = [supplemental_paths]
        for supplemental_path in supplemental_paths:
            supplemental_document = json.loads((ROOT / supplemental_path).read_text(encoding="utf-8"))
            document_blocks = supplemental_document.get("blocks", [])
            insert_before_id = supplemental_document.get("insertBeforeId")
            if insert_before_id:
                supplemental_blocks.append(
                    {
                        "type": "supplemental_insertion",
                        "insertBeforeId": insert_before_id,
                        "blocks": document_blocks,
                    }
                )
            else:
                supplemental_blocks.extend(document_blocks)
        result = convert_file(
            source=source,
            output=output,
            media_dir=media_dir,
            public_media_url=f"/media/{slug}",
            label_variants=labels,
            metadata_overrides=config,
            supplemental_blocks=supplemental_blocks,
        )
        manifest.append(
            {
                "file": output.name,
                "metadata": result["metadata"],
                "stats": result["stats"],
                "archetype": result["archetype"],
            }
        )
        print(
            f"Imported {source.name}: {len(result['blocks'])} blocks, "
            f"{result['stats']['readingMinutes']} min"
        )

    manifest.sort(key=lambda item: (item["metadata"]["order"], item["metadata"]["title"]))
    (GENERATED_DIR / "index.json").write_text(
        json.dumps({"schemaVersion": 1, "volumes": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Manifest written with {len(manifest)} volume(s).")


if __name__ == "__main__":
    main()
