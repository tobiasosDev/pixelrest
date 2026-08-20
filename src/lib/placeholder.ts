import { hostnameOf } from "./url";

function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

export function placeholderSvg(url: string): string {
  const host = hostnameOf(url);
  const letter = (host[0] ?? "?").toUpperCase();
  const hue = hashHue(host);
  const safe = letter.replace(/[^A-Z0-9]/g, "?");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" fill="hsl(${hue} 28% 26%)"/>
  <rect x="2" y="2" width="60" height="60" fill="none" stroke="rgba(255,183,3,0.45)" stroke-width="2"/>
  <text x="32" y="42" text-anchor="middle" font-size="30" font-family="Arial, sans-serif" fill="#F4EDE0">${safe}</text>
</svg>`;
}

export function placeholderDataUrl(url: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeholderSvg(url))}`;
}
