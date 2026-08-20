import {
  applyClaim,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  claimRectFromAnchor,
  clipRect,
  getCell,
  gridFromOccupied,
  groupClaims,
  lookupDescription,
  quoteRegion,
  rectFromPoints,
  tapCellSelection,
  type GridState,
  type Quote,
  type Rect,
} from "./lib/board";
import {
  clampCamera,
  createCamera,
  fitCamera,
  frameWorldRect,
  minZoomFor,
  panCamera,
  revealWorldRect,
  screenToCell,
  zoomCamera,
  type Camera,
  type CameraInsets,
  type Viewport,
} from "./lib/camera";
import { isVisitorId, rankHolders, type Holder } from "./lib/hud";
import { resolveLogoFromHtml } from "./lib/logo";
import { placeholderDataUrl } from "./lib/placeholder";

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 8;
const VISITOR_KEY = "pixelrest-visitor";
const HEARTBEAT_MS = 20_000;
const VACANT = "#0a0a0a";
const LINE = "rgba(255,255,255,0.18)";
const LINE_STRONG = "rgba(255,255,255,0.5)";
const SELECT_STROKE = "#eaeaea";
const SELECT_FILL = "rgba(255,255,255,0.12)";

const viewportEl = document.getElementById("viewport") as HTMLDivElement;
const surfaceEl = document.getElementById("grid-surface") as HTMLDivElement;
const canvas = document.getElementById("board") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("Canvas is not available");
}
const tipEl = document.getElementById("tip") as HTMLDivElement;
const ticketEl = document.getElementById("ticket") as HTMLElement;
const formEl = document.getElementById("claim-form") as HTMLFormElement;
const urlEl = document.getElementById("url") as HTMLInputElement;
const descriptionEl = document.getElementById("description") as HTMLTextAreaElement;
const quoteLineEl = document.getElementById("quote-line") as HTMLElement;
const errorEl = document.getElementById("form-error") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const coordEl = document.getElementById("coord") as HTMLElement;
const zoomEl = document.getElementById("zoom") as HTMLElement;
const occupantLink = document.getElementById("occupant-link") as HTMLAnchorElement;
const claimBtn = document.getElementById("tool-claim") as HTMLButtonElement;
const submitBtn = document.getElementById("claim-submit") as HTMLButtonElement;
const tipTextEl = document.getElementById("tip-text") as HTMLElement;
const tipOpenEl = document.getElementById("tip-open") as HTMLAnchorElement;
const ctx = canvas.getContext("2d");

if (!ctx) {
  throw new Error("Canvas is not available");
}

let grid: GridState = gridFromOccupied({ occupied: [] });
let camera: Camera = createCamera();
let claimRegions: ReturnType<typeof groupClaims> | null = null;
let claimMode = false;
let selection: Rect | null = null;
let claimAnchor: { x: number; y: number } | null = null;
let liveQuote: Quote | null = null;
let spacePan = false;
let inspectPinned = false;

const images = new Map<string, HTMLImageElement>();
const pointers = new Map<number, { x: number; y: number }>();
let dragOrigin: { x: number; y: number; cellX: number; cellY: number } | null =
  null;
let lastPoint: { x: number; y: number } | null = null;
let moved = false;
let longPressTimer: number | null = null;
let longPressFired = false;
let pinch: { distance: number; midX: number; midY: number } | null = null;
let pinched = false;
let userInteracted = false;
let insetsCache: CameraInsets | null = null;
let velocity = { x: 0, y: 0 };
let lastMoveTime = 0;
let glideFrame: number | null = null;
let zoomFrame: number | null = null;
let lastTap: { time: number; x: number; y: number } | null = null;

function view(): Viewport {
  return {
    width: Math.max(1, viewportEl.clientWidth),
    height: Math.max(1, viewportEl.clientHeight),
  };
}

function invalidateInsets() {
  insetsCache = null;
}

