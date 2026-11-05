// Build-time data for the per-구 pages (/gu/<slug>/): read from public/data, which the refresh job updates daily,
// so each deploy bakes the latest numbers into plain HTML that search crawlers can read.
import fs from "fs";
import path from "path";

export const GU = [
  ["종로구", "jongno"], ["중구", "jung"], ["용산구", "yongsan"], ["성동구", "seongdong"], ["광진구", "gwangjin"],
  ["동대문구", "dongdaemun"], ["중랑구", "jungnang"], ["성북구", "seongbuk"], ["강북구", "gangbuk"], ["도봉구", "dobong"],
  ["노원구", "nowon"], ["은평구", "eunpyeong"], ["서대문구", "seodaemun"], ["마포구", "mapo"], ["양천구", "yangcheon"],
  ["강서구", "gangseo"], ["구로구", "guro"], ["금천구", "geumcheon"], ["영등포구", "yeongdeungpo"], ["동작구", "dongjak"],
  ["관악구", "gwanak"], ["서초구", "seocho"], ["강남구", "gangnam"], ["송파구", "songpa"], ["강동구", "gangdong"],
];
export const slugOf = (name) => (GU.find(([n]) => n === name) || [])[1];
export const nameOf = (slug) => (GU.find(([, s]) => s === slug) || [])[0];

const DATA = path.join(process.cwd(), "public", "data");
const cache = {};
const read = (f) => (cache[f] ??= JSON.parse(fs.readFileSync(path.join(DATA, f), "utf-8")));

// 만원 → "11.8억" / "9,500만"
export const won = (v) => {
  if (v == null) return "–";
  if (v >= 10000) return `${(v / 10000).toFixed(v >= 100000 ? 1 : 2).replace(/\.?0+$/, "")}억`;
  return `${v.toLocaleString("ko-KR")}만`;
};
export const pct = (v, sign = true) => (v == null ? "–" : `${sign && v > 0 ? "+" : ""}${v.toFixed(1)}%`);

export function guData(name) {
  const ins = read("insights.json");
  const g = ins.gu[name];
  const sum = read("gu_summary.json").find((r) => r.gu === name) || {};
  const dongs = read("dong_summary.json").filter((r) => r.gu === name && r.trades_12m > 0)
    .sort((a, b) => b.trades_12m - a.trades_12m);
  const apts = read("apts.json").filter((r) => r.gu === name && r.trades_6m > 0)
    .sort((a, b) => b.trades_6m - a.trades_6m).slice(0, 15);
  const deals = read("deals.json");
  const highs = deals.highs.filter((d) => d.gu === name).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const dips = deals.dips.filter((d) => d.gu === name).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  return { name, g, sum, dongs, apts, highs, dips, meta: ins.meta, since: deals.since };
}
