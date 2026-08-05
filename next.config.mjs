/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Standalone output so the CLI can ship this app.
   *
   * `devpilot serve` used to start a second, Fastify implementation of the same
   * API and its source literally read "In a full implementation, this would
   * open the UI" — so anyone installing from npm got an API on :3847 and no
   * cockpit at all, while the real cockpit only ran from a repo checkout.
   *
   * Standalone traces the server and its dependencies into .next/standalone,
   * which is what makes it packageable. The alternative was static-exporting
   * the UI and porting 29 Next API routes onto Fastify — porting working code
   * to remove a duplicate is the riskiest way to remove a duplicate.
   */
  output: 'standalone',
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