function cameraInsets(): CameraInsets {
  if (insetsCache) {
    return insetsCache;
  }
  const dock = document.querySelector(".dock") as HTMLElement | null;
  const mark = document.querySelector(".mark") as HTMLElement | null;
  const side = 24;
  const top = mark
    ? Math.round(mark.getBoundingClientRect().bottom) + 16
    : 48;
  const dockH = Math.round(dock?.getBoundingClientRect().height ?? 56);
  const ticketH = ticketEl.classList.contains("open")
    ? ticketEl.offsetHeight
    : 0;
  insetsCache = { top, right: side, bottom: dockH + ticketH + 24, left: side };
  return insetsCache;
}

function keepSelectionOnScreen() {
  const insets = cameraInsets();
  if (!selection) {
    applyCamera();
    return;
  }
  const dockOnly = {
    ...insets,
    bottom: insets.bottom - (ticketEl.classList.contains("open") ? ticketEl.offsetHeight : 0),
  };
  const fitted =
    camera.zoom <=
    minZoomFor(view(), CANVAS_WIDTH, CANVAS_HEIGHT, dockOnly) + 0.002;
  if (fitted) {
    camera = fitCamera(view(), CANVAS_WIDTH, CANVAS_HEIGHT, insets);
  } else {
    camera = revealWorldRect(
      camera,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      {
        x: selection.x * grid.cellSize,
        y: selection.y * grid.cellSize,
        width: selection.width * grid.cellSize,
        height: selection.height * grid.cellSize,
      },
      insets,
    );
  }
  applyCamera();
}

function applyCamera() {
  camera = clampCamera(
    camera,
    view(),
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    cameraInsets(),
  );
  surfaceEl.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
  zoomEl.textContent = `${Math.round(camera.zoom * 100)}%`;
}

function fitToScreen() {
  camera = fitCamera(view(), CANVAS_WIDTH, CANVAS_HEIGHT, cameraInsets());
  applyCamera();
}

function isFitted(): boolean {
  return (
    camera.zoom <=
    minZoomFor(view(), CANVAS_WIDTH, CANVAS_HEIGHT, cameraInsets()) + 0.002
  );
}

function stopGlide() {
  if (glideFrame !== null) {
    cancelAnimationFrame(glideFrame);
    glideFrame = null;
  }
}

function startGlide() {
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < 0.08) {
    return;
  }
  const max = 1.6;
  let vx = speed > max ? (velocity.x * max) / speed : velocity.x;
  let vy = speed > max ? (velocity.y * max) / speed : velocity.y;
  let last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(64, now - last);
    last = now;
    const decay = Math.exp(-dt / 260);
    vx *= decay;
    vy *= decay;
    if (Math.hypot(vx, vy) < 0.02) {
      glideFrame = null;
      return;
    }
    const before = camera;
    camera = panCamera(
      camera,
      vx * dt,
      vy * dt,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
    if (camera.x === before.x && camera.y === before.y) {
      glideFrame = null;
      return;
    }
    glideFrame = requestAnimationFrame(step);
  };
  glideFrame = requestAnimationFrame(step);
}

function stopZoomAnim() {
  if (zoomFrame !== null) {
    cancelAnimationFrame(zoomFrame);
    zoomFrame = null;
  }
}

function animateZoom(
  targetFactor: number,
  pivotX: number,
  pivotY: number,
  duration = 180,
) {
  stopZoomAnim();
  stopGlide();
  const startZoom = camera.zoom;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    const desired = startZoom * Math.pow(targetFactor, ease);
    camera = zoomCamera(
      camera,
      desired / camera.zoom,
      pivotX,
      pivotY,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
    zoomFrame = t < 1 ? requestAnimationFrame(step) : null;
  };
  zoomFrame = requestAnimationFrame(step);
}

function syncCanvasSize() {
  const width = grid.cols * grid.cellSize;
  const height = grid.rows * grid.cellSize;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  surfaceEl.style.width = `${width}px`;
  surfaceEl.style.height = `${height}px`;
  surfaceEl.dataset.canvasSize = `${width}x${height}`;
}

function setStatus(message: string | null) {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
}

function setClaimMode(next: boolean) {
  claimMode = next;
  claimBtn.setAttribute("aria-pressed", String(next));
  viewportEl.classList.toggle("claim-mode", next);
  viewportEl.classList.toggle("pan-mode", !next);
  setStatus(null);
  if (next) {
    hideTip();
  } else {
    setSelection(null);
  }
}

