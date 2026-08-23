import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { resolveLogoFromHtml } from "./lib/logo";

const HTML_LIMIT = 1_000_000;
const IMAGE_LIMIT = 2_000_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const PRIVATE_V4_RANGES: Array<[number, number]> = [
  [0x00000000, 0xff000000],
  [0x0a000000, 0xff000000],
  [0x7f000000, 0xff000000],
  [0xa9fe0000, 0xffff0000],
  [0xac100000, 0xfff00000],
  [0xc0a80000, 0xffff0000],
  [0x64400000, 0xffc00000],
];

function isPrivateIpv4(value: number): boolean {
  return PRIVATE_V4_RANGES.some(
    ([base, mask]) => ((value & mask) >>> 0) === base,
  );
}

function ipv4Value(parts: number[]): number {
  return (((parts[0]! << 8) | parts[1]!) << 16) + ((parts[2]! << 8) | parts[3]!);
}

function ipv4FromDotted(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) {
    return null;
  }
  return parts.map(Number);
}

function expandIpv6(host: string): number[] | null {
  let core = host;
  const dotted = host.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const p = dotted[2].split(".").map(Number);
    if (p.length !== 4 || p.some((n) => n > 255)) {
      return null;
    }
    const hi = ((p[0]! << 8) | p[1]!).toString(16);
    const lo = ((p[2]! << 8) | p[3]!).toString(16);
    core = `${dotted[1]}${hi}:${lo}`;
  }
  const sides = core.split("::");
  if (sides.length > 2) {
    return null;
  }
  const parseGroups = (part: string): number[] | null => {
    if (!part) {
      return [];
    }
    const tokens = part.split(":");
    if (!tokens.every((t) => /^[0-9a-f]{1,4}$/.test(t))) {
      return null;
    }
    return tokens.map((t) => parseInt(t, 16));
  };
  const head = parseGroups(sides[0] ?? "");
  if (!head) {
    return null;
  }
  const rest = sides.length === 2 ? parseGroups(sides[1] ?? "") : [];
  if (!rest) {
    return null;
  }
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (sides.length === 1 && missing !== 0)) {
    return null;
  }
  return [...head, ...Array.from({ length: missing }, () => 0), ...rest];
}

function isBlockedIpv6(groups: number[]): boolean {
  if (groups.every((g) => g === 0)) {
    return true;
  }
  const first = groups[0]!;
  if (first >= 0xfc00 && first <= 0xfdff) {
    return true;
  }
  if ((first & 0xffc0) === 0xfe80) {
    return true;
  }
  if ((first & 0xff00) === 0xff00) {
    return true;
  }
  const bytesFromTail = () =>
    ipv4Value([
      groups[6]! >> 8,
      groups[6]! & 0xff,
      groups[7]! >> 8,
      groups[7]! & 0xff,
    ]);
  if (
    groups.slice(0, 5).every((g) => g === 0) &&
    (groups[5] === 0 || groups[5] === 0xffff)
  ) {
    return isPrivateIpv4(bytesFromTail());
  }
  if (first === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return isPrivateIpv4(bytesFromTail());
  }
  if (first === 0x2002) {
    return isPrivateIpv4(
      ipv4Value([
        groups[1]! >> 8,
        groups[1]! & 0xff,
        groups[2]! >> 8,
        groups[2]! & 0xff,
      ]),
    );
  }
  if (first === 0x2001 && groups[1] === 0x0000) {
    return true;
  }
  return false;
}

export function isBlockedHost(rawHostname: string): boolean {
  const host = rawHostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) {
    return true;
  }
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  if (host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host.includes(":")) {
    const groups = expandIpv6(host);
    return !groups || isBlockedIpv6(groups);
  }
  const v4 = ipv4FromDotted(host);
  if (v4) {
    if (v4.some((n) => n > 255)) {
      return true;
    }
    return isPrivateIpv4(ipv4Value(v4));
  }
  if (/^[\d.]+$/.test(host)) {
    return true;
  }
  return false;
}

async function assertFetchableUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("blocked protocol");
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error("blocked host");
  }
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare)) {
    return;
  }
  let records: Array<{ address: string }>;
  try {
    records = await lookup(bare, { all: true, verbatim: true });
  } catch {
    throw new Error("unresolvable host");
  }
  if (records.length === 0) {
    throw new Error("unresolvable host");
  }
  for (const record of records) {
    if (isBlockedHost(record.address)) {
      throw new Error("blocked host");
    }
  }
}

async function fetchLimited(
  startUrl: string,
  headers: Record<string, string>,
  limit: number,
): Promise<{ body: Uint8Array; contentType: string; finalUrl: string }> {
  let current = new URL(startUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertFetchableUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "user-agent": "LastResortBoard/0.1 (logo fetch)",
          accept: headers.accept ?? "*/*",
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("bad redirect");
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error("too many redirects");
      }
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > limit) {
      throw new Error("too large");
    }
    return { body: buffer, contentType, finalUrl: current.href };
  }
  throw new Error("too many redirects");
}

function extensionFor(contentType: string, logoUrl: string): string {
  if (contentType.includes("svg")) {
    return "svg";
  }
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "jpg";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
  if (contentType.includes("gif")) {
    return "gif";
  }
  if (contentType.includes("icon") || contentType.includes("ico")) {
    return "ico";
  }
  const path = new URL(logoUrl).pathname.toLowerCase();
  const match = path.match(/\.(svg|png|jpe?g|webp|gif|ico)$/);
  if (match) {
    return match[1] === "jpeg" ? "jpg" : match[1];
  }
  return "png";
}

export async function fetchWebsiteLogo(
  websiteUrl: string,
): Promise<{ bytes: Uint8Array; contentType: string; extension: string } | null> {
  try {
    const page = await fetchLimited(
      websiteUrl,
      { accept: "text/html,application/xhtml+xml" },
      HTML_LIMIT,
    );
    const html = new TextDecoder("utf-8", { fatal: false }).decode(page.body);
    const headerRecord: Record<string, string> = {
      "content-type": page.contentType,
    };
    const logoHref = resolveLogoFromHtml({
      html,
      headers: headerRecord,
      baseUrl: page.finalUrl || websiteUrl,
    });
    const image = await fetchLimited(
      logoHref,
      { accept: "image/*,*/*;q=0.8" },
      IMAGE_LIMIT,
    );
    if (
      image.contentType.includes("text/html") &&
      image.body.byteLength > 200
    ) {
      return null;
    }
    return {
      bytes: image.body,
      contentType: image.contentType || "image/png",
      extension: extensionFor(image.contentType, logoHref),
    };
  } catch {
    return null;
  }
}
