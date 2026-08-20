import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { createElement } from "react";
import sharp from "sharp";
import {
  DEFAULT_COLS,
  groupClaims,
  type GridState,
} from "./board";
import { placeholderRgb } from "./placeholder";

export const X_POST_WIDTH = 1200;
export const X_POST_HEIGHT = 675;
export const BOARD_CELL_PX = 2;
export const BOARD_PX = DEFAULT_COLS * BOARD_CELL_PX;
const VOID = { r: 10, g: 10, b: 10, a: 255 };
const LINE = { r: 128, g: 128, b: 128, a: 255 };
const FRAME = { r: 234, g: 234, b: 234, a: 255 };
const NEW_MARK = { r: 234, g: 234, b: 234, a: 255 };

export function boardOrigin(): { x: number; y: number } {
  return {
    x: Math.floor((X_POST_WIDTH - BOARD_PX) / 2),
    y: Math.floor((X_POST_HEIGHT - BOARD_PX) / 2),
  };
}

export async function renderBoardImage(options: {
  grid: GridState;
  newClaimIds: string[];
  title: string;
  dateLabel: string;
  footer: string;
}): Promise<Buffer> {
  const board = await paintBoard(options.grid, new Set(options.newClaimIds));
  const origin = boardOrigin();
  const font = await readFile(
    join(process.cwd(), "src/lib/fonts/IBMPlexMono-Regular.ttf"),
  );
  const image = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: X_POST_WIDTH,
          height: X_POST_HEIGHT,
          display: "flex",
          backgroundColor: "#0a0a0a",
          color: "#eaeaea",
          fontFamily: "Plex",
          position: "relative",
        },
      },
      createElement("img", {
        src: `data:image/png;base64,${board.toString("base64")}`,
        width: BOARD_PX,
        height: BOARD_PX,
        style: {
          position: "absolute",
          left: origin.x,
          top: origin.y,
        },
      }),
      createElement(
        "div",
        {
          style: {
            position: "absolute",
            left: 24,
            top: 16,
            display: "flex",
            flexDirection: "column",
            fontSize: 14,
            letterSpacing: 1,
          },
        },
        createElement("div", null, options.title),
        createElement(
          "div",
          { style: { marginTop: 8, color: "#8a8a8a", fontSize: 12 } },
          options.dateLabel,
        ),
      ),
      createElement(
        "div",
        {
          style: {
            position: "absolute",
            bottom: 12,
            left: 0,
            width: "100%",
            display: "flex",
            justifyContent: "center",
            color: "#8a8a8a",
            fontSize: 12,
          },
        },
        options.footer,
      ),
    ),
    {
      width: X_POST_WIDTH,
      height: X_POST_HEIGHT,
      fonts: [
        {
          name: "Plex",
          data: font,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
  return Buffer.from(await image.arrayBuffer());
}

async function paintBoard(grid: GridState, newClaimIds: Set<string>): Promise<Buffer> {
  const size = BOARD_PX;
  const buf = Buffer.alloc(size * size * 4);
  fillRect(buf, size, 0, 0, size, size, VOID);
  for (let i = 0; i <= DEFAULT_COLS; i += 10) {
    const p = i * BOARD_CELL_PX;
    fillRect(buf, size, p, 0, 1, size, LINE);
    fillRect(buf, size, 0, p, size, 1, LINE);
  }
  fillRect(buf, size, 0, 0, size, 1, FRAME);
  fillRect(buf, size, 0, 0, 1, size, FRAME);
  fillRect(buf, size, size - 1, 0, 1, size, FRAME);
  fillRect(buf, size, 0, size - 1, size, 1, FRAME);

  const regions = groupClaims(grid);
  const logos = await Promise.all(
    regions.map(async (region) => {
      const width = (region.maxX - region.minX + 1) * BOARD_CELL_PX;
      const height = (region.maxY - region.minY + 1) * BOARD_CELL_PX;
      const pixels = region.occupant.logoUrl
        ? await logoPixels(region.occupant.logoUrl, width, height)
        : null;
      return { region, width, height, pixels };
    }),
  );

  for (const { region, width, height, pixels } of logos) {
    const dx = region.minX * BOARD_CELL_PX;
    const dy = region.minY * BOARD_CELL_PX;
    if (pixels) {
      blit(buf, size, pixels, width, height, dx, dy);
    } else {
      fillRect(buf, size, dx, dy, width, height, {
        ...placeholderRgb(region.occupant.url),
        a: 255,
      });
    }
    if (newClaimIds.has(region.claimId)) {
      strokeRect(buf, size, dx, dy, width, height, NEW_MARK);
    }
  }
  return sharp(buf, {
    raw: { width: size, height: size, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function logoPixels(
  url: string,
  width: number,
  height: number,
): Promise<Buffer | null> {
  if (width < 1 || height < 1) {
    return null;
  }
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      redirect: "follow",
    });
    if (!response.ok) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength < 16 || bytes.byteLength > 2_000_000) {
      return null;
    }
    return await sharp(bytes)
      .resize(width, height, { fit: "cover" })
      .ensureAlpha()
      .raw()
      .toBuffer();
  } catch {
    return null;
  }
}

function blit(
  dest: Buffer,
  destSize: number,
  src: Buffer,
  width: number,
  height: number,
  dx: number,
  dy: number,
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      setPx(dest, destSize, dx + x, dy + y, {
        r: src[si] ?? 0,
        g: src[si + 1] ?? 0,
        b: src[si + 2] ?? 0,
        a: src[si + 3] ?? 255,
      });
    }
  }
}

function fillRect(
  buf: Buffer,
  size: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  const x1 = Math.min(size, x + width);
  const y1 = Math.min(size, y + height);
  for (let py = Math.max(0, y); py < y1; py++) {
    for (let px = Math.max(0, x); px < x1; px++) {
      setPx(buf, size, px, py, color);
    }
  }
}

function strokeRect(
  buf: Buffer,
  size: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  fillRect(buf, size, x, y, width, 1, color);
  fillRect(buf, size, x, y + height - 1, width, 1, color);
  fillRect(buf, size, x, y, 1, height, color);
  fillRect(buf, size, x + width - 1, y, 1, height, color);
}

function setPx(
  buf: Buffer,
  size: number,
  x: number,
  y: number,
  color: { r: number; g: number; b: number; a: number },
): void {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return;
  }
  const i = (y * size + x) * 4;
  buf[i] = color.r;
  buf[i + 1] = color.g;
  buf[i + 2] = color.b;
  buf[i + 3] = color.a;
}


