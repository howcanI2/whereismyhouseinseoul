import { useEffect, useState } from "react";

export const FILES = ["budget", "strategy", "gu_summary", "monthly", "complexes", "seoul_geo", "dong_geo", "dong_summary", "apts", "rates", "loan_market", "policy", "subway", "subway_lines", "redev", "insights", "hdong_geo"];

// Loads every data file independently so light screens render before the big map files arrive.
export function useData() {
  const [data, setData] = useState({});
  const [errors, setErrors] = useState({});
  useEffect(() => {
    FILES.forEach((f) => {
      fetch(`data/${f}.json`)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then((j) => setData((d) => ({ ...d, [f]: j })))
        .catch((e) => setErrors((x) => ({ ...x, [f]: String(e) })));
    });
  }, []);
  return { data, errors };
}

export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export const palette = (dark) => dark
  ? { primary: "#3CCBA6", amber: "#F0A63C", indigo: "#8EA0F0", rose: "#F2836B", muted: "#3A4542", faint: "#26302D", none: "#141A18", grid: "#26302D", axis: "#56625E", text: "#9AA8A3", fg: "#E6ECEA", panel: "#18201D" }
  : { primary: "#0B7A64", amber: "#C77A12", indigo: "#4F63C9", rose: "#C2410C", muted: "#CBD5D2", faint: "#E3ECE9", none: "#F1F3F2", grid: "#E7ECEA", axis: "#B5C0BC", text: "#5E6B67", fg: "#16201D", panel: "#FFFFFF" };

export function won(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  v = Number(v);
  const neg = v < 0; v = Math.abs(v);
  const s = v >= 10000 ? (Math.round(v / 1000) / 10).toFixed(1).replace(/\.0$/, "") + "억" : Math.round(v).toLocaleString("ko-KR") + "만";
  return (neg ? "-" : "") + s;
}
export const fmt = {
  won,
  pct: (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}%`),
  pp: (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Number(v).toFixed(2)}%p`),
  share: (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`),
  rate: (v) => (v == null ? "—" : `${Number(v).toFixed(2)}%`),
  int: (v) => (v == null ? "—" : Number(v).toLocaleString("ko-KR")),
  cnt: (v) => (v == null ? "—" : `${Number(v).toLocaleString("ko-KR")}건`),
  min: (v) => (v == null ? "—" : `${v}분`),
  dens: (v) => (v == null ? "—" : `${Math.round(v).toLocaleString("ko-KR")}건/㎢`),
  text: (v) => (v == null ? "—" : String(v)),
};

export function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((x, i) => Math.round(x + (B[i] - x) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join("");
}

export const LTV = 0.7, DSR = 0.4, STRESS = 3, YEARS = 30;
export const annuity = (rate, years = YEARS) => { const r = rate / 1200, n = years * 12; return r ? r / (1 - Math.pow(1 + r, -n)) : 1 / n; };
export const loanCap = (price) => (price <= 150000 ? 60000 : price <= 250000 ? 40000 : 20000);

// Figures derived from the loaded files (shown in the summary strip and strategy cards).
export function derive(d) {
  const out = {};
  if (d.rates) {
    const a = d.rates.at(-1), b = d.rates.at(-2);
    out.rateNow = { month: a.month, pct: a.mortgage_pct, change: Math.round((a.mortgage_pct - b.mortgage_pct) * 100) / 100 };
  }
  if (d.budget && d.rates) {
    const k = annuity(d.rates.at(-1).mortgage_pct);
    out.pay = Object.fromEntries(d.budget.map((b) => [b.scenario, { loan: b.loan_10k, monthly: Math.round(b.loan_10k * k) }]));
    const n = d.budget.find((x) => x.scenario === "now"), l = d.budget.find((x) => x.scenario === "later");
    out.ratio = Math.round((l.max_price_10k / n.max_price_10k) * 10) / 10;
  }
  if (d.monthly) {
    const s = d.monthly.filter((r) => r.gu === "서울 전체" && !r.partial), a = s.at(-1), b = s.at(-2);
    out.market = { month: a.month, trades: a.trades, change: Math.round(((a.trades - b.trades) / b.trades) * 1000) / 10 };
  }
  if (d.gu_summary) {
    const near = d.gu_summary.filter((r) => r.commute_min_est <= 45);
    out.fitLater = [...near].sort((a, b) => b.share_later_band_pct - a.share_later_band_pct).slice(0, 5);
    out.fitNow = [...near].sort((a, b) => b.share_now_band_pct - a.share_now_band_pct).slice(0, 5);
  }
  return out;
}
