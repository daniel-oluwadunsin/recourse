/** @type {import('next').NextConfig} */
const apiOrigin = (
  globalThis.process?.env?.API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
