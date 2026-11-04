import { useEffect, useState } from "react";

export const FILES = ["strategy", "gu_summary", "monthly", "seoul_geo", "dong_geo", "dong_summary", "apts", "rates", "loan_market", "policy", "subway", "subway_lines", "redev", "insights", "hdong_geo", "market", "region_stats", "landuse_region", "school_region", "edu_region", "apt_cost", "bldg"];

/* ---------- 직장: each viewer picks their own (saved with 내 조건) ---------- */
export const WORKPLACES = [["광화문", 126.9769, 37.5759], ["시청·을지로", 126.9849, 37.5663], ["강남역", 127.0276, 37.4979], ["삼성·코엑스", 127.0592, 37.5121],
  ["여의도", 126.9244, 37.5216], ["판교", 127.1112, 37.3948], ["마곡", 126.8325, 37.5603], ["구로·가산디지털단지", 126.8973, 37.4815], ["성수", 127.0557, 37.5446],
  ["용산", 126.9648, 37.5299], ["상암DMC", 126.8892, 37.5776], ["잠실", 127.1, 37.5133]].map(([name, lon, lat]) => ({ name, lon, lat }));
export const DEFAULT_WORK = WORKPLACES[0];
export const workState = { ...DEFAULT_WORK };  // the current viewer's workplace, set by App from 내 조건
export const kmTo = (a, w = workState) => (a?.lon == null || w?.lon == null ? null : 6371 * Math.hypot(((a.lon - w.lon) * Math.PI / 180) * Math.cos(((a.lat + w.lat) / 2) * Math.PI / 180), ((a.lat - w.lat) * Math.PI / 180)));
// rough door-to-door public-transit minutes from straight-line distance (walk + wait + ride); shown as 추정
export const estCommute = (km) => (km == null ? null : Math.round(12 + km * 2.6));
const isODsayWork = (w) => Math.abs(w.lon - DEFAULT_WORK.lon) < 1e-4 && Math.abs(w.lat - DEFAULT_WORK.lat) < 1e-4;

// Give every region a commute time to the viewer's workplace. ODsay transit times exist only for 광화문 (exact per 행정동,
// a trade-weighted median for larger areas); any other workplace, or no ODsay data, uses the distance estimate from the
// region's centre. keyOf maps a complex to each level's region key.
export function attachCommute(ins, apts, commute, work = workState) {
  const tag = `${work.lon},${work.lat}`;
  if (!ins || ins.__commute === tag) return ins;
  Object.defineProperty(ins, "__commute", { value: tag, configurable: true, writable: true });
  if (!apts || !commute || !Object.keys(commute).length || !isODsayWork(work)) {
    Object.entries(ins).forEach(([lv, tbl]) => { if (lv !== "meta" && typeof tbl === "object") Object.values(tbl).forEach((r) => { r.commute = r.center ? estCommute(kmTo({ lon: r.center[0], lat: r.center[1] }, work)) : null; r.commuteEst = true; }); });
    return ins;
  }
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
  return ins;
}

// Zoning mix of each region's apartment complexes (households-weighted), from landuse_region.json
// Per-region extras from their own files, put on each region record under a short name:
// lu = 용도지역 mix, sch = 초등학교 거리, edu = 학원·학군, cost = 관리비
export const regionFilesOf = (d) => ({ lu: d.landuse_region, sch: d.school_region, edu: d.edu_region, cost: d.apt_cost?.region, bldg: d.bldg?.region });
export function attachRegions(ins, files) {
  if (!ins) return ins;
  const seen = ins.__files || {};
  const fresh = Object.entries(files).filter(([n, f]) => f && seen[n] !== f);
  if (!fresh.length) return ins;
  Object.entries(ins).forEach(([lv, tbl]) => {
    if (lv === "meta" || typeof tbl !== "object") return;
    Object.entries(tbl).forEach(([k, r]) => { fresh.forEach(([n, f]) => { if (f[lv]) r[n] = f[lv][k] || null; }); });
  });
  Object.defineProperty(ins, "__files", { value: { ...seen, ...Object.fromEntries(fresh) }, configurable: true, writable: true });
  return ins;
}

