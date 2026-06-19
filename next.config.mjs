/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // App Router is default in Next.js 15.
  },
  // Run typeORM-related files through the Next compiler only as plain TS;
  // they are consumed by Node (CLI scripts + Next.js server runtime), not bundled.
  serverExternalPackages: ["typeorm", "mysql2"],
};

export default nextConfig;
