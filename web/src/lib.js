import { useEffect, useState } from "react";

export const FILES = ["strategy", "gu_summary", "monthly", "complexes", "seoul_geo", "dong_geo", "dong_summary", "apts", "rates", "loan_market", "policy", "subway", "subway_lines", "redev", "insights", "hdong_geo", "market", "region_stats", "commute", "landuse_region"];

// Give every region a transit time to 광화문: exact for a 행정동, otherwise the trade-weighted median
// of the 행정동 its traded complexes sit in. keyOf maps a complex to each level's region key.
export function attachCommute(ins, apts, commute) {
  if (!ins || !apts || !commute || ins.__commute) return ins;
  const keyOf = { gu: (a) => a.gu, sgg: (a) => a.sgg, bdong: (a) => `${a.gu} ${a.dong}` };
  Object.entries(ins).forEach(([lv, tbl]) => {
    if (lv === "meta" || typeof tbl !== "object") return;
    if (lv === "hdong") { Object.entries(tbl).forEach(([k, r]) => { r.commute = commute[k]?.min ?? null; }); return; }
    const f = keyOf[lv]; if (!f) return;
    const acc = {};
    apts.forEach((a) => { const c = commute[a.hcode]; if (c && a.trades_6m) (acc[f(a)] ||= []).push([c.min, a.trades_6m]); });
    Object.entries(tbl).forEach(([k, r]) => {
      const xs = (acc[k] || []).sort((x, y) => x[0] - y[0]); let half = xs.reduce((s, x) => s + x[1], 0) / 2;
      r.commute = xs.length ? xs.find((x) => (half -= x[1]) <= 0)[0] : null;
    });
  });
  Object.defineProperty(ins, "__commute", { value: true });
  return ins;
}

// Zoning mix of each region's apartment complexes (households-weighted), from landuse_region.json
export function attachLanduse(ins, lr) {
  if (!ins || !lr || ins.__lu === lr) return ins;
  Object.entries(ins).forEach(([lv, tbl]) => { if (lv !== "meta" && typeof tbl === "object" && lr[lv]) Object.entries(tbl).forEach(([k, r]) => { r.lu = lr[lv][k] || null; }); });
  Object.defineProperty(ins, "__lu", { value: lr, configurable: true, writable: true });
  return ins;
}

