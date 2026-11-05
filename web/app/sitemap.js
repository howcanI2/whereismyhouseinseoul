// sitemap.xml: the pages to submit in Naver Search Advisor / Google Search Console
export const dynamic = "force-static";
export default function sitemap() {
  const now = new Date();
  return [
    { url: "https://whereismyhouse.kr/", lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: "https://whereismyhouse.kr/privacy/", lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
