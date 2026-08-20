import { describe, expect, test } from "bun:test";
import {
  applyClaim,
  createGrid,
  getCell,
  listCellsInRect,
  lookupDescription,
  quoteRegion,
  rectFromPoints,
  tapCellSelection,
  VACANT_PRICE,
  BOARD_SQUARES,
  BOARD_VALUE,
  DEFAULT_COLS,
  DEFAULT_ROWS,
} from "../src/lib/board";
import {
  createCamera,
  gridIsReachable,
  initialCamera,
  panCamera,
  zoomCamera,
} from "../src/lib/camera";
import { resolveLogoFromHtml } from "../src/lib/logo";
import { deserializeGrid, serializeGrid } from "../src/lib/persist";

function occupant(
  claimId: string,
  url: string,
  description: string,
  logoUrl: string | null = "/logos/a.svg",
) {
  return { claimId, url, description, logoUrl };
}

describe("pricing", () => {
  test("a 1x1 vacant cell costs $10", () => {
    const grid = createGrid({ cols: 8, rows: 8, cellSize: 10 });
    const quote = quoteRegion(grid, { x: 3, y: 4, width: 1, height: 1 });
    expect(VACANT_PRICE).toBe(10);
    expect(quote.vacantCount).toBe(1);
    expect(quote.occupiedCount).toBe(0);
    expect(quote.total).toBe(10);
  });

  test("a 1x1 occupied cell is not for sale", () => {
    let grid = createGrid({ cols: 8, rows: 8, cellSize: 10 });
    grid = applyClaim(
      grid,
      { x: 2, y: 2, width: 1, height: 1 },
      occupant("c1", "https://taken.test", "Taken"),
    );
    const quote = quoteRegion(grid, { x: 2, y: 2, width: 1, height: 1 });
    expect(quote.vacantCount).toBe(0);
    expect(quote.occupiedCount).toBe(1);
    expect(quote.claimable).toBe(false);
    expect(quote.total).toBe(0);
  });

  test("a mixed rectangle cannot be claimed and costs nothing", () => {
    let grid = createGrid({ cols: 8, rows: 8, cellSize: 10 });
    grid = applyClaim(
      grid,
      { x: 0, y: 0, width: 2, height: 1 },
      occupant("c1", "https://a.test", "A"),
    );
    const rect = { x: 0, y: 0, width: 3, height: 2 };
    const quote = quoteRegion(grid, rect);
    const cells = listCellsInRect(rect);
    expect(cells.length).toBe(6);
    expect(quote.occupiedCount).toBe(2);
    expect(quote.vacantCount).toBe(4);
    expect(quote.claimable).toBe(false);
    expect(quote.total).toBe(0);
  });

  test("a full square board at $10 per square is worth at least one million", () => {
    expect(DEFAULT_COLS).toBe(DEFAULT_ROWS);
    expect(BOARD_SQUARES).toBe(DEFAULT_COLS * DEFAULT_ROWS);
    expect(VACANT_PRICE).toBe(10);
    expect(BOARD_VALUE).toBe(BOARD_SQUARES * VACANT_PRICE);
    expect(BOARD_VALUE).toBeGreaterThanOrEqual(1_000_000);
    const grid = createGrid();
    expect(grid.cols).toBe(grid.rows);
    const quote = quoteRegion(grid, {
      x: 0,
      y: 0,
      width: grid.cols,
      height: grid.rows,
    });
    expect(quote.vacantCount).toBe(BOARD_SQUARES);
    expect(quote.total).toBe(BOARD_VALUE);
    expect(quote.claimable).toBe(true);
  });

  test("tapping neighboring squares grows a connected rectangle and rejects a jump", () => {
    const first = tapCellSelection(null, 2, 2);
    expect(first).toEqual({ x: 2, y: 2, width: 1, height: 1 });
    const grown = tapCellSelection(first, 3, 2);
    expect(grown).toEqual({ x: 2, y: 2, width: 2, height: 1 });
    const taller = tapCellSelection(grown, 3, 3);
    expect(taller).toEqual({ x: 2, y: 2, width: 2, height: 2 });
    const jumped = tapCellSelection(taller, 8, 8);
    expect(jumped).toEqual(taller);
    const same = tapCellSelection(first, 2, 2);
    expect(same).toBeNull();
  });

  test("a multi-cell rectangle is allowed", () => {
    const grid = createGrid({ cols: 12, rows: 12, cellSize: 10 });
    const rect = rectFromPoints(1, 2, 5, 6);
    expect(rect).toEqual({ x: 1, y: 2, width: 5, height: 5 });
    const quote = quoteRegion(grid, rect);
    expect(quote.cellCount).toBe(25);
    expect(quote.total).toBe(25 * 10);
  });
});

