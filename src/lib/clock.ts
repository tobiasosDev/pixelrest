export const ZURICH = "Europe/Zurich";

export function zurichDayKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function zurichDateLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZURICH,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);
}
