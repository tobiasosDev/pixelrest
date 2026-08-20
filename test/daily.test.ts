import { describe, expect, test } from "bun:test";
import {
  BOARD_SQUARES,
  applyClaim,
  createGrid,
} from "../src/lib/board";
import {
  X_POST_HEIGHT,
  X_POST_WIDTH,
  boardOrigin,
  renderBoardImage,
} from "../src/lib/board-image";
import {
  buildDailyReport,
  type StoredClaim,
} from "../src/lib/daily-report";

function claim(partial: Partial<StoredClaim> & Pick<StoredClaim, "id" | "url">): StoredClaim {
  return {
    description: "An app",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    logoUrl: null,
    createdAt: "2026-08-20T10:00:00.000Z",
    ...partial,
  };
}

describe("daily report", () => {
  test("lists apps that arrived on the Zurich calendar day", () => {
    const report = buildDailyReport({
      claims: [
        claim({
          id: "a",
          url: "https://tecminds.ch",
          width: 2,
          height: 2,
          createdAt: "2026-08-20T07:00:00.000Z",
        }),
        claim({
          id: "b",
          url: "https://www.example.com/app",
          createdAt: "2026-08-19T10:00:00.000Z",
        }),
      ],
      occupiedSquares: 5,
      now: new Date("2026-08-20T21:00:00.000Z"),
    });
    expect(report.dayKey).toBe("2026-08-20");
    expect(report.newClaims.map((item) => item.id)).toEqual(["a"]);
    expect(report.newClaims[0]?.host).toBe("tecminds.ch");
    expect(report.newClaims[0]?.squares).toBe(4);
    expect(report.occupiedSquares).toBe(5);
    expect(report.openSquares).toBe(BOARD_SQUARES - 5);
  });

  test("tweet names new apps and stays within 280 characters", () => {
    const report = buildDailyReport({
      claims: [
        claim({
          id: "a",
          url: "https://tecminds.ch",
          description: "Tools for operators",
          width: 2,
          height: 1,
          createdAt: "2026-08-20T10:00:00.000Z",
        }),
        claim({
          id: "b",
          url: "https://keel.app",
          createdAt: "2026-08-20T11:00:00.000Z",
        }),
      ],
      occupiedSquares: 3,
      now: new Date("2026-08-20T21:00:00.000Z"),
    });
    expect(report.tweet).toContain("PIXELREST");
    expect(report.tweet).toContain("2 new apps");
    expect(report.tweet).toContain("tecminds.ch");
    expect(report.tweet).toContain("keel.app");
    expect(report.tweet).toContain("https://pixelrest.com");
    expect(report.tweet.length).toBeLessThanOrEqual(280);
  });

  test("quiet day still posts a board status", () => {
    const report = buildDailyReport({
      claims: [
        claim({
          id: "old",
          url: "https://old.app",
          createdAt: "2026-08-19T10:00:00.000Z",
        }),
      ],
      occupiedSquares: 1,
      now: new Date("2026-08-20T21:00:00.000Z"),
    });
    expect(report.newClaims).toEqual([]);
    expect(report.tweet).toContain("No new apps");
    expect(report.tweet).toContain("102,399 / 102,400 open");
    expect(report.tweet.length).toBeLessThanOrEqual(280);
  });

  test("caps the app list so the tweet cannot overflow", () => {
    const claims = Array.from({ length: 20 }, (_, i) =>
      claim({
        id: `c${i}`,
        url: `https://app-${i}.example`,
        createdAt: "2026-08-20T10:00:00.000Z",
      }),
    );
    const report = buildDailyReport({
      claims,
      occupiedSquares: 20,
      now: new Date("2026-08-20T21:00:00.000Z"),
    });
    expect(report.tweet.length).toBeLessThanOrEqual(280);
    expect(report.tweet).toContain("more");
  });
});

describe("X board image", () => {
  test("uses a square X block with the board perfectly centered", () => {
    expect(X_POST_WIDTH).toBe(1200);
    expect(X_POST_HEIGHT).toBe(1200);
    const origin = boardOrigin();
    expect(origin.x).toBe(120);
    expect(origin.y).toBe(120);
    expect(origin.x * 2 + 960).toBe(X_POST_WIDTH);
    expect(origin.y * 2 + 960).toBe(X_POST_HEIGHT);
  });

  test("renders a PNG that fits an X photo post", async () => {
    let grid = createGrid();
    grid = applyClaim(
      grid,
      { x: 10, y: 10, width: 4, height: 4 },
      {
        claimId: "new",
        url: "https://tecminds.ch",
        description: "TecMinds",
        logoUrl: null,
      },
    );
    const png = await renderBoardImage({
      grid,
      newClaimIds: ["new"],
      title: "PIXELREST",
      dateLabel: "20 Aug 2026",
      footer: "1 new · 16 occupied",
    });
    expect(png.subarray(0, 8)).toEqual(
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(png.byteLength).toBeGreaterThan(800);
    expect(png.byteLength).toBeLessThan(5 * 1024 * 1024);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1200);
    expect(meta.format).toBe("png");
  });
});