function logoSrc(url: string, logoUrl: string | null): string {
  return logoUrl && logoUrl.length > 0 ? logoUrl : placeholderDataUrl(url);
}

function visitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && isVisitorId(existing)) {
      return existing;
    }
    const id = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function holdersFromGrid(): Holder[] {
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

function renderCounts(live: number, today: number) {
  const liveEl = document.getElementById("hud-live");
  const todayEl = document.getElementById("hud-today");
  if (liveEl) {
    liveEl.textContent = String(live);
  }
  if (todayEl) {
    todayEl.textContent = String(today);
  }
}

function focusHolder(holder: Holder) {
  userInteracted = true;
  camera = frameWorldRect(
    view(),
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    {
      x: holder.x * grid.cellSize,
      y: holder.y * grid.cellSize,
      width: holder.width * grid.cellSize,
      height: holder.height * grid.cellSize,
    },
    cameraInsets(),
  );
  applyCamera();
}

function renderHolders(holders: Holder[]) {
  const list = document.getElementById("hud-holders");
  if (!list) {
    return;
  }
  list.replaceChildren();
  if (holders.length === 0) {
    const empty = document.createElement("li");
    empty.className = "hud-empty";
    empty.textContent = "No holders yet";
    list.append(empty);
    return;
  }
  for (const holder of holders) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hud-holder";
    const img = document.createElement("img");
    img.alt = "";
    img.src = logoSrc(holder.url, holder.logoUrl);
    const host = document.createElement("span");
    host.className = "hud-host";
    host.textContent = holder.host;
    const squares = document.createElement("span");
    squares.className = "hud-squares";
    squares.textContent = String(holder.squares);
    button.append(img, host, squares);
    button.addEventListener("click", () => focusHolder(holder));
    item.append(button);
    list.append(item);
  }
}

async function syncPresence() {
  if (document.visibilityState === "hidden") {
    return;
  }
  try {
    const response = await fetch("/api/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ visitorId: visitorId() }),
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as {
      live?: number;
      today?: number;
      holders?: Holder[];
    };
    if (typeof data.live === "number" && typeof data.today === "number") {
      renderCounts(data.live, data.today);
    }
    if (Array.isArray(data.holders) && data.holders.length > 0) {
      renderHolders(data.holders);
    }
  } catch {
    // HUD stays on the last known local numbers.
  }
}

function startPresence() {
  renderCounts(1, 1);
  renderHolders(holdersFromGrid());
  void syncPresence();
  window.setInterval(() => {
    void syncPresence();
  }, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void syncPresence();
    }
  });
  const hud = document.getElementById("hud");
  const toggle = document.getElementById("hud-toggle");
  toggle?.addEventListener("click", () => {
    if (!hud) {
      return;
    }
    const open = hud.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    invalidateInsets();
    if (!userInteracted) {
      fitToScreen();
    }
  });
}

function ensureImage(src: string, fallbackUrl: string): HTMLImageElement {
  const cached = images.get(src);
  if (cached) {
    return cached;
  }
  const img = new Image();
  img.decoding = "async";
  img.onload = () => paint();
  img.onerror = () => {
    const fallback = placeholderDataUrl(fallbackUrl);
    if (img.src !== fallback) {
      img.src = fallback;
    }
  };
  img.src = src;
  images.set(src, img);
  return img;
}

