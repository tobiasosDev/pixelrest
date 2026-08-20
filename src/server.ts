import { join } from "node:path";
import {
  applyClaim,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  clipRect,
  groupClaims,
  quoteRegion,
  type GridState,
} from "./lib/board";
import { isVisitorId, rankHolders } from "./lib/hud";
import { snapshot } from "./lib/persist";
import { heartbeatLocal, readLocalCounts } from "./lib/presence";
import { normalizeWebsiteUrl } from "./lib/url";
import { fetchWebsiteLogo } from "./fetch-logo";
import {
  loadPersistedGrid,
  LOGOS_DIR,
  savePersistedGrid,
  storeLogoFile,
} from "./store";

const ROOT = join(import.meta.dir, "..");
const PUBLIC_DIR = join(ROOT, "public");
const PORT = Number(process.env.PORT ?? 3477);

let grid: GridState = await loadPersistedGrid();

function mimeFor(pathname: string): string {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".woff2")) return "font/woff2";
  if (pathname.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

async function bundleClient(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "client.ts")],
    target: "browser",
    format: "esm",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success) {
    const detail = result.logs.map((log) => String(log)).join("\n");
    return new Response(`Client build failed\n${detail}`, { status: 500 });
  }
  const js = await result.outputs[0].text();
  return new Response(js, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function servePublic(pathname: string): Promise<Response | null> {
  const relative = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return new Response("Not found", { status: 404 });
  }
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  return new Response(file, {
    headers: { "content-type": mimeFor(filePath) },
  });
}

async function serveLogo(pathname: string): Promise<Response | null> {
  if (!pathname.startsWith("/logos/")) {
    return null;
  }
  const name = pathname.slice("/logos/".length);
  if (!name || name.includes("/") || name.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  const filePath = join(LOGOS_DIR, name);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(file, {
    headers: { "content-type": mimeFor(filePath) },
  });
}

function gridPayload() {
  return snapshot(grid);
}

function holdersPayload() {
  return rankHolders(
    groupClaims(grid).map((region) => ({
      url: region.occupant.url,
      logoUrl: region.occupant.logoUrl,
      squares: region.cells.length,
      x: region.minX,
      y: region.minY,
      width: region.maxX - region.minX + 1,
      height: region.maxY - region.minY + 1,
    })),
  );
}

async function handlePresence(req: Request): Promise<Response> {
  if (req.method === "GET") {
    const counts = readLocalCounts();
    return Response.json({
      live: counts.live,
      today: counts.today,
      holders: holdersPayload(),
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const body = (await req.json()) as { visitorId?: unknown };
  if (!isVisitorId(body.visitorId)) {
    return Response.json({ error: "invalid visitor" }, { status: 400 });
  }
  const counts = heartbeatLocal(body.visitorId);
  return Response.json({
    live: counts.live,
    today: counts.today,
    holders: holdersPayload(),
  });
}

async function handleQuote(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  const rect = clipRect(
    {
      x: Number(body.x) || 0,
      y: Number(body.y) || 0,
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
    },
    grid.cols,
    grid.rows,
  );
  if (!rect) {
    return Response.json(
      { error: "Select at least one square." },
      { status: 400 },
    );
  }
  return Response.json({ rect, quote: quoteRegion(grid, rect) });
}

async function handleClaim(req: Request): Promise<Response> {
  const body = (await req.json()) as {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    url?: unknown;
    description?: unknown;
    file?: unknown;
    logo?: unknown;
  };
  if (body.file !== undefined || body.logo !== undefined) {
    return Response.json(
      { error: "Do not upload an image. Paste a website URL." },
      { status: 400 },
    );
  }
  const rect = clipRect(
    {
      x: Number(body.x) || 0,
      y: Number(body.y) || 0,
      width: Number(body.width) || 0,
      height: Number(body.height) || 0,
    },
    grid.cols,
    grid.rows,
  );
  if (!rect) {
    return Response.json(
      { error: "Select at least one square." },
      { status: 400 },
    );
  }
  if (typeof body.url !== "string") {
    return Response.json({ error: "Paste a website URL." }, { status: 400 });
  }
  if (typeof body.description !== "string" || !body.description.trim()) {
    return Response.json(
      { error: "Add a short description for hover and long-press." },
      { status: 400 },
    );
  }
  let websiteUrl: string;
  try {
    websiteUrl = normalizeWebsiteUrl(body.url);
  } catch {
    return Response.json({ error: "That URL is not valid." }, { status: 400 });
  }
  const quote = quoteRegion(grid, rect);
  if (!quote.claimable) {
    return Response.json(
      { error: "Those squares are taken. Pick empty ones." },
      { status: 400 },
    );
  }
  const claimId = crypto.randomUUID();
  let logoUrl: string | null = null;
  const fetched = await fetchWebsiteLogo(websiteUrl);
  if (fetched) {
    logoUrl = await storeLogoFile(claimId, fetched.bytes, fetched.extension);
  }
  grid = applyClaim(grid, rect, {
    claimId,
    url: websiteUrl,
    description: body.description.trim().slice(0, 280),
    logoUrl,
  });
  await savePersistedGrid(grid);
  return Response.json({
    ok: true,
    quote,
    grid: gridPayload(),
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname === "/api/grid" && req.method === "GET") {
      return Response.json(gridPayload());
    }
    if (pathname === "/api/presence" && (req.method === "GET" || req.method === "POST")) {
      return handlePresence(req);
    }
    if (pathname === "/api/quote" && req.method === "POST") {
      return handleQuote(req);
    }
    if (pathname === "/api/claim" && req.method === "POST") {
      return handleClaim(req);
    }
    if (pathname === "/app.js") {
      return bundleClient();
    }

    const logo = await serveLogo(pathname);
    if (logo) {
      return logo;
    }
    const pub = await servePublic(pathname);
    if (pub) {
      return pub;
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(
  `Pixelrest board on http://localhost:${server.port} (${CANVAS_WIDTH}x${CANVAS_HEIGHT} canvas)`,
);
