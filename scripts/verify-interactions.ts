import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ORIGIN = process.env.ORIGIN ?? "http://127.0.0.1:3477";
const scratch = process.env.SCRATCH ?? join(import.meta.dir, "../.scratch");

async function main() {
  await mkdir(scratch, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  desktop.on("pageerror", (error) => errors.push(String(error)));
  await desktop.goto(ORIGIN, { waitUntil: "networkidle" });
  await desktop.waitForFunction(() =>
    window.__lastResort?.getState().grid.cells.some((cell) => cell),
  );
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: join(scratch, "desktop-fit.png") });

  const fileInputs = await desktop.locator("input[type=file]").count();
  if (fileInputs !== 0) {
    throw new Error("Logo file input is present");
  }

  await desktop.click("#tool-claim");
  const before = await desktop.evaluate(() => window.__lastResort.getState());
  const cell = { x: 86, y: 4 };
  const box = await desktop.locator("#viewport").boundingBox();
  if (!box) {
    throw new Error("missing viewport");
  }
  const startX =
    box.x +
    before.camera.x +
    (cell.x + 0.2) * before.grid.cellSize * before.camera.zoom;
  const startY =
    box.y +
    before.camera.y +
    (cell.y + 0.2) * before.grid.cellSize * before.camera.zoom;
  const endX =
    box.x +
    before.camera.x +
    (cell.x + 2.8) * before.grid.cellSize * before.camera.zoom;
  const endY =
    box.y +
    before.camera.y +
    (cell.y + 1.8) * before.grid.cellSize * before.camera.zoom;
  await desktop.mouse.move(startX, startY);
  await desktop.mouse.down();
  await desktop.mouse.move(endX, endY);
  await desktop.mouse.up();
  await desktop.waitForSelector("#ticket.open");
  const quoteText = (await desktop.locator("#quote-line").textContent()) ?? "";
  await desktop.screenshot({ path: join(scratch, "select.png") });
  await desktop.fill("#url", "https://example.com");
  await desktop.fill(
    "#description",
    "Example claimed this patch from the form with no image upload.",
  );
  await desktop.click("#claim-submit");
  await desktop.waitForFunction(() => {
    const { grid } = window.__lastResort.getState();
    return window.__lastResort.lookupDescription(grid, 86, 4)?.includes("Example claimed");
  }, { timeout: 20000 });
  await desktop.waitForTimeout(400);
  await desktop.screenshot({ path: join(scratch, "after-claim.png") });

  await desktop.reload({ waitUntil: "networkidle" });
  await desktop.waitForFunction(() => {
    const { grid } = window.__lastResort.getState();
    return window.__lastResort.lookupDescription(grid, 86, 4)?.includes("Example claimed");
  });

  const vbox = await desktop.locator("#viewport").boundingBox();
  if (!vbox) {
    throw new Error("missing viewport");
  }
  await desktop.click("#zoom-in");
  await desktop.click("#zoom-in");
  await desktop.click("#zoom-in");
  const cam1 = await desktop.evaluate(() => window.__lastResort.getState().camera);
  await desktop.mouse.move(vbox.x + 240, vbox.y + 240);
  await desktop.mouse.down();
  await desktop.mouse.move(vbox.x + 40, vbox.y + 40);
  await desktop.mouse.up();
  const cam2 = await desktop.evaluate(() => window.__lastResort.getState().camera);
  await desktop.click("#zoom-in");
  const cam3 = await desktop.evaluate(() => window.__lastResort.getState().camera);

  await desktop.click("#zoom-fit");
  const occupied = await desktop.evaluate(() => {
    const api = window.__lastResort;
    const { camera, grid } = api.getState();
    const viewW = document.getElementById("viewport")?.clientWidth ?? 0;
    const viewH = document.getElementById("viewport")?.clientHeight ?? 0;
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        if (!api.lookupDescription(grid, x, y)) {
          continue;
        }
        const sx = camera.x + (x + 0.5) * grid.cellSize * camera.zoom;
        const sy = camera.y + (y + 0.5) * grid.cellSize * camera.zoom;
        if (sx >= 8 && sy >= 8 && sx < viewW - 8 && sy < viewH - 8) {
          return { x: sx, y: sy };
        }
      }
    }
    return null;
  });
  if (!occupied) {
    throw new Error("no visible occupied cell");
  }
  const box2 = await desktop.locator("#viewport").boundingBox();
  if (!box2) {
    throw new Error("missing viewport");
  }
  await desktop.mouse.move(box2.x + occupied.x, box2.y + occupied.y);
  await desktop.mouse.down();
  await desktop.waitForTimeout(700);
  const longTip = ((await desktop.locator("#tip-text").textContent()) ?? "").trim();
  const openVisible = await desktop.locator("#tip-open").isVisible();
  await desktop.screenshot({ path: join(scratch, "long-press.png") });
  await desktop.mouse.up();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 720 },
    hasTouch: true,
    isMobile: true,
  });
  mobile.on("pageerror", (error) => errors.push("mobile " + error));
  await mobile.goto(ORIGIN, { waitUntil: "networkidle" });
  await mobile.waitForFunction(() =>
    window.__lastResort?.getState().grid.cells.some((cell) => cell),
  );
  await mobile.waitForTimeout(300);
  const mobileCam = await mobile.evaluate(() => window.__lastResort.getState().camera);
  await mobile.screenshot({ path: join(scratch, "mobile.png") });

  await browser.close();

  const report = {
    errors,
    fileInputs,
    quoteText,
    persisted: true,
    panChanged: cam1.x !== cam2.x || cam1.y !== cam2.y,
    zoomChanged: cam3.zoom !== cam2.zoom,
    longTip,
    openVisible,
    mobileZoom: mobileCam.zoom,
  };
  await Bun.write(join(scratch, "interactions.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) {
    throw new Error("page errors: " + errors.join("; "));
  }
  if (!quoteText.includes("$")) {
    throw new Error("quote missing: " + quoteText);
  }
  if (!report.panChanged) {
    throw new Error("pan did not change camera");
  }
  if (!report.zoomChanged) {
    throw new Error("zoom did not change camera");
  }
  if (!longTip) {
    throw new Error("long-press did not show description");
  }
  if (!report.openVisible) {
    throw new Error("inspect card is missing Open link");
  }
  if (mobileCam.zoom !== 1) {
    throw new Error("mobile did not start at 1:1, got " + mobileCam.zoom);
  }
}

await main();