// Where data files come from. The website serves its own data/ next to the page. The 앱인토스 bundle reads the
// website's copy (refreshed every morning) so new data needs no app update, and falls back to the copy packed in the
// bundle when the site is slow or unreachable.
const REMOTE = typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS === "1" ? "https://whereismyhouse.kr/data/" : null;
export function getData(name) {
  const local = () => fetch(`data/${name}.json`).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  if (!REMOTE) return local();
  const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), 6000);
  return fetch(`${REMOTE}${name}.json`, { signal: ctl?.signal, cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .catch(() => local())
    .finally(() => clearTimeout(timer));
}

// Android back / swipe-back closes an open dialog instead of leaving the app: opening pushes a history entry,
// back pops it and closes; closing from the dialog itself removes that entry again.
export function useBackToClose(open, onClose) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    let poppedByBack = false;
    history.pushState({ hbDialog: true }, "", location.href);
    const onPop = () => { poppedByBack = true; onClose(); };
    // capture phase: Next's router also listens to popstate on window and stops other bubble listeners
    window.addEventListener("popstate", onPop, true);
    return () => {
      window.removeEventListener("popstate", onPop, true);
      if (!poppedByBack && history.state?.hbDialog) history.back();
    };
  }, [open]);
}

// Large per-complex files load once, on first use, and are shared by every panel.
const lazy = {};
export function useLazyFile(name, when = true) {
  const [v, setV] = useState(lazy[name]?.value ?? null);
  useEffect(() => {
    if (!when || v) return;
    lazy[name] ||= { p: getData(name).catch(() => ({})) };
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
      getData(f)
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
// own*: a home the viewer already has and would sell to move (갈아타기); off by default
export const DEFAULT_PROFILE = { work: DEFAULT_WORK, household: "plan", income: 5000, cash: 10000, saving: 200, marry: 3, partnerIncome: 5000, partnerCash: 8000, partnerSaving: 150, firstHome: true, rate: null,
  own: false, ownValue: 80000, ownBought: 60000, ownYear: 2019, ownLived: 3, ownLoan: 30000, ownRepay: 80, ownGrowth: 2, example: true };
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
// 학교 아이콘 (학사모) and colours: 초등학교 green, 중학교 indigo
export const SCHOOL_COLOR = { e: "#2E9F86", m: "#4F63C9" };
export const CAP_SVG = (size = 12) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="#fff" d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3zm-7 9.2V16c0 1.9 3.1 3.5 7 3.5s7-1.6 7-3.5v-3.8l-7 3.8-7-3.8z"/></svg>`;
export const shortSchool = (n) => n.replace(/^서울|^경기/, "").replace(/초등학교$/, "초").replace(/중학교$/, "중");
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

/* ---------- 집 살 때·가진 동안·팔 때 드는 돈 (만원). Rough 2026 rules for one home in Seoul; each screen says so. ---------- */
// 취득세 + 지방교육세 (+ 농특세 over 85㎡), 1주택 세율. 일시적 2주택(종전 집을 3년 안에 팔면)도 같은 세율. 생애최초는 12억 이하면 200만원까지 감면.
export function acqTax(P, { area = 84, first = false } = {}) {
  const r = P <= 60000 ? 1 : P <= 90000 ? (P / 10000) * (2 / 3) - 3 : 3;  // %
  const tax = (P * r) / 100, edu = tax * 0.1, farm = area > 85 ? P * 0.002 : 0;
  const cut = first && P <= 120000 ? Math.min(200, tax) : 0;
  return { total: Math.round(tax + edu + farm - cut), rate: Math.round(r * 100) / 100, tax: Math.round(tax), edu: Math.round(edu), farm: Math.round(farm), cut: Math.round(cut) };
}
// 중개보수 법정 상한 (매매, 부가세 별도)
export function brokerFee(P) {
  const [r, cap] = P < 5000 ? [0.006, 25] : P < 20000 ? [0.005, 80] : P < 90000 ? [0.004, Infinity] : P < 120000 ? [0.005, Infinity] : P < 150000 ? [0.006, Infinity] : [0.007, Infinity];
  return { total: Math.round(Math.min(P * r, cap)), rate: Math.round(r * 1000) / 10 };
}
// 재산세 1년치: 공시가격 ≈ 시세 × 69%, 1주택 공정시장가액비율 43~45%, 공시 9억 이하는 1주택 특례세율. + 도시지역분 0.14% + 지방교육세 20%.
export const PUBLIC_RATIO = 0.69;
export function propTax(P) {
  const pub = P * PUBLIC_RATIO, base = pub * (pub <= 30000 ? 0.43 : pub <= 60000 ? 0.44 : 0.45), special = pub <= 90000;
  const steps = special ? [[6000, 0.0005, 0], [15000, 0.001, 3], [30000, 0.002, 12], [Infinity, 0.0035, 42]] : [[6000, 0.001, 0], [15000, 0.0015, 6], [30000, 0.0025, 19.5], [Infinity, 0.004, 57]];
  let tax = 0, lo = 0;
  for (const [hi, r, acc] of steps) { if (base <= hi) { tax = acc + (base - lo) * r; break; } lo = hi; }
  return { total: Math.round(tax * 1.2 + base * 0.0014), pub: Math.round(pub), comp: pub > 120000 };  // comp: 종합부동산세 대상 (1주택 공시 12억 초과), not included
}
// 양도소득세 (+ 지방소득세 10%) on selling one home. 1세대1주택 비과세 = 2년 보유 + 2년 거주 (서울 조정지역 취득 기준), 12억 초과분만 과세.
const PROG = [[1400, 0.06, 0], [5000, 0.15, 126], [8800, 0.24, 576], [15000, 0.35, 1544], [30000, 0.38, 1994], [50000, 0.4, 2594], [100000, 0.42, 3594], [Infinity, 0.45, 6594]];
export function gainTax(sale, cost, hold, lived) {
  const fee = brokerFee(sale).total, gain = sale - cost - fee;
  if (gain <= 0) return { total: 0, gain: Math.round(gain), note: "차익 없음" };
  const exempt = hold >= 2 && lived >= 2;
  if (exempt && sale <= 120000) return { total: 0, gain: Math.round(gain), note: "1주택 비과세 (2년 보유·거주, 12억 이하)" };
  const taxable = exempt ? (gain * (sale - 120000)) / sale : gain;
  if (hold < 2) { const r = hold < 1 ? 0.7 : 0.6; return { total: Math.round(Math.max(0, taxable - 250) * r * 1.1), gain: Math.round(gain), note: `보유 ${hold < 1 ? "1년 미만 70%" : "2년 미만 60%"} 단일세율` }; }
  const ded = hold < 3 ? 0 : exempt ? Math.min(0.8, Math.min(hold, 10) * 0.04 + Math.min(lived, 10) * 0.04) : Math.min(0.3, hold * 0.02);
  const base = Math.max(0, taxable * (1 - ded) - 250), [, r, acc] = PROG.find(([hi]) => base <= hi);
  return { total: Math.round(Math.max(0, base * r - acc) * 1.1), gain: Math.round(gain), note: `${exempt ? "12억 초과분만 과세" : "1주택 비과세 요건(2년 보유·거주) 미충족"}${ded ? ` · 장기보유공제 ${Math.round(ded * 100)}%` : ""}` };
}
// selling the home the viewer has, t years from now: what is left after the loan, 양도세 and 중개보수
export function saleNet(p, t = 0) {
  if (!p.own) return null;
  const year = new Date().getFullYear(), g = (Number(p.ownGrowth) || 0) / 100;
  const value = Math.round((p.ownValue || 0) * Math.pow(1 + g, t)), loan = Math.max(0, (p.ownLoan || 0) - (p.ownRepay || 0) * 12 * t);
  const hold = Math.max(0, year + t - (Number(p.ownYear) || year)), lived = (Number(p.ownLived) || 0) > 0 ? Number(p.ownLived) + t : 0;
  const tax = gainTax(value, p.ownBought || 0, hold, lived), fee = brokerFee(value).total;
  return { value, loan, tax: tax.total, taxNote: tax.note, gain: tax.gain, fee, hold, lived, net: Math.max(0, value - loan - tax.total - fee) };
}
// everything up front for one purchase, the loan it needs, and the monthly / yearly costs after
export function buyPlan(P, { cash = 0, income = 0, rate = 4.5, first = false, area = 84 } = {}) {
  const acq = acqTax(P, { area, first }), fee = brokerFee(P), upfront = acq.total + fee.total;
  const ltv = first ? LTV : 0.4, lims = [[`LTV ${Math.round(ltv * 100)}%${first ? " (생애최초)" : ""}`, P * ltv], ["주담대 상한", loanCap(P)], ["DSR 40%", (income * DSR) / (annuity(rate + STRESS) * 12)]];
  const maxLoan = Math.min(...lims.map((l) => l[1])), need = Math.max(0, P + upfront - cash), loan = Math.min(need, maxLoan);
  const mon = loan * annuity(rate), int1 = (loan * rate) / 1200, prop = propTax(P);
  return { acq, fee, upfront, need, maxLoan, bind: lims.find((l) => l[1] === maxLoan)[0], ok: need <= maxLoan, loan, mon, int1, totalInt: mon * YEARS * 12 - loan, prop, lims };
}

// Highest price the cash + allowed loan can cover after 취득세·중개보수
function maxPrice(cash, income, rate, firstHome) {
  const ltv = firstHome ? LTV : 0.4, dsrLoan = (income * DSR) / (annuity(rate + STRESS) * 12);
  const loanAt = (P) => Math.min(P * ltv, loanCap(P), dsrLoan);
  const upfront = (P) => acqTax(P, { first: firstHome }).total + brokerFee(P).total;
  for (let P = 300000; P >= 5000; P -= 500) if (P + upfront(P) <= cash + loanAt(P)) {
    const lims = [["LTV " + Math.round(ltv * 100) + "%" + (firstHome ? " (생애최초)" : ""), P * ltv], ["주담대 한도 " + won(loanCap(P)), loanCap(P)], ["스트레스 DSR 40%", dsrLoan]];
    const loan = Math.min(...lims.map((l) => l[1]));
    return { P, loan: Math.round(Math.min(loan, Math.max(0, P + upfront(P) - cash))), binding: lims.find((l) => l[1] === loan)[0], dsrLoan: Math.round(dsrLoan), ltvLoan: Math.round(P * ltv) };
  }
  return { P: Math.max(0, Math.round(cash / 1.015)), loan: 0, binding: "현금만", dsrLoan: Math.round(dsrLoan), ltvLoan: 0 };
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
  // a home they already have is sold first (갈아타기): what is left joins the cash, and 생애최초 no longer applies
  const first = p.firstHome && !p.own, saleN = saleNet(p, 0), saleL = saleNet(p, yrs);
  const cashN = p.cash + (twoNow ? p.partnerCash : 0) + (saleN?.net || 0), incomeN = p.income + (twoNow ? p.partnerIncome : 0);
  const now = maxPrice(cashN, incomeN, r, first);
  const cashL = p.cash + p.saving * 12 * yrs + (twoLater ? p.partnerCash + p.partnerSaving * 12 * yrs : 0) + (saleL?.net || 0);
  const incomeL = p.income + (twoLater ? p.partnerIncome : 0);
  const later = maxPrice(cashL, incomeL, r, first);
  const note = (cash, n, sale) => `현금 ${won(cash)}${sale ? ` (지금 집 판 돈 ${won(sale.net)} 포함)` : ""}에서 취득세·중개보수를 빼고, 금리 ${r}% + 스트레스 3%p, 30년 상환으로 계산${n ? ` (저축 ${n}년 반영)` : ""}`;
  const who = (two) => (two ? " 둘이" : "");
  return [
    { scenario: "now", label: `지금${who(twoNow)} 사면`, short: `지금${who(twoNow)}`, income_10k: incomeN, cash_10k: cashN, loan_10k: now.loan, max_price_10k: now.P, binding: now.binding, loan_dsr_10k: now.dsrLoan, note: note(cashN, 0, saleN), first, rate: r, sale: saleN },
    { scenario: "later", label: yrs ? `${yrs}년 뒤${who(twoLater)} 사면` : `지금${who(twoLater)} 사면`, short: yrs ? `${yrs}년 뒤${who(twoLater)}` : `지금${who(twoLater)}`, years: yrs, income_10k: incomeL, cash_10k: cashL, loan_10k: later.loan, max_price_10k: later.P, binding: later.binding, loan_dsr_10k: later.dsrLoan, note: note(cashL, yrs, saleL), first, rate: r, sale: saleL },
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
