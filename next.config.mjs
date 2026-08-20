const NO_STORE = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, max-age=0",
  },
  { key: "CDN-Cache-Control", value: "no-store" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

// app.js and styles.css are referenced with ?v=BUILD_ID, so their URLs change
// on every deploy and the files can be cached forever. In dev the files change
// without the URL changing, so caching stays off there.
const IMMUTABLE = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

const staticAssetHeaders =
  process.env.NODE_ENV === "production" ? IMMUTABLE : NO_STORE;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ?? `dev-${Date.now()}`,
  },
  outputFileTracingIncludes: {
    "/api/cron/daily": ["./src/lib/fonts/**/*"],
  },
  async headers() {
    return [
      { source: "/", headers: NO_STORE },
      { source: "/api/grid", headers: NO_STORE },
      { source: "/app.js", headers: staticAssetHeaders },
      { source: "/styles.css", headers: staticAssetHeaders },
    ];
  },
};

export default nextConfig;
