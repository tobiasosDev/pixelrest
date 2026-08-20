export interface LogoResolveInput {
  html: string;
  baseUrl: string;
  headers?: Record<string, string>;
  file?: unknown;
  uploadedImage?: unknown;
  [extra: string]: unknown;
}

function originOf(baseUrl: string): string {
  const url = new URL(baseUrl);
  return url.origin;
}

function absUrl(href: string, baseUrl: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    const name = match[1].toLowerCase();
    if (name === "link" || name === "meta" || name.startsWith("<")) {
      continue;
    }
    attrs[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function collectTags(html: string, tag: string): Array<Record<string, string>> {
  const re = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const out: Array<Record<string, string>> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    out.push(parseAttrs(match[0]));
  }
  return out;
}

function relTokens(rel: string | undefined): string[] {
  return (rel ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function iconSizeArea(sizes: string | undefined): number {
  if (!sizes || sizes === "any") {
    return 0;
  }
  let best = 0;
  for (const token of sizes.split(/\s+/)) {
    const parts = token.toLowerCase().split("x");
    const w = Number(parts[0]);
    const h = Number(parts[1] ?? parts[0]);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      best = Math.max(best, w * h);
    }
  }
  return best;
}

function fromLinkHeader(
  header: string | undefined,
  baseUrl: string,
): { apple: string | null; icon: string | null } {
  const apple: string[] = [];
  const icons: string[] = [];
  if (!header) {
    return { apple: null, icon: null };
  }
  for (const part of header.split(",")) {
    const hrefMatch = part.match(/<([^>]+)>/);
    const relMatch = part.match(/rel\s*=\s*"?([^";]+)"?/i);
    if (!hrefMatch || !relMatch) {
      continue;
    }
    const href = absUrl(hrefMatch[1], baseUrl);
    if (!href) {
      continue;
    }
    const rel = relMatch[1].toLowerCase();
    if (rel.includes("apple-touch-icon")) {
      apple.push(href);
    } else if (rel.split(/\s+/).includes("icon") || rel.includes("shortcut")) {
      icons.push(href);
    }
  }
  return { apple: apple[0] ?? null, icon: icons[0] ?? null };
}

export function resolveLogoFromHtml(input: LogoResolveInput): string {
  const baseUrl = input.baseUrl;
  const html = input.html ?? "";
  const headerIcon = fromLinkHeader(
    input.headers?.link ?? input.headers?.Link,
    baseUrl,
  );

  let apple: string | null = headerIcon.apple;
  const icons: Array<{ href: string; area: number }> = [];
  let og: string | null = null;

  for (const attrs of collectTags(html, "link")) {
    const rel = relTokens(attrs.rel);
    const href = attrs.href ? absUrl(attrs.href, baseUrl) : null;
    if (!href) {
      continue;
    }
    if (rel.some((token) => token.includes("apple-touch-icon"))) {
      apple = apple ?? href;
      continue;
    }
    if (rel.includes("icon") || rel.includes("shortcut")) {
      icons.push({ href, area: iconSizeArea(attrs.sizes) });
    }
  }

  for (const attrs of collectTags(html, "meta")) {
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:url") {
      og = attrs.content ? absUrl(attrs.content, baseUrl) : null;
      if (og) {
        break;
      }
    }
  }

  if (apple) {
    return apple;
  }

  if (icons.length > 0) {
    icons.sort((a, b) => b.area - a.area);
    return icons[0].href;
  }

  if (headerIcon.icon) {
    return headerIcon.icon;
  }

  if (og) {
    return og;
  }

  return `${originOf(baseUrl)}/favicon.ico`;
}
