import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 3477);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const scratch = process.env.SCRATCH ?? join(import.meta.dir, "../.scratch");

async function waitForServer(timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await Bun.sleep(150);
  }
  throw new Error(`Server did not start on ${ORIGIN}`);
}

async function runProbe(runIndex: number): Promise<{
  errors: string[];
  canvas: { width: number; height: number };
  paintedFraction: number;
  tip: string;
  href: string;
}> {
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("crash", () => errors.push("page crashed"));

  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const api = window.__lastResort;
    if (!api) {
      return false;
    }
    const { grid } = api.getState();
    return grid.cells.some((cell) => cell !== null);
  });
  await page.waitForTimeout(400);

  const metrics = await page.evaluate(() => {
    const canvas = document.getElementById("board") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { width: 0, height: 0, paintedFraction: 0 };
    }
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let painted = 0;
    const samples = 40000;
    const step = Math.max(4, Math.floor(data.length / 4 / samples) * 4);
    let count = 0;
    for (let i = 0; i < data.length; i += step) {
      count += 1;
      if (data[i] + data[i + 1] + data[i + 2] + data[i + 3] > 0) {
        painted += 1;
      }
    }
    return { width, height, paintedFraction: painted / Math.max(1, count) };
  });

  await page.screenshot({
    path: join(scratch, runIndex === 1 ? "grid.png" : "grid-run2.png"),
    fullPage: true,
  });

  const hover = await page.evaluate(() => {
    const api = window.__lastResort;
    const { camera, grid } = api.getState();
    let target: { x: number; y: number } | null = null;
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const desc = api.lookupDescription(grid, x, y);
        if (desc) {
          target = { x, y };
          break;
        }
      }
      if (target) {
        break;
      }
    }
    if (!target) {
      return { screenX: 0, screenY: 0, missing: true };
    }
    const screenX = camera.x + (target.x + 0.5) * grid.cellSize * camera.zoom;
    const screenY = camera.y + (target.y + 0.5) * grid.cellSize * camera.zoom;
    return { screenX, screenY, missing: false };
  });

  if (!hover.missing) {
    const box = await page.locator("#viewport").boundingBox();
    if (box) {
      await page.mouse.move(box.x + hover.screenX, box.y + hover.screenY);
      await page.waitForTimeout(200);
    }
  }

  const tip = ((await page.locator("#tip").textContent()) ?? "").trim();
  const href = (await page.locator("#occupant-link").getAttribute("href")) ?? "";

  await page.screenshot({
    path: join(scratch, runIndex === 1 ? "occupied.png" : "occupied-run2.png"),
  });

  await browser.close();
  return {
    errors,
    canvas: { width: metrics.width, height: metrics.height },
    paintedFraction: metrics.paintedFraction,
    tip,
    href,
  };
}

async function main() {
  await mkdir(scratch, { recursive: true });
  const logPath = join(scratch, "launch.log");
  const lines: string[] = [];
  const log = (message: string) => {
    lines.push(message);
    console.log(message);
  };

  let playwrightOk = true;
  try {
    await import("playwright");
  } catch {
    playwrightOk = false;
  }
  if (!playwrightOk) {
    const message = [
      "Playwright is not installed. Tried: import('playwright').",
      `npx playwright --version was the fallback probe.`,
    ].join("\n");
    await Bun.write(join(scratch, "launch-unavailable.log"), message);
    log(message);
    await Bun.write(logPath, lines.join("\n"));
    return;
  }

  let child: ReturnType<typeof spawn> | null = null;
  let serverOut = "";
  let alreadyUp = false;
  try {
    const probe = await fetch(ORIGIN);
    alreadyUp = probe.ok;
  } catch {
    alreadyUp = false;
  }

  if (!alreadyUp) {
    child = spawn("bun", ["src/server.ts"], {
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      serverOut += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      serverOut += String(chunk);
    });
    await waitForServer(8000);
    log(`spawned bun src/server.ts at ${ORIGIN}`);
  } else {
    log(`using running bun src/server.ts at ${ORIGIN}`);
  }

  try {
    log(serverOut.trim());

    const first = await runProbe(1);
    log(`run1 canvas=${first.canvas.width}x${first.canvas.height}`);
    log(`run1 painted=${first.paintedFraction.toFixed(3)}`);
    log(`run1 errors=${JSON.stringify(first.errors)}`);
    log(`run1 tip=${first.tip}`);
    log(`run1 href=${first.href}`);

    const second = await runProbe(2);
    log(`run2 canvas=${second.canvas.width}x${second.canvas.height}`);
    log(`run2 painted=${second.paintedFraction.toFixed(3)}`);
    log(`run2 errors=${JSON.stringify(second.errors)}`);
    log(`run2 tip=${second.tip}`);
    log(`run2 href=${second.href}`);

    const ok =
      first.errors.length === 0 &&
      second.errors.length === 0 &&
      first.canvas.width === 3200 &&
      first.canvas.height === 3200 &&
      second.canvas.width === 3200 &&
      second.canvas.height === 3200 &&
      first.paintedFraction > 0.8 &&
      second.paintedFraction > 0.8 &&
      first.tip.length > 0 &&
      second.tip.length > 0 &&
      first.href.startsWith("http");

    if (!ok) {
      throw new Error("Launch probe failed: " + lines.join(" | "));
    }
    log("launch probe passed twice");
  } finally {
    if (child) {
      child.kill("SIGTERM");
    }
    await Bun.write(logPath, lines.join("\n") + "\n" + serverOut);
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await mkdir(scratch, { recursive: true });
  await Bun.write(join(scratch, "launch-unavailable.log"), message);
  await Bun.write(join(scratch, "launch.log"), message);
  console.error(message);
  process.exit(1);
}