describe("claim", () => {
  test("applying a claim writes occupancy, url, and description onto every selected cell", () => {
    let grid = createGrid({ cols: 6, rows: 6, cellSize: 10 });
    const rect = { x: 1, y: 1, width: 3, height: 2 };
    grid = applyClaim(
      grid,
      rect,
      occupant("alpha", "https://alpha.test/app", "Alpha notes"),
    );
    for (const { x, y } of listCellsInRect(rect)) {
      const cell = getCell(grid, x, y);
      expect(cell).not.toBeNull();
      expect(cell?.url).toBe("https://alpha.test/app");
      expect(cell?.description).toBe("Alpha notes");
      expect(cell?.claimId).toBe("alpha");
    }
    expect(getCell(grid, 0, 0)).toBeNull();
    expect(lookupDescription(grid, 2, 1)).toBe("Alpha notes");
  });

  test("a second claim on occupied squares does not take them over", () => {
    let grid = createGrid({ cols: 6, rows: 6, cellSize: 10 });
    grid = applyClaim(
      grid,
      { x: 0, y: 0, width: 3, height: 3 },
      occupant("first", "https://first.test", "First app"),
    );
    const subset = { x: 1, y: 1, width: 2, height: 2 };
    const quote = quoteRegion(grid, subset);
    expect(quote.occupiedCount).toBe(4);
    expect(quote.vacantCount).toBe(0);
    expect(quote.claimable).toBe(false);
    expect(quote.total).toBe(0);

    grid = applyClaim(
      grid,
      subset,
      occupant("second", "https://second.test", "Second app", "/logos/b.svg"),
    );

    expect(lookupDescription(grid, 1, 1)).toBe("First app");
    expect(getCell(grid, 1, 1)?.url).toBe("https://first.test");
    expect(getCell(grid, 1, 1)?.claimId).toBe("first");
    expect(lookupDescription(grid, 0, 0)).toBe("First app");
  });

  test("description lookup returns stored text for an occupied cell and null for vacant", () => {
    let grid = createGrid({ cols: 4, rows: 4, cellSize: 10 });
    grid = applyClaim(
      grid,
      { x: 3, y: 0, width: 1, height: 1 },
      occupant("d", "https://desc.test", "Hover copy lives here"),
    );
    expect(lookupDescription(grid, 3, 0)).toBe("Hover copy lives here");
    expect(lookupDescription(grid, 0, 0)).toBeNull();
  });
});

describe("camera pan and zoom", () => {
  const viewport = { width: 390, height: 640 };
  const gridSize = 1000;

  test("pan changes the view on every axis and keeps the grid in reach", () => {
    const origin = createCamera();
    expect(origin).toEqual({ x: 0, y: 0, zoom: 1 });

    const east = panCamera(origin, -80, 0, viewport, gridSize);
    expect(east.x).not.toBe(origin.x);
    expect(gridIsReachable(east, viewport, gridSize)).toBe(true);

    const south = panCamera(origin, 0, -120, viewport, gridSize);
    expect(south.y).not.toBe(origin.y);
    expect(gridIsReachable(south, viewport, gridSize)).toBe(true);

    const southwest = panCamera(origin, -40, -60, viewport, gridSize);
    expect(southwest.x).not.toBe(origin.x);
    expect(southwest.y).not.toBe(origin.y);
    expect(gridIsReachable(southwest, viewport, gridSize)).toBe(true);

    const back = panCamera(east, 80, 0, viewport, gridSize);
    expect(back.x).not.toBe(east.x);

    const overpan = panCamera(origin, 5000, 5000, viewport, gridSize);
    expect(gridIsReachable(overpan, viewport, gridSize)).toBe(true);
    const underpan = panCamera(origin, -50000, -50000, viewport, gridSize);
    expect(gridIsReachable(underpan, viewport, gridSize)).toBe(true);
  });

  test("zoom in and out change the view and keep the grid in reach", () => {
    const origin = createCamera();
    const inward = zoomCamera(origin, 2, 100, 80, viewport, gridSize);
    expect(inward.zoom).toBeGreaterThan(origin.zoom);
    expect(gridIsReachable(inward, viewport, gridSize)).toBe(true);

    const outward = zoomCamera(inward, 0.25, 100, 80, viewport, gridSize);
    expect(outward.zoom).toBeLessThan(inward.zoom);
    expect(gridIsReachable(outward, viewport, gridSize)).toBe(true);

    const punched = zoomCamera(origin, 100, 10, 10, viewport, gridSize);
    expect(gridIsReachable(punched, viewport, gridSize)).toBe(true);
    const collapsed = zoomCamera(origin, 0.01, 10, 10, viewport, gridSize);
    expect(gridIsReachable(collapsed, viewport, gridSize)).toBe(true);
  });

  test("phone starts at 1:1 so the board is panned; desktop fits the board", () => {
    const phone = initialCamera({ width: 390, height: 720 }, gridSize);
    expect(phone.zoom).toBe(1);
    expect(gridIsReachable(phone, { width: 390, height: 720 }, gridSize)).toBe(
      true,
    );
    const desktop = initialCamera({ width: 1280, height: 800 }, gridSize);
    expect(desktop.zoom).toBeLessThan(1);
    expect(
      gridIsReachable(desktop, { width: 1280, height: 800 }, gridSize),
    ).toBe(true);
  });
});

