export const VACANT_PRICE = 10;

export const DEFAULT_COLS = 320;
export const DEFAULT_ROWS = 320;
export const DEFAULT_CELL_SIZE = 10;
export const CANVAS_WIDTH = DEFAULT_COLS * DEFAULT_CELL_SIZE;
export const CANVAS_HEIGHT = DEFAULT_ROWS * DEFAULT_CELL_SIZE;
export const BOARD_SQUARES = DEFAULT_COLS * DEFAULT_ROWS;
export const BOARD_VALUE = BOARD_SQUARES * VACANT_PRICE;

export interface Occupant {
  claimId: string;
  url: string;
  description: string;
  logoUrl: string | null;
}

export interface GridState {
  cols: number;
  rows: number;
  cellSize: number;
  cells: Array<Occupant | null>;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Quote {
  vacantCount: number;
  occupiedCount: number;
  cellCount: number;
  total: number;
  claimable: boolean;
}

export function createGrid(options?: {
  cols?: number;
  rows?: number;
  cellSize?: number;
}): GridState {
  const cols = options?.cols ?? DEFAULT_COLS;
  const rows = options?.rows ?? DEFAULT_ROWS;
  const cellSize = options?.cellSize ?? DEFAULT_CELL_SIZE;
  return {
    cols,
    rows,
    cellSize,
    cells: Array.from({ length: cols * rows }, () => null),
  };
}

export function cellIndex(grid: GridState, x: number, y: number): number {
  return y * grid.cols + x;
}

export function getCell(
  grid: GridState,
  x: number,
  y: number,
): Occupant | null {
  if (x < 0 || y < 0 || x >= grid.cols || y >= grid.rows) {
    return null;
  }
  return grid.cells[cellIndex(grid, x, y)] ?? null;
}

export function rectFromPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Rect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return {
    x,
    y,
    width: Math.abs(x1 - x0) + 1,
    height: Math.abs(y1 - y0) + 1,
  };
}

export function claimRectFromAnchor(
  anchor: { x: number; y: number } | null,
  cellX: number,
  cellY: number,
): Rect {
  if (!anchor) {
    return { x: cellX, y: cellY, width: 1, height: 1 };
  }
  return rectFromPoints(anchor.x, anchor.y, cellX, cellY);
}

export function cellInRect(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    y >= rect.y &&
    x < rect.x + rect.width &&
    y < rect.y + rect.height
  );
}

export function cellTouchesRect(rect: Rect, x: number, y: number): boolean {
  if (cellInRect(rect, x, y)) {
    return false;
  }
  const inRow = y >= rect.y && y < rect.y + rect.height;
  const inCol = x >= rect.x && x < rect.x + rect.width;
  const horizontal = inRow && (x === rect.x - 1 || x === rect.x + rect.width);
  const vertical = inCol && (y === rect.y - 1 || y === rect.y + rect.height);
  return horizontal || vertical;
}

export function tapCellSelection(
  rect: Rect | null,
  x: number,
  y: number,
): Rect | null {
  if (!rect) {
    return { x, y, width: 1, height: 1 };
  }
  if (cellInRect(rect, x, y)) {
    if (rect.width === 1 && rect.height === 1) {
      return null;
    }
    return rect;
  }
  if (!cellTouchesRect(rect, x, y)) {
    return rect;
  }
  return rectFromPoints(
    Math.min(rect.x, x),
    Math.min(rect.y, y),
    Math.max(rect.x + rect.width - 1, x),
    Math.max(rect.y + rect.height - 1, y),
  );
}

export function clipRect(rect: Rect, cols: number, rows: number): Rect | null {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const right = Math.min(cols, rect.x + rect.width);
  const bottom = Math.min(rows, rect.y + rect.height);
  const width = right - x;
  const height = bottom - y;
  if (width < 1 || height < 1) {
    return null;
  }
  return { x, y, width, height };
}

export function listCellsInRect(rect: Rect): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

export function quoteRegion(grid: GridState, rect: Rect): Quote {
  const clipped = clipRect(rect, grid.cols, grid.rows);
  if (!clipped) {
    return {
      vacantCount: 0,
      occupiedCount: 0,
      cellCount: 0,
      total: 0,
      claimable: false,
    };
  }
  let vacantCount = 0;
  let occupiedCount = 0;
  for (const { x, y } of listCellsInRect(clipped)) {
    if (getCell(grid, x, y)) {
      occupiedCount += 1;
    } else {
      vacantCount += 1;
    }
  }
  const claimable = occupiedCount === 0 && vacantCount > 0;
  return {
    vacantCount,
    occupiedCount,
    cellCount: vacantCount + occupiedCount,
    total: claimable ? vacantCount * VACANT_PRICE : 0,
    claimable,
  };
}

export function applyClaim(
  grid: GridState,
  rect: Rect,
  occupant: Occupant,
): GridState {
  const clipped = clipRect(rect, grid.cols, grid.rows);
  if (!clipped) {
    return grid;
  }
  if (quoteRegion(grid, clipped).occupiedCount > 0) {
    return grid;
  }
  const cells = grid.cells.slice();
  for (const { x, y } of listCellsInRect(clipped)) {
    cells[cellIndex(grid, x, y)] = { ...occupant };
  }
  return { ...grid, cells };
}

export function lookupDescription(
  grid: GridState,
  x: number,
  y: number,
): string | null {
  return getCell(grid, x, y)?.description ?? null;
}

export interface ClaimRegion {
  claimId: string;
  occupant: Occupant;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cells: Array<{ x: number; y: number }>;
}

export function groupClaims(grid: GridState): ClaimRegion[] {
  const map = new Map<string, ClaimRegion>();
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = getCell(grid, x, y);
      if (!cell) {
        continue;
      }
      const existing = map.get(cell.claimId);
      if (!existing) {
        map.set(cell.claimId, {
          claimId: cell.claimId,
          occupant: cell,
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          cells: [{ x, y }],
        });
        continue;
      }
      existing.minX = Math.min(existing.minX, x);
      existing.minY = Math.min(existing.minY, y);
      existing.maxX = Math.max(existing.maxX, x);
      existing.maxY = Math.max(existing.maxY, y);
      existing.cells.push({ x, y });
    }
  }
  return [...map.values()];
}

export function occupiedList(grid: GridState): Array<
  Occupant & { x: number; y: number }
> {
  const list: Array<Occupant & { x: number; y: number }> = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      const cell = getCell(grid, x, y);
      if (cell) {
        list.push({ ...cell, x, y });
      }
    }
  }
  return list;
}

export function gridFromOccupied(options: {
  cols?: number;
  rows?: number;
  cellSize?: number;
  occupied: Array<Occupant & { x: number; y: number }>;
}): GridState {
  const grid = createGrid(options);
  const cells = grid.cells.slice();
  for (const item of options.occupied) {
    if (
      item.x < 0 ||
      item.y < 0 ||
      item.x >= grid.cols ||
      item.y >= grid.rows
    ) {
      continue;
    }
    cells[cellIndex(grid, item.x, item.y)] = {
      claimId: item.claimId,
      url: item.url,
      description: item.description,
      logoUrl: item.logoUrl,
    };
  }
  return { ...grid, cells };
}
