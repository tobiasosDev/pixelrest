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
};

export default nextConfig;
