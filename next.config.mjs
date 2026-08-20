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
      { source: "/app.js", headers: NO_STORE },
      { source: "/styles.css", headers: NO_STORE },
      { source: "/api/grid", headers: NO_STORE },
    ];
  },
};

export default nextConfig;
