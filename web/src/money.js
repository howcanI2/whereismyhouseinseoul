// Money rules with no React: 예산 상한, 취득세·중개보수·재산세, 양도세, 대출. Shared by the app (through lib.js)
// and by the static guide pages, which run these same functions at build time so their example numbers match the app.
export function won(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return "—";
  v = Number(v);
  const neg = v < 0; v = Math.abs(v);
  const s = v >= 10000 ? (Math.round(v / 1000) / 10).toFixed(1).replace(/\.0$/, "") + "억" : Math.round(v).toLocaleString("ko-KR") + "만";
  return (neg ? "-" : "") + s;
}

export const LTV = 0.7, DSR = 0.4, STRESS = 3, YEARS = 30;

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
// 2년 거주 요건 applies only to a home bought while its area was a 조정대상지역 (서울: all 구 2017.8 ~ 2022.12 and from
// 2025.10; 2023.1 ~ 2025.9 only 강남·서초·송파·용산; none before 2017.8). Month precision; unknown 구 → assume it applies.
const STRICT_GU = ["강남구", "서초구", "송파구", "용산구"];
export function needsResidence(gu, y, m) {
  const ym = y * 100 + (m || 6);
  if (ym < 201708) return false;
  if (ym >= 201708 && ym < 202301) return true;
  if (ym >= 202510) return true;
  return gu ? STRICT_GU.includes(gu) : true;
}
// sale: 판 가격, cost: 산 가격, hold / lived: full years, needRes: 2년 거주 요건 applies
export function gainTax(sale, cost, hold, lived, needRes = true) {
  // 필요경비: 산 쪽 취득세·중개보수와 판 쪽 중개보수
  const exp = acqTax(cost).total + brokerFee(cost).total + brokerFee(sale).total, gain = sale - cost - exp;
  if (gain <= 0) return { total: 0, gain: Math.round(gain), note: "차익 없음" };
  const exempt = hold >= 2 && (!needRes || lived >= 2);
  const why = needRes ? "2년 보유·거주" : "2년 보유, 살 때 비조정지역이라 거주 요건 없음";
  if (exempt && sale <= 120000) return { total: 0, gain: Math.round(gain), note: `1주택 비과세 (${why}, 12억 이하)` };
  const taxable = exempt ? (gain * (sale - 120000)) / sale : gain;
  if (hold < 2) { const r = hold < 1 ? 0.7 : 0.6; return { total: Math.round(Math.max(0, taxable - 250) * r * 1.1), gain: Math.round(gain), note: `보유 ${hold < 1 ? "1년 미만 70%" : "2년 미만 60%"} 단일세율` }; }
  // 장기보유특별공제: 비과세 대상 1주택 + 2년 이상 거주면 보유 4%·거주 4% (최대 80%), 아니면 보유 2% (최대 30%); 3년 미만은 없음
  const ded = hold < 3 ? 0 : exempt && lived >= 2 ? Math.min(0.8, Math.min(hold, 10) * 0.04 + Math.min(lived, 10) * 0.04) : Math.min(0.3, hold * 0.02);
  const base = Math.max(0, taxable * (1 - ded) - 250), [, r, acc] = PROG.find(([hi]) => base <= hi);
  return { total: Math.round(Math.max(0, base * r - acc) * 1.1), gain: Math.round(gain),
    note: `${exempt ? "12억 초과분만 과세" : `1주택 비과세 요건(${needRes ? "2년 보유·거주" : "2년 보유"}) 미충족`}${ded ? ` · 장기보유공제 ${Math.round(ded * 100)}%` : ""}` };
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
export function maxPrice(cash, income, rate, firstHome) {
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

// share of trades at or under a budget, from a region's 21-point price distribution
export function shareBelow(q, B) {
  if (!q || B == null) return null;
  if (B < q[0]) return 0;
  if (B >= q[20]) return 100;
  for (let i = 0; i < 20; i++) if (B < q[i + 1]) return Math.round((i + (q[i + 1] > q[i] ? (B - q[i]) / (q[i + 1] - q[i]) : 0)) * 50) / 10;
  return 100;
}

export const annuity = (rate, years = YEARS) => { const r = rate / 1200, n = years * 12; return r ? r / (1 - Math.pow(1 + r, -n)) : 1 / n; };
export const loanCap = (price) => (price <= 150000 ? 60000 : price <= 250000 ? 40000 : 20000);

// What it takes to buy at price P: 취득세·중개보수, the largest loan the rules allow (LTV and 주담대 상한, before DSR),
// the cash that leaves to bring, and the yearly income at which 스트레스 DSR 40% still allows that loan.
export function needFor(P, rate, first = true, area = 84) {
  const ltv = first ? LTV : 0.4, acq = acqTax(P, { area, first }).total, fee = brokerFee(P).total;
  const loan = Math.min(P * ltv, loanCap(P)), cash = P + acq + fee - loan;
  const income = (loan * annuity(rate + STRESS) * 12) / DSR, monthly = loan * annuity(rate);
  return { P, acq, fee, loan: Math.round(loan), cash: Math.round(cash), income: Math.round(income), monthly: Math.round(monthly), ltv };
}
