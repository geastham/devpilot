/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Enable server actions with a larger body size limit.
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // better-sqlite3 is a native addon (via @devpilot.sh/core); keep it out of
    // the webpack bundle so its .node binary loads at runtime.
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ensure the native addon (and its loader) are required at runtime, not
      // bundled — webpack rewrites the .node lookup path otherwise.
      config.externals.push('better-sqlite3', 'bindings');
    }
    return config;
  },
};

export default nextConfig;