describe("logo from website HTML", () => {
  test("picks apple-touch-icon over icon, og:image, and favicon", () => {
    const html = `<!doctype html><html><head>
      <link rel="icon" href="/favicon-32.png" sizes="32x32">
      <link rel="apple-touch-icon" href="/apple-touch.png">
      <meta property="og:image" content="/og.png">
    </head></html>`;
    const logo = resolveLogoFromHtml({
      html,
      headers: { "content-type": "text/html" },
      baseUrl: "https://apps.example/path/",
      file: { name: "upload.png" },
    });
    expect(logo).toBe("https://apps.example/apple-touch.png");
    expect(logo).not.toContain("upload");
  });

  test("falls back to rel=icon when apple-touch-icon is missing", () => {
    const html = `<html><head>
      <link href="/marks/icon.svg" rel="icon" type="image/svg+xml">
      <meta property="og:image" content="https://cdn.example/og.jpg">
    </head></html>`;
    const logo = resolveLogoFromHtml({
      html,
      baseUrl: "https://shop.example",
    });
    expect(logo).toBe("https://shop.example/marks/icon.svg");
  });

  test("falls back to og:image when no icons are present", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.example/share.png">
    </head></html>`;
    const logo = resolveLogoFromHtml({
      html,
      baseUrl: "https://plain.example",
    });
    expect(logo).toBe("https://cdn.example/share.png");
  });

  test("falls back to /favicon.ico when HTML exposes no image", () => {
    const html = `<html><head><title>No icons</title></head><body>hi</body></html>`;
    const logo = resolveLogoFromHtml({
      html,
      headers: { "content-type": "text/html; charset=utf-8" },
      baseUrl: "https://bare.example/app",
    });
    expect(logo).toBe("https://bare.example/favicon.ico");
  });

  test("does not accept an uploaded image file as input", () => {
    const html = `<html><head><link rel="icon" href="/site-icon.png"></head></html>`;
    const logo = resolveLogoFromHtml({
      html,
      baseUrl: "https://from-site.example",
      file: { name: "logo.png", type: "image/png", bytes: [1, 2, 3] },
      uploadedImage: "data:image/png;base64,AAAA",
    });
    expect(logo).toBe("https://from-site.example/site-icon.png");
    expect(logo?.startsWith("data:")).toBe(false);
    expect(logo).not.toContain("logo.png");
  });
});

describe("persist", () => {
  test("claims survive serialize and deserialize (reload)", () => {
    let grid = createGrid({ cols: 5, rows: 5, cellSize: 10 });
    grid = applyClaim(
      grid,
      { x: 2, y: 1, width: 2, height: 2 },
      occupant("keep", "https://keep.test", "Still here after reload"),
    );
    const loaded = deserializeGrid(serializeGrid(grid));
    expect(lookupDescription(loaded, 2, 1)).toBe("Still here after reload");
    expect(getCell(loaded, 3, 2)?.url).toBe("https://keep.test");
    expect(getCell(loaded, 0, 0)).toBeNull();
  });
});
