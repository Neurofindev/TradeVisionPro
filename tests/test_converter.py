import json
import re
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "content" / "generated"
SOURCE = ROOT / "content" / "source"
VOLUME_CONFIG = json.loads((ROOT / "config" / "volumes.json").read_text(encoding="utf-8"))
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
        cls.v4 = load("4-analyse-macroeconomique.json")

    def test_manifest_contains_all_volumes_in_order(self):
        manifest = load("index.json")
        self.assertEqual([item["metadata"]["volumeNumber"] for item in manifest["volumes"]], [1, 2, 3, 4])

    def test_volume_one_structure(self):
        types = [block["type"] for block in self.v1["blocks"]]
        self.assertEqual(len(self.v1["metadata"]["parts"]), 2)
        self.assertTrue(self.v1["metadata"]["partSequenceComplete"])
        self.assertEqual(self.v1["metadata"]["parts"][0]["title"], "Comprendre l’investissement")
        self.assertEqual(self.v1["metadata"]["parts"][1]["title"], "Choisir un actif et l’analyser")
        self.assertEqual(types.count("table"), 4)
        self.assertEqual(types.count("callout"), 13)
        self.assertEqual(types.count("asset_grid"), 1)
        self.assertEqual(types.count("case_dossier_header"), 0)
        self.assertGreaterEqual(types.count("list"), 6)
        rendered_text = " ".join(all_strings(self.v1))
        for expected in (
            "Panorama des principales familles d’actifs financiers",
            "Actions",
            "Obligations",
            "Instruments monétaires",
            "Fonds et ETF",
            "Immobilier coté",
            "Matières premières",
            "Devises — Forex",
            "Cryptoactifs",
            "Produits dérivés",
            "Le levier réduit le capital immédiatement mobilisé, pas le risque économique",
        ):
            self.assertIn(expected, rendered_text)

    def test_volume_two_structure(self):
        blocks = self.v2["blocks"]
        types = [block["type"] for block in blocks]
        self.assertEqual(types.count("case_dossier_header"), 5)
        self.assertEqual(types.count("figure"), 3)
        self.assertEqual(types.count("stat_row"), 5)
        self.assertEqual(types.count("table"), 19)
        self.assertEqual(types.count("callout"), 15)

    def test_volume_three_integrates_three_progressive_parts(self):
        blocks = self.v3["blocks"]
        types = [block["type"] for block in blocks]
        self.assertEqual(self.v3["metadata"]["title"], "L’analyse technique")
        self.assertEqual(self.v3["metadata"]["subtitle"], "L’art du timing, un outil essentiel.")
        self.assertEqual(len(self.v3["metadata"]["highlights"]), 3)
        self.assertEqual(len(self.v3["metadata"]["parts"]), 3)
        self.assertTrue(self.v3["metadata"]["partSequenceComplete"])
        self.assertNotIn("futureVolumeNumber", self.v3["metadata"])
        self.assertEqual(self.v3["metadata"]["parts"][1]["title"], "L’essentiel des bougies japonaises")
        self.assertEqual(self.v3["metadata"]["parts"][2]["title"], "Les indicateurs techniques")
        self.assertEqual(types.count("heading"), 125)
        self.assertEqual(types.count("lesson_note"), 13)
        self.assertEqual(types.count("figure"), 30)
        self.assertEqual(types.count("table"), 21)
        self.assertEqual(types.count("editorial_conclusion"), 2)
        self.assertEqual(self.v3["stats"]["chapterCount"], 32)
        self.assertTrue(all(block["alt"] for block in blocks if block["type"] == "figure"))
        rendered_text = " ".join(all_strings(self.v3))
        self.assertIn("🔥 Les supports et résistances", rendered_text)
        self.assertIn("🎯 Par exemple, sur le titre AMAZON,", rendered_text)
        self.assertIn("🎯 Prenons l’exemple du titre NVIDIA :", rendered_text)
        self.assertIn("🚨 Les tendances boursières", rendered_text)
        self.assertIn("le cours de l’action GOOGLE affiche une progression continue", rendered_text)
        self.assertIn("l’évolution récente du Bitcoin (BTC) illustre une tendance baissière", rendered_text)
        self.assertIn("l’action C3.AI oscille entre 14,80 $ et 19,21 $", rendered_text)
        self.assertIn("L’essentiel des bougies japonaises", rendered_text)
        self.assertIn("Du dessin à la décision", rendered_text)
        self.assertIn("Trois méthodes ascendantes", rendered_text)
        self.assertIn("Cette Partie 2 revient au langage premier du marché", rendered_text)
        self.assertIn("Les indicateurs techniques", rendered_text)
        self.assertIn("RSI · MACD · moyennes mobiles · volume", rendered_text)
        self.assertIn("Un indicateur est une transformation", rendered_text)
        self.assertIn("La chaîne de décision complète", rendered_text)
        self.assertIn("Le RSI mesure la force relative des gains et pertes récents", rendered_text)
        self.assertIn("ils ne déterminent pas la force d’une future cassure", rendered_text)
        self.assertIn("il ne confirme pas à lui seul un retournement", rendered_text)
        self.assertIn("Le niveau des 130 $ illustre un changement de polarité", rendered_text)
        self.assertNotIn("Plus une zone de support ou de résistance est testée", rendered_text)
        self.assertNotIn("de nombreux stop-loss sont déclenchés", rendered_text)
        self.assertNotIn("aussi appelés zones psychologiques", rendered_text)
        self.assertNotIn("VOLUME 4", rendered_text)
        self.assertNotIn("Le Volume 3 ajoute RSI", rendered_text)
        self.assertNotIn("(image 1)", rendered_text.casefold())
        self.assertNotIn("(image 2)", rendered_text.casefold())
        self.assertNotIn("(image 3)", rendered_text.casefold())

    def test_volume_four_integrates_the_first_macroeconomic_part(self):
        blocks = self.v4["blocks"]
        types = [block["type"] for block in blocks]
        self.assertEqual(self.v4["metadata"]["title"], "L’analyse macroéconomique")
        self.assertEqual(self.v4["metadata"]["volumeNumber"], 4)
        self.assertEqual(len(self.v4["metadata"]["parts"]), 1)
        self.assertFalse(self.v4["metadata"]["partSequenceComplete"])
        self.assertEqual(self.v4["metadata"]["parts"][0]["title"], "Les fondements de l’analyse macroéconomique")
        self.assertEqual(blocks[0]["id"], "comment-utiliser-ce-cours")
        self.assertEqual(types.count("heading"), 72)
        self.assertEqual(types.count("callout"), 15)
        self.assertEqual(types.count("figure"), 8)
        self.assertEqual(types.count("table"), 20)
        self.assertEqual(self.v4["stats"]["chapterCount"], 13)
        figures = [block for block in blocks if block["type"] == "figure"]
        self.assertTrue(all(figure["caption"] and figure["source"] and figure["alt"] for figure in figures))
        rendered_text = " ".join(all_strings(self.v4))
        self.assertIn("Les quatre régimes à reconnaître", rendered_text)
        self.assertIn("Pourquoi le consensus domine souvent la première réaction", rendered_text)
        self.assertIn("L’inflation : CPI, Core CPI, PCE et Core PCE", rendered_text)
        self.assertIn("NFP, chômage, jobless claims et JOLTS", rendered_text)
        self.assertIn("Méthode d’analyse avant, pendant et après une publication", rendered_text)
        self.assertIn("Figure 8 — Ventes au détail américaines, variation mensuelle", rendered_text)
        self.assertIn("la réaction initiale peut provenir d’intervenants humains", rendered_text)
        self.assertIn("éléments complémentaires et suffisamment indépendants", rendered_text)
        self.assertIn("Écart mesurable entre la valeur publiée et le consensus", rendered_text)
        self.assertNotIn("les algorithmes réagissent au titre, puis le marché humain", rendered_text)
        self.assertNotIn("Plus les confirmations sont nombreuses", rendered_text)
        self.assertNotIn("Écart qualitatif entre le chiffre réel", rendered_text)

    def test_figures_are_complete_and_optimized(self):
        figures = [
            block
            for volume in (self.v2, self.v4)
            for block in volume["blocks"]
            if block["type"] == "figure"
        ]
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
            (SOURCE / "V1.docx", self.v1, None),
            (
                SOURCE / "Formation_Investissement_Trading_Volume_2_Risques_Cas_Historiques.docx",
                self.v2,
                None,
            ),
            (SOURCE / "Cours_multi_timeframe_original.docx", self.v3, None),
            (
                SOURCE / "Fondements_analyse_macroeconomique_Volume-4_Partie_1.docx",
                self.v4,
                "comment utiliser ce cours",
            ),
        ]
        for source, generated, start_marker in pairs:
            haystack = normalize(" ".join(all_strings(generated)))
            units = source_text_units(source)
            replaced_units = {
                normalize(replacement["match"])
                for config in VOLUME_CONFIG
                if config.get("source") == f"content/source/{source.name}"
                for replacement in config.get("blockReplacements", [])
            }
            replaced_fragments = {
                normalize(replacement["match"])
                for config in VOLUME_CONFIG
                if config.get("source") == f"content/source/{source.name}"
                for replacement in config.get("textReplacements", [])
            }
            units = [
                unit
                for unit in units
                if unit not in replaced_units
                and not any(fragment in unit for fragment in replaced_fragments)
            ]
            if start_marker:
                units = units[units.index(start_marker) :]
            covered = 0
            for unit in units:
                candidate = re.sub(
                    r"^(?:références? du dossier|source du graphique|sources?)\s*:\s*",
                    "",
                    unit,
                )
                if candidate in haystack:
                    covered += 1
            ratio = covered / len(units)
            self.assertGreaterEqual(ratio, 0.98, f"Only {ratio:.1%} source text coverage for {source.name}")


if __name__ == "__main__":
    unittest.main()
