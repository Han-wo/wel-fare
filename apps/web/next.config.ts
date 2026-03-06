import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@welfare-ai/shared-types', '@welfare-ai/shared-utils', '@welfare-ai/ui'],
  experimental: {
    // Allow standalone output to trace files from the monorepo root
    // so shared packages (packages/*) are included in the bundle
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

export default nextConfig;
