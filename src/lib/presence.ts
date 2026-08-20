import { zurichDayKey } from "./clock";
import { listClaims } from "./grid-db";
import {
  LIVE_WINDOW_MS,
  countPresence,
  rankHolders,
  touchPresence,
  type Holder,
  type PresenceRow,
} from "./hud";
import { supabaseAdmin } from "./supabase";

const g = globalThis as { __pixelrestPresence?: Map<string, PresenceRow> };

function memory(): Map<string, PresenceRow> {
  if (!g.__pixelrestPresence) {
    g.__pixelrestPresence = new Map();
  }
  return g.__pixelrestPresence;
}

export function readLocalCounts(
  now = new Date(),
): { live: number; today: number } {
  return countPresence({ rows: [...memory().values()], now });
}

function rememberAll(rows: PresenceRow[]): void {
  const store = memory();
  store.clear();
  for (const row of rows) {
    store.set(row.visitorId, row);
  }
}

export function heartbeatLocal(
  visitorId: string,
  now = new Date(),
): { live: number; today: number } {
  const local = touchPresence({
    rows: [...memory().values()],
    visitorId,
    now,
  });
  rememberAll(local.rows);
  return { live: local.live, today: local.today };
}

export async function heartbeatVisitor(
  visitorId: string,
  now = new Date(),
): Promise<{ live: number; today: number }> {
  const local = heartbeatLocal(visitorId, now);

  try {
    const admin = supabaseAdmin();
    const { error } = await admin.from("presence").upsert({
      visitor_id: visitorId,
      last_seen: now.toISOString(),
      seen_on: zurichDayKey(now),
    });
    if (error) {
      return local;
    }
    return await readPresenceCounts(now);
  } catch {
    return local;
  }
}

export async function readPresenceCounts(
  now = new Date(),
): Promise<{ live: number; today: number }> {
  try {
    const admin = supabaseAdmin();
    const liveSince = new Date(now.getTime() - LIVE_WINDOW_MS).toISOString();
    const today = zurichDayKey(now);
    const [liveRes, todayRes] = await Promise.all([
      admin
        .from("presence")
        .select("*", { count: "exact", head: true })
        .gte("last_seen", liveSince),
      admin
        .from("presence")
        .select("*", { count: "exact", head: true })
        .eq("seen_on", today),
    ]);
    if (liveRes.error || todayRes.error) {
      return readLocalCounts(now);
    }
    return {
      live: liveRes.count ?? 0,
      today: todayRes.count ?? 0,
    };
  } catch {
    return readLocalCounts(now);
  }
}

export async function loadHolders(): Promise<Holder[]> {
  try {
    const claims = await listClaims();
    return rankHolders(
      claims.map((claim) => ({
        url: claim.url,
        logoUrl: claim.logoUrl,
        squares: Math.max(1, claim.width * claim.height),
        x: claim.x,
        y: claim.y,
        width: claim.width,
        height: claim.height,
      })),
    );
  } catch {
    return [];
  }
}
