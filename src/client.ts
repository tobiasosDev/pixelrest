import {
  applyClaim,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  cellInRect,
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
  fitCamera,
  initialCamera,
  panCamera,
  screenToCell,
  zoomCamera,
  type Camera,
  type CameraInsets,
  type Viewport,
} from "./lib/camera";
import { resolveLogoFromHtml } from "./lib/logo";
import { placeholderDataUrl } from "./lib/placeholder";

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 8;
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
let camera: Camera = initialCamera(
  { width: 800, height: 600 },
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
);
let claimRegions: ReturnType<typeof groupClaims> | null = null;
let claimMode = false;
let selection: Rect | null = null;
let liveQuote: Quote | null = null;
let spacePan = false;
let inspectPinned = false;

const images = new Map<string, HTMLImageElement>();
const pointers = new Map<number, { x: number; y: number }>();
let dragOrigin: { x: number; y: number; cellX: number; cellY: number } | null =
  null;
let lastPoint: { x: number; y: number } | null = null;
let moved = false;
let dragIsTouch = false;
let longPressTimer: number | null = null;
let longPressFired = false;
let pinch:
  | { distance: number; zoom: number; midX: number; midY: number }
  | null = null;

function view(): Viewport {
  return {
    width: Math.max(1, viewportEl.clientWidth),
    height: Math.max(1, viewportEl.clientHeight),
  };
}

function cameraInsets(): CameraInsets {
  const dock = document.querySelector(".dock") as HTMLElement | null;
  const mark = document.querySelector(".mark") as HTMLElement | null;
  const side = 24;
  const top = mark
    ? Math.round(mark.getBoundingClientRect().bottom) + 16
    : 48;
  const bottom =
    Math.round(dock?.getBoundingClientRect().height ?? 56) + 24;
  return { top, right: side, bottom, left: side };
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
  for (let i = 0; i <= cols; i++) {
    const p = i * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.strokeStyle = LINE_STRONG;
  for (let i = 0; i <= cols; i += 10) {
    const p = i * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

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

function setSelection(rect: Rect | null) {
  selection = rect
    ? clipRect(rect, grid.cols, grid.rows)
    : null;
  if (!selection) {
    liveQuote = null;
    ticketEl.classList.remove("open");
    ticketEl.setAttribute("aria-hidden", "true");
    quoteLineEl.textContent = "No squares selected";
    submitBtn.disabled = true;
    paint();
    return;
  }
  liveQuote = quoteRegion(grid, selection);
  quoteLineEl.textContent = formatQuote(liveQuote);
  submitBtn.disabled = !liveQuote.claimable;
  ticketEl.classList.add("open");
  ticketEl.setAttribute("aria-hidden", "false");
  paint();
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
  viewportEl.setPointerCapture(event.pointerId);
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  moved = false;
  longPressFired = false;
  dragIsTouch = event.pointerType === "touch" || view().width < 720;
  lastPoint = point;
  const cell = cellFromEvent(event);
  dragOrigin = cell
    ? { x: point.x, y: point.y, cellX: cell.x, cellY: cell.y }
    : { x: point.x, y: point.y, cellX: 0, cellY: 0 };

  if (pointers.size === 2) {
    clearLongPress();
    const distance = pinchDistance();
    const mid = pinchMid();
    if (distance && mid) {
      pinch = { distance, zoom: camera.zoom, midX: mid.x, midY: mid.y };
    }
    viewportEl.classList.add("panning");
    return;
  }

  const panNow = !claimMode || spacePan || dragIsTouch;
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
      const factor = distance / pinch.distance;
      camera = zoomCamera(
        { ...camera, zoom: pinch.zoom },
        factor,
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
      pinch = { ...pinch, midX: mid.x, midY: mid.y };
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

  if ((!claimMode || spacePan || dragIsTouch) && pointers.size === 1) {
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
  } else if (claimMode && cell && !spacePan && !dragIsTouch) {
    setSelection(rectFromPoints(dragOrigin.cellX, dragOrigin.cellY, cell.x, cell.y));
  }

  lastPoint = point;
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId);
  clearLongPress();
  if (pointers.size < 2) {
    pinch = null;
  }
  if (pointers.size === 0) {
    viewportEl.classList.remove("panning");
    const cell = cellFromEvent(event);
    if (cell && !moved && !longPressFired && !spacePan) {
      if (claimMode) {
        const previous = selection;
        const next = tapCellSelection(previous, cell.x, cell.y);
        setSelection(next);
        if (
          previous &&
          next === previous &&
          !cellInRect(previous, cell.x, cell.y)
        ) {
          setStatus("Neighboring squares only.");
        }
      } else {
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
    }
    dragOrigin = null;
    lastPoint = null;
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const bounds = viewportEl.getBoundingClientRect();
  const factor = event.deltaY > 0 ? 0.9 : 1.1;
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
  const response = await fetch("/api/grid");
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
  camera = zoomCamera(
    camera,
    1.2,
    view().width / 2,
    view().height / 2,
    view(),
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    cameraInsets(),
  );
  applyCamera();
});
document.getElementById("zoom-out")?.addEventListener("click", () => {
  camera = zoomCamera(
    camera,
    0.8,
    view().width / 2,
    view().height / 2,
    view(),
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    cameraInsets(),
  );
  applyCamera();
});
document.getElementById("zoom-fit")?.addEventListener("click", () => {
  camera = fitCamera(view(), CANVAS_WIDTH, CANVAS_HEIGHT, cameraInsets());
  applyCamera();
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

window.addEventListener("resize", () => applyCamera());

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
camera = initialCamera(view(), CANVAS_WIDTH, CANVAS_HEIGHT, cameraInsets());
applyCamera();
paint();
await loadGrid();
applyCamera();

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
