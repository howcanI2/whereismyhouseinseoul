// 급지: this site's own grade from 최근 1년 실거래 평당가. 법정동 with 30+ trades in a year are ranked and cut into
// five equal groups (1급지 = top fifth); each 구 is graded on the same cut-offs so 동 and 구 read on one ruler.
// Pure function of the shared data files, used by the app card (TierRank) and the static /tiers/ page alike.
export const MIN_YEAR = 30;

function grade(rows) {
  const s = [...rows].sort((a, b) => b.ppp - a.ppp), n = s.length, tier = new Map();
  s.forEach((r, i) => tier.set(r.key, Math.min(5, 1 + Math.floor((i * 5) / n))));
  const cut = [1, 2, 3, 4, 5].map((k) => { const m = s.filter((r) => tier.get(r.key) === k); return { k, lo: m.at(-1)?.ppp, hi: m[0]?.ppp }; });
  return { tier, cut };
}

export function buildTiers(ins, ds, gs) {
  if (!ins?.bdong || !ins?.gu || !ds || !gs) return null;
  const dsum = new Map(ds.map((r) => [r.id, r]));
  const dongs = Object.entries(ins.bdong)
    .filter(([, r]) => (r.p12?.n || 0) >= MIN_YEAR && r.p12?.ppp)
    .map(([key, r]) => {
      const s = dsum.get(key) || {};
      return { key, name: r.name, gu: r.gu, ppp: r.p12.ppp, n12: r.p12.n, n6: s.trades_6m ?? r.p6?.n ?? 0, m84: s.median_84_10k, m59: s.median_59_10k, q: r.p6?.q, center: r.center };
    });
  // 구 centre (for commute filters): the mean of its graded 동 centres
  const cen = {};
  dongs.forEach((d) => { if (!d.center) return; const c = (cen[d.gu] ||= [0, 0, 0]); c[0] += d.center[0]; c[1] += d.center[1]; c[2]++; });
  const gsum = new Map(gs.map((r) => [r.gu, r]));
  const gus = Object.entries(ins.gu).filter(([, r]) => r.p12?.ppp).map(([key, r]) => {
    const s = gsum.get(key) || {}, c = cen[key];
    return { key, name: key, gu: key, ppp: r.p12.ppp, n12: r.p12.n, n6: r.p6?.n || 0, m84: s.median_84_10k ?? r.p6?.p84, m59: s.median_59_10k, q: r.p6?.q, center: c ? [c[0] / c[2], c[1] / c[2]] : null };
  });
  const dg = grade(dongs), byPrice = (ppp) => (dg.cut.find((c) => c.lo != null && ppp >= c.lo) || { k: 5 }).k;
  const gtier = new Map(gus.map((g) => [g.key, byPrice(g.ppp)]));
  return { dong: { rows: dongs, ...dg }, gu: { rows: gus, tier: gtier, cut: dg.cut } };
}

export const median = (xs) => { const v = xs.filter(Boolean).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
export const man = (v) => (v == null ? "–" : `${Math.round(v).toLocaleString("ko-KR")}만`);
export const tierRange = (c) => (c.k === 5 ? `${man(c.hi)} 이하` : c.k === 1 ? `${man(c.lo)} 이상` : `${man(c.lo)}~${man(c.hi)}`);
