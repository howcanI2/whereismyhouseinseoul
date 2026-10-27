/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // data/*.json is regenerated daily by the refresh workflow; let browsers revalidate it
  async headers() {
    return [{ source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] }];
  },
};

export default nextConfig;
