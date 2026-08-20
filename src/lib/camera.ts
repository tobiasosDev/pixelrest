export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface CameraInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: CameraInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export function contentBox(
  viewport: Viewport,
  insets: CameraInsets = ZERO_INSETS,
): { x: number; y: number; width: number; height: number } {
  const left = Math.max(0, insets.left);
  const right = Math.max(0, insets.right);
  const top = Math.max(0, insets.top);
  const bottom = Math.max(0, insets.bottom);
  return {
    x: left,
    y: top,
    width: Math.max(1, viewport.width - left - right),
    height: Math.max(1, viewport.height - top - bottom),
  };
}

export const MAX_ZOOM = 8;

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}

export function minZoomFor(
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
  insets: CameraInsets = ZERO_INSETS,
): number {
  if (boardWidth <= 0 || boardHeight <= 0) {
    return 1;
  }
  const box = contentBox(viewport, insets);
  const fit = Math.min(box.width / boardWidth, box.height / boardHeight);
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
  insets: CameraInsets = ZERO_INSETS,
): Camera {
  const minZoom = minZoomFor(viewport, boardWidth, boardHeight, insets);
  const zoom = Math.min(MAX_ZOOM, Math.max(minZoom, camera.zoom));
  const scaledW = boardWidth * zoom;
  const scaledH = boardHeight * zoom;
  const box = contentBox(viewport, insets);

  let x = camera.x;
  let y = camera.y;

  if (scaledW <= box.width) {
    x = box.x + (box.width - scaledW) / 2;
  } else {
    const minX = box.x + box.width - scaledW;
    x = Math.min(box.x, Math.max(minX, x));
  }

  if (scaledH <= box.height) {
    y = box.y + (box.height - scaledH) / 2;
  } else {
    const minY = box.y + box.height - scaledH;
    y = Math.min(box.y, Math.max(minY, y));
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
  insets: CameraInsets = ZERO_INSETS,
): Camera {
  return clampCamera(
    { x: camera.x + dx, y: camera.y + dy, zoom: camera.zoom },
    viewport,
    boardWidth,
    boardHeight,
    insets,
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
  insets: CameraInsets = ZERO_INSETS,
): Camera {
  const minZoom = minZoomFor(viewport, boardWidth, boardHeight, insets);
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
    insets,
  );
}

export function revealWorldRect(
  camera: Camera,
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number,
  world: { x: number; y: number; width: number; height: number },
  insets: CameraInsets = ZERO_INSETS,
  margin = 12,
): Camera {
  const box = contentBox(viewport, insets);
  const zoom = Math.max(camera.zoom, 0.0001);
  const inner = {
    x: box.x + margin,
    y: box.y + margin,
    width: Math.max(1, box.width - margin * 2),
    height: Math.max(1, box.height - margin * 2),
  };
  const left = camera.x + world.x * zoom;
  const top = camera.y + world.y * zoom;
  const width = world.width * zoom;
  const height = world.height * zoom;
  const right = left + width;
  const bottom = top + height;
  let x = camera.x;
  let y = camera.y;

  if (width >= inner.width) {
    x += inner.x - left;
  } else {
    if (left < inner.x) {
      x += inner.x - left;
    } else if (right > inner.x + inner.width) {
      x += inner.x + inner.width - right;
    }
  }

  if (height >= inner.height) {
    y += inner.y - top;
  } else {
    if (top < inner.y) {
      y += inner.y - top;
    } else if (bottom > inner.y + inner.height) {
      y += inner.y + inner.height - bottom;
    }
  }

  return clampCamera(
    { x, y, zoom: camera.zoom },
    viewport,
    boardWidth,
    boardHeight,
    insets,
  );
}

export function fitCamera(
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
  insets: CameraInsets = ZERO_INSETS,
): Camera {
  const zoom = minZoomFor(viewport, boardWidth, boardHeight, insets);
  return clampCamera(
    { x: 0, y: 0, zoom },
    viewport,
    boardWidth,
    boardHeight,
    insets,
  );
}

export function initialCamera(
  viewport: Viewport,
  boardWidth: number,
  boardHeight: number = boardWidth,
  insets: CameraInsets = ZERO_INSETS,
): Camera {
  if (viewport.width < 720) {
    return clampCamera(
      createCamera(),
      viewport,
      boardWidth,
      boardHeight,
      insets,
    );
  }
  return fitCamera(viewport, boardWidth, boardHeight, insets);
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
