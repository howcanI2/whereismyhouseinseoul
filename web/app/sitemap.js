// sitemap.xml: the pages to submit in Naver Search Advisor / Google Search Console
import { GU } from "./gu/data";

export const dynamic = "force-static";
export default function sitemap() {
  const now = new Date();
  const u = (p, changeFrequency, priority) => ({ url: `https://whereismyhouse.kr${p}`, lastModified: now, changeFrequency, priority });
  return [
    u("/", "daily", 1),
    u("/tiers/", "daily", 0.9),
    u("/gu/", "daily", 0.8),
    ...GU.map(([, s]) => u(`/gu/${s}/`, "daily", 0.7)),
    u("/privacy/", "yearly", 0.2),
  ];
}
