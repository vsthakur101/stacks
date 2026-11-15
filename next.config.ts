import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdfjs-dist'],
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