function paint() {
  const { cellSize, cols, rows } = grid;
  const size = cols * cellSize;
  ctx.fillStyle = VACANT;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= cols; i++) {
    const p = i * cellSize + 0.5;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();
  ctx.strokeStyle = LINE_STRONG;
  ctx.beginPath();
  for (let i = 0; i <= cols; i += 10) {
    const p = i * cellSize + 0.5;
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();

  if (!claimRegions) {
    claimRegions = groupClaims(grid);
  }
  for (const region of claimRegions) {
    const src = logoSrc(region.occupant.url, region.occupant.logoUrl);
    const img = ensureImage(src, region.occupant.url);
    const bw = region.maxX - region.minX + 1;
    const bh = region.maxY - region.minY + 1;
    const ready = img.complete && img.naturalWidth > 0;
    for (const cell of region.cells) {
      const dx = cell.x * cellSize;
      const dy = cell.y * cellSize;
      if (ready) {
        const sx = ((cell.x - region.minX) / bw) * img.naturalWidth;
        const sy = ((cell.y - region.minY) / bh) * img.naturalHeight;
        const sw = img.naturalWidth / bw;
        const sh = img.naturalHeight / bh;
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, cellSize, cellSize);
      } else {
        ctx.fillStyle = "#111111";
        ctx.fillRect(dx, dy, cellSize, cellSize);
      }
    }
  }

  if (selection) {
    ctx.fillStyle = SELECT_FILL;
    ctx.strokeStyle = SELECT_STROKE;
    ctx.lineWidth = 2;
    const x = selection.x * cellSize;
    const y = selection.y * cellSize;
    ctx.fillRect(x, y, selection.width * cellSize, selection.height * cellSize);
    ctx.strokeRect(
      x + 1,
      y + 1,
      selection.width * cellSize - 2,
      selection.height * cellSize - 2,
    );
  }
}

function formatQuote(quote: Quote): string {
  if (!quote.claimable) {
    return "Taken. Pick empty squares.";
  }
  return `${quote.vacantCount} squares · $${quote.total}`;
}

function setSelection(rect: Rect | null, commit = true) {
  selection = rect
    ? clipRect(rect, grid.cols, grid.rows)
    : null;
  if (!selection) {
    liveQuote = null;
    claimAnchor = null;
    ticketEl.classList.remove("open");
    ticketEl.setAttribute("aria-hidden", "true");
    invalidateInsets();
    quoteLineEl.textContent = "No squares selected";
    submitBtn.disabled = true;
    paint();
    applyCamera();
    return;
  }
  liveQuote = quoteRegion(grid, selection);
  quoteLineEl.textContent = formatQuote(liveQuote);
  submitBtn.disabled = !liveQuote.claimable;
  paint();
  if (commit) {
    commitSelection();
  }
}

function commitSelection() {
  if (!selection) {
    return;
  }
  ticketEl.classList.add("open");
  ticketEl.setAttribute("aria-hidden", "false");
  invalidateInsets();
  keepSelectionOnScreen();
}

