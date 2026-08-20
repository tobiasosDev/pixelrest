/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/cron/daily": ["./src/lib/fonts/**/*"],
  },
};

export default nextConfig;
