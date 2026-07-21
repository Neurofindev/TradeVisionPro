#!/usr/bin/env python3
"""Convert a pedagogical DOCX into the typed block model used by the site.

The converter deliberately reads OOXML instead of flattened text so it can
distinguish native headings, numbering, paragraph/cell shading, hyperlinks,
tables and embedded media while preserving document order.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import shutil
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from xml.etree import ElementTree as ET


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
W = f"{{{NS['w']}}}"
R = f"{{{NS['r']}}}"
REL = f"{{{NS['rel']}}}"


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    ascii_value = ascii_value.lower().replace("&", " et ")
    return re.sub(r"[^a-z0-9]+", "-", ascii_value).strip("-") or "section"


def clean_text(value: str) -> str:
    value = value.replace("\u00a0", " ").replace("\u2028", "\n")
    value = value.replace("\t", " ")
    value = re.sub(r" *\n *", "\n", value)
    return value.strip()


def normalize_label(value: str) -> str:
    return re.sub(r"\s+", " ", clean_text(value).upper()).strip(" :—–-")


def flatten_text(value: Any) -> str:
    """Collect user-facing strings recursively without counting schema keys."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(flatten_text(item) for item in value)
    if isinstance(value, dict):
        ignored = {
            "type",
            "id",
            "src",
            "href",
            "variant",
            "sourceFill",
            "originalName",
            "schemaVersion",
            "segments",
            "links",
            "sourceLinks",
            "width",
            "height",
            "optimized",
            "ordered",
            "scope",
        }
        return " ".join(flatten_text(item) for key, item in value.items() if key not in ignored)
    return ""


def is_enabled(element: ET.Element | None) -> bool:
    if element is None:
        return False
    value = element.get(W + "val")
    return value not in {"0", "false", "off"}


