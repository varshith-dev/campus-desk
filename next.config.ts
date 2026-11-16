import type { NextConfig } from 'next';

// The files other sites read: the manifest, the network, links, the runtime and the public keys.
// They need CORS so a browser on another origin can fetch them (spec section 3.3).
const cors = [
  { key: 'Access-Control-Allow-Origin', value: '*' },
  { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
];
const publicFiles = ['/agent-manifest.json', '/campus_desk.network.json', '/links.json', '/agent-mcp.json', '/runtime/:path*', '/favicon.svg'];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['@libsql/client', 'libsql'],
  outputFileTracingIncludes: { '/**': ['./data/seed/**'] },
  async headers() {
    return [
      ...publicFiles.map((source) => ({ source, headers: [...cors, { key: 'Cache-Control', value: 'public, max-age=60, must-revalidate' }] })),
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }] },
    ];
  },
};
export default config;