function localPoint(event: PointerEvent): { x: number; y: number } {
  const bounds = viewportEl.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function cellFromEvent(event: PointerEvent) {
  const point = localPoint(event);
  return screenToCell(
    camera,
    point.x,
    point.y,
    grid.cellSize,
    grid.cols,
    grid.rows,
  );
}

function hideTip() {
  inspectPinned = false;
  tipEl.hidden = true;
  tipEl.classList.remove("pinned");
  tipOpenEl.hidden = true;
  tipOpenEl.removeAttribute("href");
}

function placeTip(x: number, y: number) {
  const pad = 12;
  const maxX = window.innerWidth - tipEl.offsetWidth - pad;
  const maxY = window.innerHeight - tipEl.offsetHeight - pad;
  tipEl.style.left = `${Math.max(pad, Math.min(maxX, x + 14))}px`;
  tipEl.style.top = `${Math.max(pad, Math.min(maxY, y + 14))}px`;
}

function showHoverTip(text: string, x: number, y: number) {
  if (inspectPinned || claimMode) {
    return;
  }
  tipEl.hidden = false;
  tipEl.classList.remove("pinned");
  tipTextEl.textContent = text;
  tipOpenEl.hidden = true;
  placeTip(x, y);
}

function pinInspect(
  description: string,
  url: string,
  x: number,
  y: number,
) {
  inspectPinned = true;
  occupantLink.href = url;
  tipOpenEl.href = url;
  tipTextEl.textContent = description;
  tipOpenEl.hidden = false;
  tipEl.hidden = false;
  tipEl.classList.add("pinned");
  placeTip(x, y);
}

function describeCell(x: number, y: number): string | null {
  return lookupDescription(grid, x, y);
}

function clearLongPress() {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function pinchDistance(): number | null {
  if (pointers.size !== 2) {
    return null;
  }
  const [a, b] = [...pointers.values()];
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function pinchMid(): { x: number; y: number } | null {
  if (pointers.size !== 2) {
    return null;
  }
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function onPointerDown(event: PointerEvent) {
  try {
    viewportEl.setPointerCapture(event.pointerId);
  } catch {
    // The pointer may already be gone (fast tap) — keep handling the event.
  }
  userInteracted = true;
  stopGlide();
  stopZoomAnim();
  const point = localPoint(event);
  pointers.set(event.pointerId, point);

  if (pointers.size === 2) {
    clearLongPress();
    const distance = pinchDistance();
    const mid = pinchMid();
    if (distance && mid) {
      pinch = { distance, midX: mid.x, midY: mid.y };
      pinched = true;
    }
    if (claimMode && selection && !ticketEl.classList.contains("open")) {
      setSelection(null);
    }
    viewportEl.classList.add("panning");
    return;
  }

  moved = false;
  longPressFired = false;
  lastPoint = point;
  lastMoveTime = event.timeStamp;
  velocity = { x: 0, y: 0 };
  const cell = cellFromEvent(event);
  dragOrigin = cell
    ? { x: point.x, y: point.y, cellX: cell.x, cellY: cell.y }
    : { x: point.x, y: point.y, cellX: 0, cellY: 0 };

  const panNow = !claimMode || spacePan;
  viewportEl.classList.toggle("panning", panNow);

  if (cell) {
    const occupant = getCell(grid, cell.x, cell.y);
    if (occupant && !claimMode) {
      occupantLink.href = occupant.url;
      longPressTimer = window.setTimeout(() => {
        longPressFired = true;
        pinInspect(
          occupant.description,
          occupant.url,
          event.clientX,
          event.clientY,
        );
      }, LONG_PRESS_MS);
    }
  }
}

function onPointerMove(event: PointerEvent) {
  const point = localPoint(event);
  if (pointers.has(event.pointerId)) {
    pointers.set(event.pointerId, point);
  }

  if (pointers.size === 2 && pinch) {
    const distance = pinchDistance();
    const mid = pinchMid();
    if (distance && mid && pinch.distance > 0) {
      camera = zoomCamera(
        camera,
        distance / pinch.distance,
        mid.x,
        mid.y,
        view(),
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        cameraInsets(),
      );
      camera = panCamera(
        camera,
        mid.x - pinch.midX,
        mid.y - pinch.midY,
        view(),
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
        cameraInsets(),
      );
      pinch = { distance, midX: mid.x, midY: mid.y };
      applyCamera();
    }
    return;
  }

  const cell = cellFromEvent(event);
  if (cell) {
    coordEl.textContent = `${cell.x}, ${cell.y}`;
  } else {
    coordEl.textContent = "";
  }

  if (pointers.size === 0) {
    if (cell && !claimMode) {
      const text = describeCell(cell.x, cell.y);
      const occupant = getCell(grid, cell.x, cell.y);
      if (text && occupant) {
        occupantLink.href = occupant.url;
        showHoverTip(text, event.clientX, event.clientY);
      } else if (!inspectPinned) {
        hideTip();
      }
    } else if (!inspectPinned) {
      hideTip();
    }
    return;
  }

  if (!lastPoint || !dragOrigin) {
    return;
  }
  const dx = point.x - lastPoint.x;
  const dy = point.y - lastPoint.y;
  if (Math.hypot(point.x - dragOrigin.x, point.y - dragOrigin.y) > MOVE_THRESHOLD) {
    moved = true;
    clearLongPress();
  }

  if ((!claimMode || spacePan) && pointers.size === 1) {
    const dt = Math.max(1, event.timeStamp - lastMoveTime);
    velocity = {
      x: 0.8 * (dx / dt) + 0.2 * velocity.x,
      y: 0.8 * (dy / dt) + 0.2 * velocity.y,
    };
    lastMoveTime = event.timeStamp;
    camera = panCamera(
      camera,
      dx,
      dy,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
  } else if (claimMode && cell && !spacePan && moved) {
    if (!claimAnchor) {
      claimAnchor = { x: dragOrigin.cellX, y: dragOrigin.cellY };
    }
    setSelection(claimRectFromAnchor(claimAnchor, cell.x, cell.y), false);
  }

  lastPoint = point;
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId);
  clearLongPress();
  if (pointers.size < 2) {
    pinch = null;
  }
  if (pointers.size === 1) {
    const [rest] = pointers.values();
    lastPoint = { x: rest.x, y: rest.y };
    dragOrigin = { x: rest.x, y: rest.y, cellX: 0, cellY: 0 };
    lastMoveTime = event.timeStamp;
    velocity = { x: 0, y: 0 };
    moved = true;
    pinched = false;
    return;
  }
  if (pointers.size === 0) {
    viewportEl.classList.remove("panning");
    const cell = cellFromEvent(event);
    const point = localPoint(event);
    const tapped = !moved && !longPressFired && !spacePan && !pinched;
    if (cell && tapped) {
      if (claimMode) {
        if (!claimAnchor) {
          claimAnchor = { x: cell.x, y: cell.y };
        }
        setSelection(claimRectFromAnchor(claimAnchor, cell.x, cell.y));
      } else if (
        lastTap &&
        event.timeStamp - lastTap.time < 350 &&
        Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < 40
      ) {
        hideTip();
        animateZoom(2, point.x, point.y);
        lastTap = null;
      } else {
        lastTap = { time: event.timeStamp, x: point.x, y: point.y };
        const occupant = getCell(grid, cell.x, cell.y);
        if (occupant) {
          pinInspect(
            occupant.description,
            occupant.url,
            event.clientX,
            event.clientY,
          );
        } else {
          hideTip();
        }
      }
    } else if (
      claimMode &&
      selection &&
      moved &&
      !spacePan &&
      !ticketEl.classList.contains("open")
    ) {
      commitSelection();
    } else if (
      moved &&
      (!claimMode || spacePan) &&
      !pinched &&
      event.timeStamp - lastMoveTime < 100
    ) {
      startGlide();
    }
    pinched = false;
    dragOrigin = null;
    lastPoint = null;
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  userInteracted = true;
  stopGlide();
  stopZoomAnim();
  const bounds = viewportEl.getBoundingClientRect();
  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  const factor = Math.min(2, Math.max(0.5, Math.exp(-delta * 0.0022)));
  camera = zoomCamera(
    camera,
    factor,
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    view(),
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    cameraInsets(),
  );
  applyCamera();
}

async function loadGrid() {
  const initial = window.__PIXELREST_GRID__;
  if (initial && Array.isArray(initial.occupied)) {
    grid = gridFromOccupied(initial);
    claimRegions = null;
    syncCanvasSize();
    paint();
    return;
  }
  const response = await fetch(`/api/grid?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    setStatus("Could not load the board.");
    return;
  }
  const data = (await response.json()) as {
    cols: number;
    rows: number;
    cellSize: number;
    occupied: Array<{
      x: number;
      y: number;
      claimId: string;
      url: string;
      description: string;
      logoUrl: string | null;
    }>;
  };
  grid = gridFromOccupied(data);
  claimRegions = null;
  syncCanvasSize();
  paint();
}

function showError(message: string | null) {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selection || !liveQuote?.claimable) {
    showError("Select empty squares.");
    return;
  }
  showError(null);
  submitBtn.disabled = true;
  setStatus("Opening checkout…");
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x: selection.x,
        y: selection.y,
        width: selection.width,
        height: selection.height,
        url: urlEl.value,
        description: descriptionEl.value,
      }),
    });
    const data = (await response.json()) as {
      error?: string;
      checkoutUrl?: string;
    };
    if (!response.ok || !data.checkoutUrl) {
      showError(data.error ?? "Checkout failed.");
      return;
    }
    window.location.href = data.checkoutUrl;
  } catch {
    showError("Network error. Try again.");
  } finally {
    submitBtn.disabled = false;
  }
});

claimBtn.addEventListener("click", () => setClaimMode(!claimMode));
document.getElementById("zoom-in")?.addEventListener("click", () => {
  userInteracted = true;
  animateZoom(1.4, view().width / 2, view().height / 2);
});
document.getElementById("zoom-out")?.addEventListener("click", () => {
  userInteracted = true;
  animateZoom(1 / 1.4, view().width / 2, view().height / 2);
});
document.getElementById("zoom-fit")?.addEventListener("click", () => {
  userInteracted = true;
  stopGlide();
  stopZoomAnim();
  fitToScreen();
});
document.getElementById("ticket-close")?.addEventListener("click", () => {
  setSelection(null);
});

viewportEl.addEventListener("pointerdown", onPointerDown);
viewportEl.addEventListener("pointermove", onPointerMove);
viewportEl.addEventListener("pointerup", onPointerUp);
viewportEl.addEventListener("pointercancel", onPointerUp);
viewportEl.addEventListener("wheel", onWheel, { passive: false });
viewportEl.addEventListener("contextmenu", (event) => event.preventDefault());
viewportEl.addEventListener("pointerleave", () => {
  if (pointers.size === 0 && !inspectPinned) {
    hideTip();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    spacePan = true;
    viewportEl.classList.add("pan-mode");
    viewportEl.classList.remove("claim-mode");
  }
  if (event.key === "Escape") {
    setSelection(null);
    hideTip();
  }
  const step = 48;
  if (event.key === "ArrowLeft") {
    camera = panCamera(
      camera,
      step,
      0,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
  }
  if (event.key === "ArrowRight") {
    camera = panCamera(
      camera,
      -step,
      0,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
  }
  if (event.key === "ArrowUp") {
    camera = panCamera(
      camera,
      0,
      step,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
  }
  if (event.key === "ArrowDown") {
    camera = panCamera(
      camera,
      0,
      -step,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
  }
  if (event.key === "+" || event.key === "=") {
    camera = zoomCamera(
      camera,
      1.15,
      view().width / 2,
      view().height / 2,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
  }
  if (event.key === "-" || event.key === "_") {
    camera = zoomCamera(
      camera,
      0.87,
      view().width / 2,
      view().height / 2,
      view(),
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
      cameraInsets(),
    );
    applyCamera();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    spacePan = false;
    viewportEl.classList.toggle("pan-mode", !claimMode);
    viewportEl.classList.toggle("claim-mode", claimMode);
  }
});

function onViewportChange() {
  invalidateInsets();
  if (isFitted()) {
    fitToScreen();
    return;
  }
  applyCamera();
}

window.addEventListener("resize", onViewportChange);
window.visualViewport?.addEventListener("resize", onViewportChange);

window.__lastResort = {
  quoteRegion,
  applyClaim,
  lookupDescription,
  panCamera,
  zoomCamera,
  resolveLogoFromHtml,
  rectFromPoints,
  tapCellSelection,
  getState: () => ({
    grid,
    camera,
    selection,
    canvasSize: CANVAS_WIDTH,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    claimMode,
  }),
};

setClaimMode(false);
paint();
await loadGrid();
startPresence();
fitToScreen();
for (const ms of [0, 50, 150, 400, 1000]) {
  window.setTimeout(() => {
    if (!userInteracted) {
      invalidateInsets();
      fitToScreen();
    }
  }, ms);
}
viewportEl.addEventListener(
  "touchmove",
  (event) => {
    if (claimMode && event.touches.length === 1) {
      event.preventDefault();
    }
  },
  { passive: false },
);

declare global {
  interface Window {
    __lastResort: {
      quoteRegion: typeof quoteRegion;
      applyClaim: typeof applyClaim;
      lookupDescription: typeof lookupDescription;
      panCamera: typeof panCamera;
      zoomCamera: typeof zoomCamera;
      resolveLogoFromHtml: typeof resolveLogoFromHtml;
      rectFromPoints: typeof rectFromPoints;
      tapCellSelection: typeof tapCellSelection;
      getState: () => {
        grid: GridState;
        camera: Camera;
        selection: Rect | null;
        canvasSize: number;
        canvasWidth: number;
        canvasHeight: number;
        claimMode: boolean;
      };
    };
    __PIXELREST_GRID__?: {
      cols: number;
      rows: number;
      cellSize: number;
      occupied: Array<{
        x: number;
        y: number;
        claimId: string;
        url: string;
        description: string;
        logoUrl: string | null;
      }>;
    };
  }
}