// Large per-complex files load once, on first use, and are shared by every panel.
const lazy = {};
export function useLazyFile(name, when = true) {
  const [v, setV] = useState(lazy[name]?.value ?? null);
  useEffect(() => {
    if (!when || v) return;
    lazy[name] ||= { p: fetch(`data/${name}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})) };
    lazy[name].p.then((j) => { lazy[name].value = j; setV(j); });
  }, [name, when, v]);
  return v;
}

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

/* ---------- 내 조건: each viewer's own numbers, kept only in their browser ---------- */
// Example values a first-time visitor sees; nothing about the person who built the app.
export const DEFAULT_PROFILE = { household: "plan", income: 5000, cash: 10000, saving: 200, marry: 3, partnerIncome: 5000, partnerCash: 8000, partnerSaving: 150, firstHome: true, rate: null, example: true };
const PKEY = "hb-profile-v1";
export function useProfile() {
  const [p, setP] = useState(() => { try { return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(PKEY) || "{}") }; } catch (e) { return DEFAULT_PROFILE; } });
  const save = (next) => { const v = { ...p, ...next, example: false }; setP(v); try { localStorage.setItem(PKEY, JSON.stringify(v)); } catch (e) { /* private window: keep in memory */ } };
  const reset = () => { setP(DEFAULT_PROFILE); try { localStorage.removeItem(PKEY); } catch (e) { /* ignore */ } };
  return [p, save, reset];
}

// "지도에서 위치 보기": the 청약 card asks the map to open on a notice; the map may mount after the request, so it is kept here
export const pendingFocus = { apply: null };
export function focusApply(r) { pendingFocus.apply = r; window.dispatchEvent(new CustomEvent("hb:focus-apply", { detail: r })); }
// 청약 접수까지 남은 날
export const dday = (d) => { if (!d) return null; const n = Math.round((Date.parse(d) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5); return n > 0 ? `D-${n}` : n === 0 ? "D-day" : "접수 중"; };

/* ---------- 관심 단지: saved per browser, shared live by every component that shows it ---------- */
const WKEY = "hb-watch-v1", wsubs = new Set();
let watchVal = (() => { try { return JSON.parse(localStorage.getItem(WKEY) || "{}"); } catch (e) { return {}; } })();
export function useWatch() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((x) => x + 1); wsubs.add(f); return () => wsubs.delete(f); }, []);
  const set = (next) => { watchVal = next; try { localStorage.setItem(WKEY, JSON.stringify(next)); } catch (e) { /* private window: keep in memory */ } wsubs.forEach((f) => f()); };
  // remembers the size and price at the moment of saving, so the list can show the change since
  const toggle = (apt, area, price) => {
    const n = { ...watchVal };
    if (n[apt.id]) delete n[apt.id];
    else n[apt.id] = { savedAt: new Date().toISOString().slice(0, 10), area, price, name: apt.apt, gu: apt.gu, dong: apt.dong, sido: apt.sido || "11" };
    set(n);
  };
  return [watchVal, toggle, set];
}

// Highest price the cash + allowed loan can cover, with 2.5% purchase costs (취득세·중개비 등).
export const COSTS = 0.025;
function maxPrice(cash, income, rate, firstHome) {
  const ltv = firstHome ? LTV : 0.4, dsrLoan = (income * DSR) / (annuity(rate + STRESS) * 12);
  const loanAt = (P) => Math.min(P * ltv, loanCap(P), dsrLoan);
  for (let P = 300000; P >= 5000; P -= 500) if (P * (1 + COSTS) <= cash + loanAt(P)) {
    const lims = [["LTV " + Math.round(ltv * 100) + "%" + (firstHome ? " (생애최초)" : ""), P * ltv], ["주담대 한도 " + won(loanCap(P)), loanCap(P)], ["스트레스 DSR 40%", dsrLoan]];
    const loan = Math.min(...lims.map((l) => l[1]));
    return { P, loan: Math.round(Math.min(loan, P * (1 + COSTS) - cash > 0 ? P * (1 + COSTS) - cash : 0)), binding: lims.find((l) => l[1] === loan)[0], dsrLoan: Math.round(dsrLoan), ltvLoan: Math.round(P * ltv) };
  }
  return { P: Math.max(0, Math.round(cash / (1 + COSTS))), loan: 0, binding: "현금만", dsrLoan: Math.round(dsrLoan), ltvLoan: 0 };
}
// 가구 형태: 혼자 / 결혼 예정 (N년 뒤 합가) / 이미 기혼·맞벌이. Older saved profiles have no household: infer it from the plan.
export const HOUSEHOLDS = [["single", "혼자"], ["plan", "결혼 예정"], ["married", "기혼·맞벌이"]];
export const householdOf = (p) => p.household || (Number(p.marry) ? "plan" : "single");
// Same shape as the old budget.json rows, so every screen keeps reading data.budget.
//   now   = buying today: me, or both of us if already married
//   later = buying in N years with N years of saving: both of us unless single
export function budgetsFrom(p, rate) {
  const r = p.rate || rate || 4.5, hh = householdOf(p);
  const yrs = Math.max(0, Number(p.marry) || 0), twoNow = hh === "married", twoLater = hh !== "single";
  const cashN = p.cash + (twoNow ? p.partnerCash : 0), incomeN = p.income + (twoNow ? p.partnerIncome : 0);
  const now = maxPrice(cashN, incomeN, r, p.firstHome);
  const cashL = p.cash + p.saving * 12 * yrs + (twoLater ? p.partnerCash + p.partnerSaving * 12 * yrs : 0);
  const incomeL = p.income + (twoLater ? p.partnerIncome : 0);
  const later = maxPrice(cashL, incomeL, r, p.firstHome);
  const note = (cash, n) => `현금 ${won(cash)}에서 취득 비용 2.5%를 빼고, 금리 ${r}% + 스트레스 3%p, 30년 상환으로 계산${n ? ` (저축 ${n}년 반영)` : ""}`;
  const who = (two) => (two ? " 둘이" : "");
  return [
    { scenario: "now", label: `지금${who(twoNow)} 사면`, short: `지금${who(twoNow)}`, income_10k: incomeN, cash_10k: cashN, loan_10k: now.loan, max_price_10k: now.P, binding: now.binding, loan_dsr_10k: now.dsrLoan, note: note(cashN, 0) },
    { scenario: "later", label: yrs ? `${yrs}년 뒤${who(twoLater)} 사면` : `지금${who(twoLater)} 사면`, short: yrs ? `${yrs}년 뒤${who(twoLater)}` : `지금${who(twoLater)}`, years: yrs, income_10k: incomeL, cash_10k: cashL, loan_10k: later.loan, max_price_10k: later.P, binding: later.binding, loan_dsr_10k: later.dsrLoan, note: note(cashL, yrs) },
  ];
}
// share of trades at or under a budget, from a region's 21-point price distribution
export function shareBelow(q, B) {
  if (!q || B == null) return null;
  if (B < q[0]) return 0;
  if (B >= q[20]) return 100;
  for (let i = 0; i < 20; i++) if (B < q[i + 1]) return Math.round((i + (q[i + 1] > q[i] ? (B - q[i]) / (q[i + 1] - q[i]) : 0)) * 50) / 10;
  return 100;
}
export const fitState = { budget: 100000 };

/* ---------- N년 뒤: each region's prices grown at its own recent pace, against my later budget ---------- */
export const GROWTH = [["full", "최근 1년 속도로 오르면"], ["half", "그 절반 속도면"], ["flat", "안 오르면"]];
export const futureState = { growth: "half", years: 3, budget: 100000 };
// yearly change per region: its own 1-year same-unit change, else its 구/시군구's, else the median 구/시군구
export function attachGrowth(ins) {
  if (!ins || ins.__growth) return ins;
  const tops = Object.values(ins.gu || ins.sgg || {}).map((r) => r.p12?.chg).filter((v) => v != null).sort((a, b) => a - b);
  const mid = tops.length ? tops[Math.floor(tops.length / 2)] : 5;
  Object.entries(ins).forEach(([lv, tbl]) => {
    if (lv === "meta" || typeof tbl !== "object") return;
    Object.values(tbl).forEach((r) => { const up = lv === "gu" || lv === "sgg" ? null : ins.gu?.[r.gu] || ins.sgg?.[r.sgg]; r.g12 = r.p12?.chg ?? up?.p12?.chg ?? mid; });
  });
  Object.defineProperty(ins, "__growth", { value: true });
  return ins;
}
export const growthMult = (g, mode = futureState.growth, years = futureState.years) => Math.pow(1 + (mode === "flat" ? 0 : mode === "half" ? g / 2 : g) / 100, years);
export function futureShare(r, p, B = futureState.budget) {
  const q = r?.[p]?.q; if (!q || r.g12 == null) return null;
  const k = growthMult(r.g12); return shareBelow(q.map((x) => x * k), B);
}  // the map's budget slider; read by the "내 예산 비중" metric
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
