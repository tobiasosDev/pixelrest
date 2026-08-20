import { zurichDayKey } from "./clock";
import { hostnameOf } from "./url";

const VISITOR_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVisitorId(value: unknown): value is string {
  return typeof value === "string" && VISITOR_ID.test(value);
}

export const LIVE_WINDOW_MS = 45_000;
export const HOLDER_LIMIT = 5;

export interface HolderClaim {
  url: string;
  logoUrl: string | null;
  squares: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Holder {
  host: string;
  url: string;
  logoUrl: string | null;
  squares: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PresenceRow {
  visitorId: string;
  lastSeen: number;
  seenOn: string;
}

export function rankHolders(
  claims: HolderClaim[],
  limit = HOLDER_LIMIT,
): Holder[] {
  const byHost = new Map<string, Holder>();
  for (const claim of claims) {
    const squares = Math.max(0, claim.squares);
    if (squares <= 0) {
      continue;
    }
    const host = hostnameOf(claim.url);
    const current = byHost.get(host);
    if (!current) {
      byHost.set(host, {
        host,
        url: claim.url,
        logoUrl: claim.logoUrl,
        squares,
        x: claim.x,
        y: claim.y,
        width: claim.width,
        height: claim.height,
      });
      continue;
    }
    current.squares += squares;
    if (squares > current.width * current.height) {
      current.url = claim.url;
      current.logoUrl = claim.logoUrl ?? current.logoUrl;
      current.x = claim.x;
      current.y = claim.y;
      current.width = claim.width;
      current.height = claim.height;
    } else if (!current.logoUrl && claim.logoUrl) {
      current.logoUrl = claim.logoUrl;
    }
  }
  return [...byHost.values()]
    .sort((a, b) => b.squares - a.squares || a.host.localeCompare(b.host))
    .slice(0, Math.max(0, limit));
}

export function countPresence(options: {
  rows: PresenceRow[];
  now: Date;
  liveWindowMs?: number;
}): { live: number; today: number } {
  const windowMs = options.liveWindowMs ?? LIVE_WINDOW_MS;
  const today = zurichDayKey(options.now);
  const nowMs = options.now.getTime();
  let live = 0;
  let todayCount = 0;
  for (const row of options.rows) {
    if (nowMs - row.lastSeen <= windowMs) {
      live += 1;
    }
    if (row.seenOn === today) {
      todayCount += 1;
    }
  }
  return { live, today: todayCount };
}

export function touchPresence(options: {
  rows: PresenceRow[];
  visitorId: string;
  now: Date;
  liveWindowMs?: number;
}): { rows: PresenceRow[]; live: number; today: number } {
  const seenOn = zurichDayKey(options.now);
  const lastSeen = options.now.getTime();
  const next = options.rows.filter((row) => row.visitorId !== options.visitorId);
  next.push({
    visitorId: options.visitorId,
    lastSeen,
    seenOn,
  });
  const counts = countPresence({
    rows: next,
    now: options.now,
    liveWindowMs: options.liveWindowMs,
  });
  return { rows: next, ...counts };
}