class DocxConverter:
    """Stateful converter for one DOCX file."""

    COLOR_FALLBACKS = {
        "FCEDED": "warning",
        "EAF6EF": "summary",
        "FFF7DD": "principle",
        "EEF4FA": "info",
        "F4F6F9": "note",
    }

    def __init__(
        self,
        source: Path,
        media_dir: Path,
        public_media_url: str,
        label_variants: dict[str, str],
        metadata_overrides: dict[str, Any] | None = None,
    ) -> None:
        self.source = source.resolve()
        self.media_dir = media_dir.resolve()
        self.public_media_url = public_media_url.rstrip("/")
        self.label_variants = {
            normalize_label(label): variant for label, variant in label_variants.items()
        }
        self.metadata_overrides = metadata_overrides or {}
        self.zip = zipfile.ZipFile(self.source)
        self.document = ET.fromstring(self.zip.read("word/document.xml"))
        self.relationships = self._load_relationships()
        self.styles, self.numbered_styles = self._load_styles()
        self.used_ids: dict[str, int] = {}
        self.extracted_media: dict[str, dict[str, Any]] = {}

    def close(self) -> None:
        self.zip.close()

    def _load_relationships(self) -> dict[str, dict[str, str | bool]]:
        rel_path = "word/_rels/document.xml.rels"
        if rel_path not in self.zip.namelist():
            return {}
        root = ET.fromstring(self.zip.read(rel_path))
        relationships: dict[str, dict[str, str | bool]] = {}
        for relation in root.findall(REL + "Relationship"):
            relationships[relation.get("Id", "")] = {
                "target": relation.get("Target", ""),
                "external": relation.get("TargetMode") == "External",
                "type": relation.get("Type", ""),
            }
        return relationships

    def _load_styles(self) -> tuple[dict[str, str], set[str]]:
        if "word/styles.xml" not in self.zip.namelist():
            return {}, set()
        root = ET.fromstring(self.zip.read("word/styles.xml"))
        styles: dict[str, str] = {}
        numbered: set[str] = set()
        for style in root.findall("w:style", NS):
            style_id = style.get(W + "styleId", "")
            name = style.find("w:name", NS)
            styles[style_id] = name.get(W + "val", style_id) if name is not None else style_id
            if style.find("w:pPr/w:numPr", NS) is not None:
                numbered.add(style_id)
        return styles, numbered

    def _unique_id(self, value: str) -> str:
        base = slugify(value)
        count = self.used_ids.get(base, 0) + 1
        self.used_ids[base] = count
        return base if count == 1 else f"{base}-{count}"

    def _paragraph_style(self, paragraph: ET.Element) -> tuple[str, str]:
        style = paragraph.find("w:pPr/w:pStyle", NS)
        style_id = style.get(W + "val", "Normal") if style is not None else "Normal"
        return style_id, self.styles.get(style_id, style_id)

    def _heading_level(self, paragraph: ET.Element) -> int | None:
        _, style_name = self._paragraph_style(paragraph)
        match = re.match(r"^(?:heading|titre)\s*([1-6])$", style_name, re.IGNORECASE)
        if match:
            return int(match.group(1))
        outline = paragraph.find("w:pPr/w:outlineLvl", NS)
        if outline is not None:
            try:
                return int(outline.get(W + "val", "0")) + 1
            except ValueError:
                return None
        return None

    def _is_list(self, paragraph: ET.Element) -> bool:
        style_id, style_name = self._paragraph_style(paragraph)
        lowered = style_name.casefold()
        return (
            paragraph.find("w:pPr/w:numPr", NS) is not None
            or style_id in self.numbered_styles
            or "list bullet" in lowered
            or "liste à puces" in lowered
            or "liste a puces" in lowered
        )

    @staticmethod
    def _shading(element: ET.Element, path: str) -> str | None:
        shading = element.find(path, NS)
        if shading is None:
            return None
        fill = shading.get(W + "fill")
        return fill.upper() if fill and fill.lower() not in {"auto", "none"} else None

    def _run_segment(self, run: ET.Element, href: str | None = None) -> dict[str, Any] | None:
        pieces: list[str] = []
        for child in list(run):
            if child.tag == W + "t":
                pieces.append(child.text or "")
            elif child.tag == W + "tab":
                pieces.append("\t")
            elif child.tag in {W + "br", W + "cr"}:
                pieces.append("\n")
        text = "".join(pieces)
        if not text:
            return None
        props = run.find("w:rPr", NS)
        segment: dict[str, Any] = {"text": text}
        if props is not None:
            if is_enabled(props.find("w:b", NS)):
                segment["bold"] = True
            if is_enabled(props.find("w:i", NS)):
                segment["italic"] = True
            underline = props.find("w:u", NS)
            if underline is not None and underline.get(W + "val", "single") != "none":
                segment["underline"] = True
        if href:
            segment["href"] = href
        return segment

    def _paragraph_segments(self, paragraph: ET.Element) -> list[dict[str, Any]]:
        segments: list[dict[str, Any]] = []

        def append_segment(segment: dict[str, Any] | None) -> None:
            if segment is None:
                return
            if segments and all(
                segments[-1].get(key) == segment.get(key)
                for key in ("bold", "italic", "underline", "href")
            ):
                segments[-1]["text"] += segment["text"]
            else:
                segments.append(segment)

        for child in list(paragraph):
            if child.tag == W + "r":
                append_segment(self._run_segment(child))
            elif child.tag == W + "hyperlink":
                relation_id = child.get(R + "id")
                anchor = child.get(W + "anchor")
                relation = self.relationships.get(relation_id or "", {})
                href = str(relation.get("target", "")) if relation.get("external") else None
                if anchor and not href:
                    href = "#" + anchor
                for run in child.findall("w:r", NS):
                    append_segment(self._run_segment(run, href=href))
            elif child.tag == W + "fldSimple":
                instruction = child.get(W + "instr", "")
                match = re.search(r'HYPERLINK\s+"([^"]+)"', instruction, re.IGNORECASE)
                href = match.group(1) if match else None
                for run in child.findall(".//w:r", NS):
                    append_segment(self._run_segment(run, href=href))
        return segments

    @staticmethod
    def _segments_text(segments: Iterable[dict[str, Any]]) -> str:
        return clean_text("".join(str(segment.get("text", "")) for segment in segments))

    @staticmethod
    def _segments_links(segments: Iterable[dict[str, Any]]) -> list[str]:
        links: list[str] = []
        for segment in segments:
            href = segment.get("href")
            if href and href not in links:
                links.append(str(href))
        return links

    def _paragraph_images(self, paragraph: ET.Element) -> list[dict[str, Any]]:
        images: list[dict[str, Any]] = []
        for blip in paragraph.findall(".//a:blip", NS):
            relation_id = blip.get(R + "embed") or blip.get(R + "link")
            if relation_id and relation_id in self.relationships:
                asset = self._extract_media(relation_id)
                if asset:
                    images.append(asset)
        return images

    def _extract_media(self, relation_id: str) -> dict[str, Any] | None:
        if relation_id in self.extracted_media:
            return self.extracted_media[relation_id]
        relation = self.relationships.get(relation_id)
        if not relation or relation.get("external"):
            return None
        target = str(relation.get("target", ""))
        archive_path = posixpath.normpath(str(PurePosixPath("word") / target)).lstrip("/")
        if archive_path not in self.zip.namelist():
            return None
        data = self.zip.read(archive_path)
        digest = hashlib.sha256(data).hexdigest()[:12]
        source_suffix = Path(archive_path).suffix.lower() or ".bin"
        base_name = f"{slugify(self.metadata_overrides.get('slug', self.source.stem))}-{digest}"
        self.media_dir.mkdir(parents=True, exist_ok=True)
        width: int | None = None
        height: int | None = None
        optimized = False
        destination = self.media_dir / f"{base_name}{source_suffix}"

        # Pillow is optional. When present, raster assets are normalized to WebP;
        # the original OOXML media is copied losslessly when it is unavailable.
        try:
            from PIL import Image, ImageOps

            with Image.open(io.BytesIO(data)) as image:
                image = ImageOps.exif_transpose(image)
                width, height = image.size
                webp_destination = self.media_dir / f"{base_name}.webp"
                has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGBA" if has_alpha else "RGB")
                save_options: dict[str, Any] = {"format": "WEBP", "method": 6}
                if has_alpha or source_suffix == ".png":
                    save_options["lossless"] = True
                else:
                    save_options["quality"] = 84
                image.save(webp_destination, **save_options)
                destination = webp_destination
                optimized = True
        except (ImportError, OSError, ValueError):
            destination.write_bytes(data)

        asset = {
            "src": f"{self.public_media_url}/{destination.name}",
            "originalName": Path(archive_path).name,
            "width": width,
            "height": height,
            "optimized": optimized,
        }
        self.extracted_media[relation_id] = asset
        return asset

    def _split_callout(self, text: str, fill: str | None) -> tuple[str, str, str]:
        text = clean_text(text)
        label = "REPÈRE"
        body = text
        chunks = re.split(r"(?:\n|\s{2,})", text, maxsplit=1)
        if len(chunks) == 2 and 2 <= len(chunks[0]) <= 110:
            candidate = normalize_label(chunks[0])
            letters = [char for char in candidate if char.isalpha()]
            uppercase = not letters or candidate == candidate.upper()
            if uppercase:
                label, body = chunks[0].strip(), chunks[1].strip()
        if label == "REPÈRE":
            upper_text = normalize_label(text)
            for known in sorted(self.label_variants, key=len, reverse=True):
                if upper_text.startswith(known):
                    label = text[: len(known)].strip()
                    body = text[len(known) :].lstrip(" :—–-\n")
                    break
        normalized = normalize_label(label)
        variant = self.label_variants.get(normalized)
        if variant is None:
            for known in sorted(self.label_variants, key=len, reverse=True):
                if known in normalized or normalized in known:
                    variant = self.label_variants[known]
                    break
        if variant is None:
            variant = self.COLOR_FALLBACKS.get((fill or "").upper(), "default")
        return label, body, variant

    def _callout_block(self, text: str, fill: str | None) -> dict[str, Any]:
        label, body, variant = self._split_callout(text, fill)
        return {
            "type": "callout",
            "label": label,
            "variant": variant,
            "text": body,
            "sourceFill": fill,
        }

    def _source_entry(self, text: str, segments: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "text": clean_text(text),
            "links": self._segments_links(segments),
        }

    @staticmethod
    def _append_list(blocks: list[dict[str, Any]], item: dict[str, Any]) -> None:
        if blocks and blocks[-1].get("type") == "list":
            blocks[-1]["items"].append(item)
        else:
            blocks.append({"type": "list", "ordered": False, "items": [item]})

    @staticmethod
    def _append_sources(blocks: list[dict[str, Any]], entry: dict[str, Any], scope: str) -> None:
        if blocks and blocks[-1].get("type") == "sources" and blocks[-1].get("scope") == scope:
            blocks[-1]["entries"].append(entry)
        else:
            blocks.append({"type": "sources", "scope": scope, "entries": [entry]})

    def _cell(self, cell: ET.Element) -> dict[str, Any]:
        paragraphs: list[str] = []
        links: list[str] = []
        for paragraph in cell.findall("w:p", NS):
            segments = self._paragraph_segments(paragraph)
            text = self._segments_text(segments)
            if text:
                paragraphs.append(text)
                for link in self._segments_links(segments):
                    if link not in links:
                        links.append(link)
        return {
            "text": "\n".join(paragraphs),
            "paragraphs": paragraphs,
            "links": links,
            "fill": self._shading(cell, "w:tcPr/w:shd"),
        }

    def _table_block(self, table: ET.Element) -> dict[str, Any] | None:
        rows: list[list[dict[str, Any]]] = []
        for row in table.findall("w:tr", NS):
            cells = [self._cell(cell) for cell in row.findall("w:tc", NS)]
            if cells:
                rows.append(cells)
        if not rows:
            return None
        width = max(len(row) for row in rows)
        fills = [cell["fill"] for row in rows for cell in row if cell.get("fill")]
        dominant_fill = max(set(fills), key=fills.count) if fills else None

        # A one-cell shaded table is a Word implementation detail for a
        # semantic callout. Meaning comes from its label; fill is only fallback.
        if len(rows) == 1 and width == 1:
            return self._callout_block(rows[0][0]["text"], dominant_fill)

        # One-row multi-cell tables whose cells contain a value paragraph plus
        # a short label paragraph are dashboard-style statistics, not data grids.
        if len(rows) == 1 and width > 1:
            stats: list[dict[str, str]] = []
            looks_statistical = True
            for cell in rows[0]:
                parts = cell["paragraphs"]
                if len(parts) >= 2:
                    value, label = parts[0], " ".join(parts[1:])
                else:
                    match = re.match(
                        r"^([≈~><+−-]?\s*(?:\d[\d\s.,]*|\d{1,2}\s+[A-Za-zÀ-ÿ.]+\s+\d{4})(?:\s*[%$€£×x]|\s*(?:Md|M|Bn))?)\s+(.+)$",
                        cell["text"],
                        re.IGNORECASE,
                    )
                    if not match:
                        looks_statistical = False
                        break
                    value, label = match.group(1), match.group(2)
                if not re.search(r"\d", value):
                    looks_statistical = False
                    break
                stats.append({"value": clean_text(value), "label": clean_text(label)})
            if looks_statistical:
                return {"type": "stat_row", "stats": stats}

        headers = [cell["text"] for cell in rows[0]]
        data_rows = [[cell["text"] for cell in row] for row in rows[1:]]
        links = [[cell["links"] for cell in row] for row in rows]
        return {
            "type": "table",
            "headers": headers,
            "rows": data_rows,
            "links": links,
        }

    def _extract_metadata(self, cover_lines: list[str]) -> dict[str, Any]:
        volume_number = None
        edition = None
        format_note = None
        for line in cover_lines:
            number_match = re.search(r"\bVOLUME\s+(\d+)\b", line, re.IGNORECASE)
            if number_match:
                volume_number = int(number_match.group(1))
            if re.search(r"\bÉDITION\s+\d{4}\b", line, re.IGNORECASE):
                edition = line
            if "document pédagogique" in line.casefold() or "support pédagogique" in line.casefold():
                format_note = line

        excluded = re.compile(r"^(?:FORMATION|VOLUME\b|ÉDITION\b|DOCUMENT\b|SUPPORT\b)", re.IGNORECASE)
        candidates = [line for line in cover_lines if not excluded.search(line)]
        inferred_title = candidates[0] if candidates else (cover_lines[0] if cover_lines else self.source.stem)
        inferred_subtitle = candidates[1] if len(candidates) > 1 else ""
        metadata: dict[str, Any] = {
            "id": self.metadata_overrides.get("id") or f"volume-{volume_number or slugify(self.source.stem)}",
            "order": self.metadata_overrides.get("order", volume_number or 999),
            "volumeNumber": volume_number,
            "title": inferred_title,
            "subtitle": inferred_subtitle,
            "description": candidates[2] if len(candidates) > 2 else inferred_subtitle,
            "edition": edition,
            "format": format_note,
            "coverLines": cover_lines,
            "tags": [],
        }
        for key in (
            "id",
            "order",
            "volumeNumber",
            "title",
            "subtitle",
            "description",
            "edition",
            "format",
            "tags",
            "highlights",
        ):
            if self.metadata_overrides.get(key) is not None:
                metadata[key] = self.metadata_overrides[key]
        metadata["slug"] = self.metadata_overrides.get("slug") or (
            f"{volume_number}-{slugify(metadata['title'])}" if volume_number else slugify(metadata["title"])
        )
        return metadata

    def _postprocess_case_headers(self, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        index = 0
        while index < len(blocks):
            block = blocks[index]
            if block.get("type") == "case_kicker":
                title = blocks[index + 1] if index + 1 < len(blocks) else None
                question = blocks[index + 2] if index + 2 < len(blocks) else None
                if title and question and title.get("type") == question.get("type") == "paragraph":
                    header_title = title.get("text", "")
                    result.append(
                        {
                            "type": "case_dossier_header",
                            "id": self._unique_id(f"{block['text']} {header_title}"),
                            "kicker": block["text"],
                            "title": header_title,
                            "question": question.get("text", ""),
                        }
                    )
                    index += 3
                    continue
                block = {"type": "paragraph", "text": block.get("text", "")}
            result.append(block)
            index += 1
        return result

    def convert(self) -> dict[str, Any]:
        body = self.document.find("w:body", NS)
        if body is None:
            raise ValueError(f"Document body missing in {self.source}")
        cover_lines: list[str] = []
        blocks: list[dict[str, Any]] = []
        content_started = bool(self.metadata_overrides.get("contentStartsImmediately"))
        sources_section = False
        last_figure_index: int | None = None
        promoted_first_heading = False
        figure_index = 0

        for element in list(body):
            if element.tag == W + "p":
                segments = self._paragraph_segments(element)
                text = self._segments_text(segments)
                images = self._paragraph_images(element)
                heading_level = self._heading_level(element)

                first_heading_level = self.metadata_overrides.get("firstParagraphHeadingLevel")
                if text and first_heading_level and not promoted_first_heading:
                    heading_level = int(first_heading_level)
                    promoted_first_heading = True

                if not content_started and heading_level is None and text and not images:
                    cover_lines.append(text)
                    continue
                if heading_level is not None or images:
                    content_started = True
                if not content_started and not text:
                    continue

                for image in images:
                    figure_alts = self.metadata_overrides.get("figureAlts") or []
                    alt = figure_alts[figure_index] if figure_index < len(figure_alts) else ""
                    figure = {
                        "type": "figure",
                        **image,
                        "caption": "",
                        "source": "",
                        "sourceLinks": [],
                    }
                    if alt:
                        figure["alt"] = alt
                    blocks.append(figure)
                    figure_index += 1
                    last_figure_index = len(blocks) - 1
                if not text:
                    continue

                if re.match(r"^Figure\s+\d+\s*[—–-]", text, re.IGNORECASE):
                    if last_figure_index is not None and last_figure_index >= len(blocks) - 2:
                        blocks[last_figure_index]["caption"] = text
                        blocks[last_figure_index]["alt"] = re.sub(r"^Figure\s+\d+\s*[—–-]\s*", "", text)
                        continue
                if re.match(r"^Sources?\s*:", text, re.IGNORECASE):
                    if (
                        last_figure_index is not None
                        and last_figure_index >= len(blocks) - 2
                        and blocks[last_figure_index].get("caption")
                        and not blocks[last_figure_index].get("source")
                    ):
                        blocks[last_figure_index]["source"] = re.sub(
                            r"^Sources?\s*:\s*", "", text, flags=re.IGNORECASE
                        )
                        blocks[last_figure_index]["sourceLinks"] = self._segments_links(segments)
                        continue

                if heading_level is not None:
                    heading_id = self._unique_id(text)
                    blocks.append({"type": "heading", "level": heading_level, "id": heading_id, "text": text})
                    if heading_level == 1:
                        sources_section = bool(re.match(r"^Sources?\b", text, re.IGNORECASE))
                    last_figure_index = None
                    continue

                if re.fullmatch(r"DOSSIER\s+\d+", text, re.IGNORECASE):
                    blocks.append({"type": "case_kicker", "text": text.upper()})
                    sources_section = False
                    last_figure_index = None
                    continue

                fill = self._shading(element, "w:pPr/w:shd")
                if fill:
                    blocks.append(self._callout_block(text, fill))
                    continue

                lesson_note_variants = {
                    "🎯": "example",
                    "📚": "note",
                    "‼️": "concrete",
                }
                lesson_note_variant = next(
                    (variant for prefix, variant in lesson_note_variants.items() if text.startswith(prefix)),
                    None,
                )
                if lesson_note_variant:
                    blocks.append(
                        {
                            "type": "lesson_note",
                            "variant": lesson_note_variant,
                            "text": text,
                            "segments": segments,
                        }
                    )
                    continue

                if re.match(r"^Références? du dossier\s*:", text, re.IGNORECASE):
                    entry_text = re.sub(r"^Références? du dossier\s*:\s*", "", text, flags=re.IGNORECASE)
                    self._append_sources(blocks, self._source_entry(entry_text, segments), "local")
                    continue

                if self._is_list(element):
                    item = {"text": text, "segments": segments}
                    if sources_section:
                        self._append_sources(blocks, self._source_entry(text, segments), "global")
                    else:
                        self._append_list(blocks, item)
                    continue

                if sources_section and (self._segments_links(segments) or re.match(r"^\d+[.)]\s*", text)):
                    self._append_sources(blocks, self._source_entry(text, segments), "global")
                    continue

                blocks.append({"type": "paragraph", "text": text, "segments": segments})

            elif element.tag == W + "tbl":
                content_started = True
                table_block = self._table_block(element)
                if table_block:
                    blocks.append(table_block)
                last_figure_index = None

        blocks = self._postprocess_case_headers(blocks)
        editorial_conclusion = self.metadata_overrides.get("editorialConclusion")
        if editorial_conclusion:
            conclusion_title = clean_text(str(editorial_conclusion.get("title", "Conclusion")))
            blocks.append(
                {
                    "type": "editorial_conclusion",
                    "id": self._unique_id(conclusion_title),
                    "title": conclusion_title,
                    "text": clean_text(str(editorial_conclusion.get("text", ""))),
                }
            )
        metadata = self._extract_metadata(cover_lines)
        has_cases = any(block.get("type") == "case_dossier_header" for block in blocks)
        heading_ones = sum(
            1 for block in blocks if block.get("type") == "heading" and block.get("level") == 1
        )
        dossiers = sum(1 for block in blocks if block.get("type") == "case_dossier_header")
        searchable_text = flatten_text(blocks)
        word_count = len(re.findall(r"\b[\wÀ-ÿ’'-]+\b", searchable_text))
        source_hash = hashlib.sha256(self.source.read_bytes()).hexdigest()
        return {
            "schemaVersion": 1,
            "source": {"file": self.source.name, "sha256": source_hash},
            "metadata": metadata,
            "archetype": self.metadata_overrides.get("archetype") or ("case_dossiers" if has_cases else "conceptual"),
            "stats": {
                "wordCount": word_count,
                "readingMinutes": max(1, round(word_count / 220)),
                "chapterCount": heading_ones,
                "dossierCount": dossiers,
                "figureCount": sum(1 for block in blocks if block.get("type") == "figure"),
            },
            "blocks": blocks,
        }


def convert_file(
    source: Path,
    output: Path,
    media_dir: Path,
    public_media_url: str,
    label_variants: dict[str, str],
    metadata_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    converter = DocxConverter(
        source=source,
        media_dir=media_dir,
        public_media_url=public_media_url,
        label_variants=label_variants,
        metadata_overrides=metadata_overrides,
    )
    try:
        result = converter.convert()
    finally:
        converter.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Input .docx file")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON file")
    parser.add_argument("--media-dir", type=Path, required=True, help="Directory for extracted images")
    parser.add_argument("--public-media-url", default="/media", help="Public URL prefix for extracted images")
    parser.add_argument(
        "--labels",
        type=Path,
        default=Path("config/callout-labels.json"),
        help="Label-to-variant mapping JSON",
    )
    parser.add_argument("--metadata", type=Path, help="Optional JSON metadata overrides")
    args = parser.parse_args()
    labels = json.loads(args.labels.read_text(encoding="utf-8"))
    metadata = json.loads(args.metadata.read_text(encoding="utf-8")) if args.metadata else {}
    result = convert_file(
        args.source,
        args.output,
        args.media_dir,
        args.public_media_url,
        labels,
        metadata,
    )
    print(
        f"Converted {args.source.name}: {len(result['blocks'])} blocks, "
        f"{result['stats']['figureCount']} figures -> {args.output}"
    )


if __name__ == "__main__":
    main()
