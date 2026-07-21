import json
import re
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "content" / "generated"
SOURCE = ROOT / "content" / "source"
NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
W = f"{{{NS['w']}}}"


def load(name):
    return json.loads((GENERATED / name).read_text(encoding="utf-8"))


def all_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from all_strings(item)
    elif isinstance(value, dict):
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
        for key, item in value.items():
            if key in ignored:
                continue
            yield from all_strings(item)


def normalize(value):
    return re.sub(r"\s+", " ", value).strip().casefold()


def source_text_units(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    units = []
    for paragraph in root.findall(".//w:body//w:p", NS):
        pieces = []
        for node in paragraph.iter():
            if node.tag == W + "t":
                pieces.append(node.text or "")
            elif node.tag in {W + "br", W + "cr", W + "tab"}:
                pieces.append(" ")
        text = "".join(pieces)
        text = normalize(text)
        if text:
            units.append(text)
    return units


class ConverterOutputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.v1 = load("1-fondations-et-analyses.json")
        cls.v2 = load("2-dossiers-historiques.json")
        cls.v3 = load("3-analyse-technique.json")

    def test_manifest_contains_all_volumes_in_order(self):
        manifest = load("index.json")
        self.assertEqual([item["metadata"]["volumeNumber"] for item in manifest["volumes"]], [1, 2, 3])

    def test_volume_one_structure(self):
        types = [block["type"] for block in self.v1["blocks"]]
        self.assertEqual(types.count("table"), 3)
        self.assertEqual(types.count("callout"), 8)
        self.assertEqual(types.count("case_dossier_header"), 0)
        self.assertGreaterEqual(types.count("list"), 5)

    def test_volume_two_structure(self):
        blocks = self.v2["blocks"]
        types = [block["type"] for block in blocks]
        self.assertEqual(types.count("case_dossier_header"), 5)
        self.assertEqual(types.count("figure"), 3)
        self.assertEqual(types.count("stat_row"), 5)
        self.assertEqual(types.count("table"), 19)
        self.assertEqual(types.count("callout"), 15)

    def test_volume_three_preserves_and_structures_the_original_chapter(self):
        blocks = self.v3["blocks"]
        types = [block["type"] for block in blocks]
        self.assertEqual(self.v3["metadata"]["title"], "L’analyse technique")
        self.assertEqual(self.v3["metadata"]["subtitle"], "L’art du timing, un outil essentiel.")
        self.assertEqual(len(self.v3["metadata"]["highlights"]), 3)
        self.assertEqual(types.count("heading"), 1)
        self.assertEqual(types.count("lesson_note"), 5)
        self.assertEqual(types.count("figure"), 2)
        self.assertEqual(types.count("editorial_conclusion"), 1)
        self.assertEqual(self.v3["stats"]["chapterCount"], 1)
        self.assertTrue(all(block["alt"] for block in blocks if block["type"] == "figure"))

    def test_figures_are_complete_and_optimized(self):
        figures = [block for block in self.v2["blocks"] if block["type"] == "figure"]
        for figure in figures:
            self.assertTrue(figure["caption"].startswith("Figure "))
            self.assertTrue(figure["source"])
            self.assertTrue(figure["alt"])
            self.assertTrue(figure["src"].endswith(".webp"))
            self.assertTrue((ROOT / "public" / figure["src"].lstrip("/")).exists())

    def test_label_mapping_overrides_color_meaning(self):
        callouts = [block for block in self.v2["blocks"] if block["type"] == "callout"]
        lessons = [block for block in callouts if block["label"] == "LEÇON DU CAS"]
        self.assertEqual(len(lessons), 5)
        self.assertTrue(all(block["variant"] == "summary" for block in lessons))
        # The same semantic label appears on both green and pink Word fills;
        # all instances must still resolve to the summary variant.
        self.assertEqual({block["sourceFill"] for block in lessons}, {"EAF6EF", "FCEDED"})

    def test_nearly_all_source_text_is_present(self):
        pairs = [
            (SOURCE / "V1.docx", self.v1),
            (
                SOURCE / "Formation_Investissement_Trading_Volume_2_Risques_Cas_Historiques.docx",
                self.v2,
            ),
            (SOURCE / "Cours_multi_timeframe_original.docx", self.v3),
        ]
        for source, generated in pairs:
            haystack = normalize(" ".join(all_strings(generated)))
            units = source_text_units(source)
            covered = 0
            for unit in units:
                candidate = re.sub(r"^(?:références? du dossier|sources?)\s*:\s*", "", unit)
                if candidate in haystack:
                    covered += 1
            ratio = covered / len(units)
            self.assertGreaterEqual(ratio, 0.98, f"Only {ratio:.1%} source text coverage for {source.name}")


if __name__ == "__main__":
    unittest.main()
