import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
