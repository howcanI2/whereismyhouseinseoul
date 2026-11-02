// PAGES_BASE_PATH set = static export: "/whereismyhouseinseoul" for GitHub Pages, "/" for the 앱인토스 bundle (root);
// unset = normal Next.js (dev / Vercel).
const pages = process.env.PAGES_BASE_PATH === "/" ? "" : process.env.PAGES_BASE_PATH;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(pages != null
    ? { output: "export", basePath: pages, trailingSlash: true, images: { unoptimized: true }, distDir: ".next-pages" }
    : {
        // data/*.json is regenerated daily by the refresh workflow; let browsers revalidate it
        async headers() {
          return [{ source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }] }];
        },
      }),
};

export default nextConfig;
