#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSearchEntries,
  configureSite,
  layout,
  renderHome,
  renderSearchPage,
  renderVolumePage,
  renderVolumesIndex,
} from "../src/render.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const GENERATED = path.join(ROOT, "content", "generated");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writePage(relativePath, html) {
  const destination = path.join(DIST, relativePath, "index.html");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, "utf8");
}

async function main() {
  const basePathArgument = process.argv.find((argument) => argument.startsWith("--base-path="));
  const basePath = configureSite({ basePath: basePathArgument?.slice("--base-path=".length) || "/" });
  const manifest = await readJson(path.join(GENERATED, "index.json"));
  const quizzes = await readJson(path.join(ROOT, "config", "quizzes.json"));
  const volumes = await Promise.all(
    manifest.volumes.map((entry) => readJson(path.join(GENERATED, entry.file))),
  );
  volumes.sort((a, b) => a.metadata.order - b.metadata.order);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, "assets"), { recursive: true });
  await cp(path.join(ROOT, "public"), DIST, { recursive: true });
  await cp(path.join(ROOT, "src", "styles.css"), path.join(DIST, "assets", "styles.css"));
  await cp(path.join(ROOT, "src", "client.js"), path.join(DIST, "assets", "client.js"));

  await writePage(
    "",
    layout({
      title: "Formation Investissement & Trading",
      description: "Formation publique pour comprendre l’investissement, le trading et les mécanismes de risque à travers des concepts et des cas historiques.",
      body: renderHome(volumes),
      volumes,
      activePage: "home",
      bodyClass: "home-page",
    }),
  );
  await writePage(
    "volumes",
    layout({
      title: "Tous les volumes",
      description: "Parcourez tous les volumes de la formation Investissement & Trading.",
      body: renderVolumesIndex(volumes),
      volumes,
      activePage: "volumes",
      bodyClass: "volumes-page",
    }),
  );
  await writePage(
    "recherche",
    layout({
      title: "Recherche",
      description: "Recherchez une notion, un dossier, une figure ou une source dans toute la formation.",
      body: renderSearchPage(),
      volumes,
      activePage: "search",
      bodyClass: "search-page-body",
    }),
  );

  for (const volume of volumes) {
    await writePage(
      path.join("volumes", volume.metadata.slug),
      layout({
        title: `${volume.metadata.title} — Volume ${volume.metadata.volumeNumber || volume.metadata.order}`,
        description: volume.metadata.description,
        body: renderVolumePage(volume, volumes, quizzes[volume.metadata.slug]),
        volumes,
        activePage: volume.metadata.slug,
        showToc: true,
        bodyClass: "course-page",
      }),
    );
  }

  const searchEntries = volumes.flatMap(buildSearchEntries);
  await writeFile(path.join(DIST, "search-index.json"), JSON.stringify(searchEntries), "utf8");
  await writeFile(path.join(DIST, ".nojekyll"), "", "utf8");
  await writeFile(
    path.join(DIST, "robots.txt"),
    `User-agent: *\nAllow: ${basePath}\n`,
    "utf8",
  );
  console.log(
    `Built ${volumes.length + 3} pages at ${basePath}, ${searchEntries.length} searchable sections and ${(
      await readdir(path.join(DIST, "media"), { recursive: true })
    ).length} media entries.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
