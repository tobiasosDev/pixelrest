export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const MAX_ZOOM = 8;

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}

export function minZoomFor(
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
): number {
  if (boardWidth <= 0 || boardHeight <= 0) {
    return 1;
  }
  const fit = Math.min(
    viewport.width / boardWidth,
    viewport.height / boardHeight,
  );
  return Math.min(1, Math.max(0.02, fit));
}

export function gridIsReachable(
  camera: Camera,
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
): boolean {
  if (camera.zoom <= 0 || boardWidth <= 0 || boardHeight <= 0) {
    return false;
  }
  const left = camera.x;
  const top = camera.y;
  const right = camera.x + boardWidth * camera.zoom;
  const bottom = camera.y + boardHeight * camera.zoom;
  return right > 0 && left < viewport.width && bottom > 0 && top < viewport.height;
}

export function clampCamera(
  camera: Camera,
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
): Camera {
  const minZoom = minZoomFor(viewport, boardWidth, boardHeight);
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, camera.zoom));
  const scaledW = boardWidth * zoom;
  const scaledH = boardHeight * zoom;

  let x = camera.x;
  let y = camera.y;

  if (scaledW <= viewport.width) {
    x = (viewport.width - scaledW) / 2;
  } else {
    const minX = viewport.width - scaledW;
    x = Math.min(0, Math.max(minX, x));
  }

  if (scaledH <= viewport.height) {
    y = (viewport.height - scaledH) / 2;
  } else {
    const minY = viewport.height - scaledH;
    y = Math.min(0, Math.max(minY, y));
  }

  return { x, y, zoom };
}

export function panCamera(
  camera: Camera,
  dx: number,
  dy: number,
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
): Camera {
  return clampCamera(
    { x: camera.x + dx, y: camera.y + dy, zoom: camera.zoom },
    viewport,
    boardWidth,
    boardHeight,
  );
}

export function zoomCamera(
  camera: Camera,
  factor: number,
  pivotX: number,
  pivotY: number,
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
): Camera {
  const minZoom = minZoomFor(viewport, boardWidth, boardHeight);
  const nextZoom = Math.min(
    MAX_ZOOM,
    Math.max(minZoom, camera.zoom * factor),
  );
  const worldX = (pivotX - camera.x) / camera.zoom;
  const worldY = (pivotY - camera.y) / camera.zoom;
  return clampCamera(
    {
      x: pivotX - worldX * nextZoom,
      y: pivotY - worldY * nextZoom,
      zoom: nextZoom,
    },
    viewport,
    boardWidth,
    boardHeight,
  );
}

export function initialCamera(
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
): Camera {
  if (viewport.width < 720) {
    return clampCamera(createCamera(), viewport, boardWidth, boardHeight);
  }
  const fit = Math.min(
    viewport.width / boardWidth,
    viewport.height / boardHeight,
    1,
  );
  return clampCamera({ x: 0, y: 0, zoom: fit }, viewport, boardWidth, boardHeight);
}

export function screenToCell(
  camera: Camera,
  screenX: number,
  screenY: number,
  cellSize: number,
  cols: number,
  rows: number,
): { x: number; y: number } | null {
  const worldX = (screenX - camera.x) / camera.zoom;
  const worldY = (screenY - camera.y) / camera.zoom;
  const x = Math.floor(worldX / cellSize);
  const y = Math.floor(worldY / cellSize);
  if (x < 0 || y < 0 || x >= cols || y >= rows) {
    return null;
  }
  return { x, y };
}
