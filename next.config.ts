import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The chrome ships as static files served by a custom protocol from the main
  // process. There is no server in a packaged browser.
  output: 'export',
  reactCompiler: true,
  images: { unoptimized: true },
  // Emitted asset paths are absolute against the protocol origin. Trailing
  // slashes keep directory-style URLs resolvable through the same handler.
  trailingSlash: true,
  // Linting is a separate, stricter step; a type error still fails the build.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
