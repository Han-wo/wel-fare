import type { NextConfig } from 'next';
import path from 'path';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  distDir: isDev ? '.next-dev' : '.next',
  output: 'standalone',
  transpilePackages: ['@welfare-ai/shared-types', '@welfare-ai/shared-utils', '@welfare-ai/ui'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
