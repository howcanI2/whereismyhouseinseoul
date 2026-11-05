// robots.txt for whereismyhouse.kr: every crawler may read every page (Naver Search Advisor checks this file)
export const dynamic = "force-static";
export default function robots() {
  return { rules: [{ userAgent: "*", allow: "/" }], sitemap: "https://whereismyhouse.kr/sitemap.xml" };
}
