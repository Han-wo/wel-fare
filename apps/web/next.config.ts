import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@welfare-ai/shared-types', '@welfare-ai/shared-utils', '@welfare-ai/ui'],
};

export default nextConfig;
