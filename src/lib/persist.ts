import {
  createGrid,
  gridFromOccupied,
  occupiedList,
  type GridState,
} from "./board";

export interface GridSnapshot {
  cols: number;
  rows: number;
  cellSize: number;
  canvasSize: number;
  canvasWidth: number;
  canvasHeight: number;
  occupied: ReturnType<typeof occupiedList>;
}

export function snapshot(grid: GridState): GridSnapshot {
  const canvasWidth = grid.cols * grid.cellSize;
  const canvasHeight = grid.rows * grid.cellSize;
  return {
    cols: grid.cols,
    rows: grid.rows,
    cellSize: grid.cellSize,
    canvasSize: canvasWidth,
    canvasWidth,
    canvasHeight,
    occupied: occupiedList(grid),
  };
}

export function serializeGrid(grid: GridState): string {
  return JSON.stringify(snapshot(grid), null, 2);
}

export function deserializeGrid(json: string): GridState {
  const data = JSON.parse(json) as Partial<GridSnapshot>;
  if (!data || typeof data !== "object") {
    return createGrid();
  }
  return gridFromOccupied({
    cols: data.cols,
    rows: data.rows,
    cellSize: data.cellSize,
    occupied: Array.isArray(data.occupied) ? data.occupied : [],
  });
}
