// sitemap.xml: the pages to submit in Naver Search Advisor / Google Search Console
import { GU } from "./gu/data";
import { BUDGETS } from "./budget/amounts.js";
import { GUIDES } from "./guide/list.js";

export const dynamic = "force-static";
export default function sitemap() {
  const now = new Date();
  const u = (p, changeFrequency, priority) => ({ url: `https://whereismyhouse.kr${p}`, lastModified: now, changeFrequency, priority });
  return [
    u("/", "daily", 1),
    u("/tiers/", "daily", 0.9),
    u("/gu/", "daily", 0.8),
    ...GU.map(([, s]) => u(`/gu/${s}/`, "daily", 0.7)),
    u("/budget/", "daily", 0.8),
    ...BUDGETS.map((b) => u(`/budget/${b.slug}/`, "daily", 0.7)),
    u("/market/", "daily", 0.8),
    u("/cheongyak/", "daily", 0.7),
    u("/newbuild/", "weekly", 0.6),
    u("/redev/", "weekly", 0.6),
    u("/guide/", "weekly", 0.7),
    ...GUIDES.map(([s]) => u(`/guide/${s}/`, "weekly", 0.6)),
    u("/about/", "monthly", 0.5),
    u("/privacy/", "yearly", 0.2),
  ];
}
