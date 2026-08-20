import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  applyClaim,
  createGrid,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  type GridState,
  type Occupant,
  type Rect,
} from "./lib/board";
import { deserializeGrid, serializeGrid } from "./lib/persist";

const ROOT = join(import.meta.dir, "..");
export const DATA_DIR = join(ROOT, "data");
export const LOGOS_DIR = join(DATA_DIR, "logos");
const CLAIMS_PATH = join(DATA_DIR, "claims.json");

const SEEDS: Array<{ rect: Rect; occupant: Occupant }> = [
  {
    rect: { x: 6, y: 8, width: 12, height: 10 },
    occupant: {
      claimId: "seed-atlas",
      url: "https://example.com",
      description:
        "Atlas Planner keeps a shared calendar on one page so a small team can see the week at a glance.",
      logoUrl: "/seed-logos/atlas.svg",
    },
  },
  {
    rect: { x: 38, y: 20, width: 14, height: 9 },
    occupant: {
      claimId: "seed-keel",
      url: "https://example.org",
      description:
        "Keel is a quiet field notes app for people who think in short bursts and need them later.",
      logoUrl: "/seed-logos/keel.svg",
    },
  },
  {
    rect: { x: 68, y: 52, width: 10, height: 10 },
    occupant: {
      claimId: "seed-lumen",
      url: "https://example.net",
      description:
        "Lumen turns a reading list into a nightly digest. Tap through to the site from this square.",
      logoUrl: "/seed-logos/lumen.svg",
    },
  },
];

export function seedGrid(): GridState {
  let grid = createGrid();
  for (const seed of SEEDS) {
    grid = applyClaim(grid, seed.rect, seed.occupant);
  }
  return grid;
}

export async function loadPersistedGrid(): Promise<GridState> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(LOGOS_DIR, { recursive: true });
  const file = Bun.file(CLAIMS_PATH);
  if (await file.exists()) {
    const text = await file.text();
    if (text.trim()) {
      const loaded = deserializeGrid(text);
      if (loaded.cols === DEFAULT_COLS && loaded.rows === DEFAULT_ROWS) {
        return loaded;
      }
    }
  }
  const grid = seedGrid();
  await savePersistedGrid(grid);
  return grid;
}

export async function savePersistedGrid(grid: GridState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await Bun.write(CLAIMS_PATH, serializeGrid(grid));
}

export async function storeLogoFile(
  claimId: string,
  bytes: Uint8Array,
  extension: string,
): Promise<string> {
  await mkdir(LOGOS_DIR, { recursive: true });
  const safeExt = extension.replace(/[^a-z0-9]/gi, "") || "png";
  const filename = `${claimId}.${safeExt}`;
  await Bun.write(join(LOGOS_DIR, filename), bytes);
  return `/logos/${filename}`;
}
