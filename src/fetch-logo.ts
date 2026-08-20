import { resolveLogoFromHtml } from "./lib/logo";

const HTML_LIMIT = 1_000_000;
const IMAGE_LIMIT = 2_000_000;
const TIMEOUT_MS = 8_000;

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
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
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    const [a, b] = octets;
    if (octets.some((n) => n > 255)) {
      return true;
    }
    if (a === 0 || a === 10 || a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }
  }
  if (
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  ) {
    return true;
  }
  return false;
}

function assertFetchableUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("blocked protocol");
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error("blocked host");
  }
  return url;
}

async function fetchLimited(
  url: string,
  headers: Record<string, string>,
  limit: number,
): Promise<{ body: Uint8Array; contentType: string; finalUrl: string }> {
  assertFetchableUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "LastResortBoard/0.1 (logo fetch)",
        accept: headers.accept ?? "*/*",
      },
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const finalUrl = response.url || url;
    assertFetchableUrl(finalUrl);
    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > limit) {
      throw new Error("too large");
    }
    return { body: buffer, contentType, finalUrl };
  } finally {
    clearTimeout(timer);
  }
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
