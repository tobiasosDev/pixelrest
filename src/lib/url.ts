export function normalizeWebsiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("empty");
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const withProto = hasScheme ? trimmed : `https://${trimmed}`;
  const url = new URL(withProto);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("protocol");
  }
  return url.href;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
