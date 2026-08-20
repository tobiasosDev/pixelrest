import { BOARD_SQUARES } from "./board";
import { zurichDateLabel, zurichDayKey } from "./clock";
import { hostnameOf } from "./url";

export interface StoredClaim {
  id: string;
  url: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  logoUrl: string | null;
  createdAt: string;
}

export interface DailyApp {
  id: string;
  host: string;
  url: string;
  description: string;
  squares: number;
}

export interface DailyReport {
  dayKey: string;
  dateLabel: string;
  newClaims: DailyApp[];
  occupiedSquares: number;
  openSquares: number;
  tweet: string;
}

function onZurichDay(iso: string, dayKey: string): boolean {
  return zurichDayKey(new Date(iso)) === dayKey;
}

export function buildDailyReport(options: {
  claims: StoredClaim[];
  occupiedSquares: number;
  now: Date;
}): DailyReport {
  const dayKey = zurichDayKey(options.now);
  const dateLabel = zurichDateLabel(options.now);
  const occupiedSquares = Math.max(0, options.occupiedSquares);
  const openSquares = Math.max(0, BOARD_SQUARES - occupiedSquares);
  const newClaims: DailyApp[] = options.claims
    .filter((claim) => onZurichDay(claim.createdAt, dayKey))
    .map((claim) => ({
      id: claim.id,
      host: hostnameOf(claim.url),
      url: claim.url,
      description: claim.description,
      squares: Math.max(1, claim.width * claim.height),
    }));
  return {
    dayKey,
    dateLabel,
    newClaims,
    occupiedSquares,
    openSquares,
    tweet: formatTweet({
      dateLabel,
      newClaims,
      occupiedSquares,
      openSquares,
    }),
  };
}

function formatTweet(options: {
  dateLabel: string;
  newClaims: DailyApp[];
  occupiedSquares: number;
  openSquares: number;
}): string {
  const header = `PIXELREST · ${options.dateLabel}`;
  const stats = `${options.openSquares.toLocaleString("en-US")} / ${BOARD_SQUARES.toLocaleString("en-US")} open`;
  const link = "https://pixelrest.com";
  if (options.newClaims.length === 0) {
    return `${header}\n\nNo new apps today.\n\n${stats}\n${link}`;
  }
  const intro = `${options.newClaims.length} new app${options.newClaims.length === 1 ? "" : "s"}`;
  const lines = options.newClaims.map(
    (app) => `• ${app.host} · ${app.squares} sq`,
  );
  const budget = 280 - (header.length + intro.length + stats.length + 23 + 8);
  const kept: string[] = [];
  let used = 0;
  for (const [index, line] of lines.entries()) {
    const remaining = lines.length - index - 1;
    const more = remaining > 0 ? `\n+${remaining} more` : "";
    if (used + line.length + 1 + more.length > budget) {
      if (remaining + 1 > 0) {
        kept.push(`+${remaining + 1} more`);
      }
      break;
    }
    kept.push(line);
    used += line.length + 1;
  }
  return `${header}\n\n${intro}\n${kept.join("\n")}\n\n${stats}\n${link}`;
}
