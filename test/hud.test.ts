import { describe, expect, test } from "bun:test";
import { zurichDayKey } from "../src/lib/clock";
import {
  LIVE_WINDOW_MS,
  countPresence,
  isVisitorId,
  rankHolders,
  touchPresence,
  type HolderClaim,
} from "../src/lib/hud";

function claim(partial: Partial<HolderClaim> & Pick<HolderClaim, "url">): HolderClaim {
  return {
    logoUrl: null,
    squares: 1,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    ...partial,
  };
}

describe("holder ranking", () => {
  test("ranks sites by total squares and merges the same host", () => {
    const holders = rankHolders([
      claim({
        url: "https://www.acurio.ch/",
        squares: 100,
        x: 10,
        y: 10,
        width: 10,
        height: 10,
        logoUrl: "/logos/acurio.png",
      }),
      claim({
        url: "https://keel.app/pricing",
        squares: 40,
        x: 0,
        y: 0,
        width: 8,
        height: 5,
      }),
      claim({
        url: "https://acurio.ch/about",
        squares: 20,
        x: 80,
        y: 12,
        width: 5,
        height: 4,
      }),
      claim({
        url: "https://lumen.dev",
        squares: 12,
        x: 40,
        y: 40,
        width: 4,
        height: 3,
      }),
    ]);

    expect(holders.map((row) => [row.host, row.squares])).toEqual([
      ["acurio.ch", 120],
      ["keel.app", 40],
      ["lumen.dev", 12],
    ]);
    expect(holders[0]?.url).toBe("https://www.acurio.ch/");
    expect(holders[0]?.logoUrl).toBe("/logos/acurio.png");
    expect(holders[0]?.x).toBe(10);
    expect(holders[0]?.width).toBe(10);
  });

  test("keeps the five largest holders", () => {
    const holders = rankHolders(
      Array.from({ length: 8 }, (_, index) =>
        claim({
          url: `https://site-${index}.test`,
          squares: index + 1,
        }),
      ),
      5,
    );
    expect(holders.map((row) => row.host)).toEqual([
      "site-7.test",
      "site-6.test",
      "site-5.test",
      "site-4.test",
      "site-3.test",
    ]);
  });
});

describe("visitor ids", () => {
  test("accepts a UUID and rejects empty or junk values", () => {
    expect(isVisitorId("aaaaaaa1-bbbb-4ccc-8ddd-eeeeeeeeeee1")).toBe(true);
    expect(isVisitorId("")).toBe(false);
    expect(isVisitorId("not-an-id")).toBe(false);
    expect(isVisitorId(12)).toBe(false);
  });
});

describe("presence counts", () => {
  test("counts live viewers inside the window and unique visitors on the Zurich day", () => {
    const now = new Date("2026-08-20T21:00:00.000Z");
    const today = zurichDayKey(now);
    const counts = countPresence({
      now,
      rows: [
        {
          visitorId: "live-1",
          lastSeen: now.getTime() - 10_000,
          seenOn: today,
        },
        {
          visitorId: "live-2",
          lastSeen: now.getTime() - LIVE_WINDOW_MS + 1,
          seenOn: today,
        },
        {
          visitorId: "left-today",
          lastSeen: now.getTime() - LIVE_WINDOW_MS - 1,
          seenOn: today,
        },
        {
          visitorId: "yesterday",
          lastSeen: now.getTime() - 3_600_000,
          seenOn: "2026-08-19",
        },
      ],
    });
    expect(counts).toEqual({ live: 2, today: 3 });
  });

  test("a heartbeat keeps a visitor live and rolls them onto the current Zurich day", () => {
    const now = new Date("2026-08-20T18:05:00.000Z");
    const next = touchPresence({
      now,
      visitorId: "aaaaaaa1-bbbb-4ccc-8ddd-eeeeeeeeeee1",
      rows: [
        {
          visitorId: "aaaaaaa1-bbbb-4ccc-8ddd-eeeeeeeeeee1",
          lastSeen: now.getTime() - 80_000,
          seenOn: "2026-08-19",
        },
      ],
    });
    expect(next.live).toBe(1);
    expect(next.today).toBe(1);
    expect(next.rows[0]?.seenOn).toBe("2026-08-20");
    expect(next.rows[0]?.lastSeen).toBe(now.getTime());
  });
});
