// One static page per 서울 구: 시세 요약, 동별·단지별 거래, 최근 신고가·급매. Plain server-rendered HTML (no app JS needed),
// so Naver/Google can index "마포구 아파트 실거래가" style searches; the app link takes visitors to the budget tools.
import { GU, guData, nameOf, readJson, won, pct } from "../data";
import { buildTiers } from "../../../src/tiers.js";
import { needFor } from "../../../src/money.js";
import { rateNow } from "../../_data.js";
import { asOf, Bars, Cta, Fold, Page, Section, Table, TierBadge } from "../../_ui.jsx";

export const dynamicParams = false;
export function generateStaticParams() {
  return GU.map(([, slug]) => ({ slug }));
}

export function generateMetadata({ params }) {
  const name = nameOf(params.slug);
  const { g, sum } = guData(name);
  const p = g.p12;
  return {
    title: `${name} 아파트 실거래가·시세 · 서울 내집마련 전략판`,
    description: `${name} 아파트 최근 6개월 실거래 기준 84㎡ 중위가 ${won(sum.median_84_10k ?? g.p6.p84)}, 59㎡ ${won(sum.median_59_10k)}, 최근 1년 거래 ${p.n.toLocaleString("ko-KR")}건. 동별·단지별 거래와 최근 신고가·급매를 국토교통부 실거래가로 정리했습니다.`,
    alternates: { canonical: `/gu/${params.slug}/` },
    openGraph: { title: `${name} 아파트 실거래가·시세`, url: `/gu/${params.slug}/`, type: "article" },
  };
}

const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const DealList = ({ rows, tone }) => (
  <ul className="flex flex-col gap-2">
    {rows.map((d, i) => (
      <li key={i} className="flex items-center justify-between gap-2 rounded-medium bg-default-50 px-3 py-2 text-small">
        <span className="min-w-0"><b className="block truncate">{d.apt}</b><span className="text-tiny text-default-500">{d.dong} · {d.area}㎡ {d.floor}층 · {md(d.date)}</span></span>
        <span className="shrink-0 text-right"><b className={tone}>{won(d.price)}</b><span className="block text-tiny text-default-400">{won(d.ref)} 대비 {pct(d.gap_pct)}</span></span>
      </li>
    ))}
  </ul>
);

export default function GuPage({ params }) {
  const name = nameOf(params.slug);
  const { g, sum, dongs, apts, highs, dips, meta } = guData(name);
  const tiers = buildTiers(readJson("insights.json"), readJson("dong_summary.json"), readJson("gu_summary.json"));
  const guTier = tiers.gu.tier.get(name), dongTier = (d) => tiers.dong.tier.get(`${name} ${d}`);
  const [p3, p12] = [g.p3, g.p12];
  const idx = GU.findIndex(([n]) => n === name);
  // where this 구 sits among the 25 (rank 1 = highest)
  const all = GU.map(([n]) => guData(n));
  const rank = (f) => { const v = f({ g, sum }); if (v == null) return null; return all.map(f).filter((x) => x != null && x > v).length + 1; };
  const p84 = (r) => r.sum.median_84_10k ?? r.g.p6?.p84, chgs = all.map((r) => r.g.p12?.chg).filter((v) => v != null).sort((a, b) => a - b);
  const midChg = chgs[Math.floor(chgs.length / 2)], r84 = rank(p84), rJeonse = rank((r) => r.sum.jeonse_ratio_pct), rVol = rank((r) => r.g.p12?.n);
  const rate = rateNow(), need = p84({ g, sum }) ? needFor(p84({ g, sum }), rate.pct, true) : null;
  const ts = dongs.map((d) => dongTier(d.dong)).filter(Boolean), lo = Math.min(...ts), hi = Math.max(...ts);
  const lead = `최근 1년 아파트 매매 ${p12.n.toLocaleString("ko-KR")}건. 84㎡ 중위가는 서울 25개 구 중 ${r84}번째로 높고, 1년 가격 변화(${pct(p12.chg)})는 25개 구 중간값(${pct(midChg)})보다 ${p12.chg > midChg ? "높아요" : p12.chg < midChg ? "낮아요" : "같아요"}.`
    + (ts.length ? ` 동별로는 ${lo === hi ? `모두 ${lo}급지` : `${lo}~${hi}급지`}로 나뉘어요.` : "");
  return (
    <Page wide icon="🏙" crumbs={[["/gu/", "구별 시세"], [null, name]]} title={`${name} 아파트 실거래가·시세`} sub={`${asOf(meta.as_of)} 기준 · 국토교통부 실거래가 (${meta.notes.p12})`}
      lead={lead}
      stats={[["84㎡ 중위가", won(sum.median_84_10k ?? g.p6.p84), `25개 구 중 ${r84}위`, "accent"], ["59㎡ 중위가", won(sum.median_59_10k), "최근 6개월"],
        ["1년 가격 변화", pct(p12.chg), "같은 단지·평형", p12.chg > 0 ? "up" : undefined], ["전세가율", sum.jeonse_ratio_pct != null ? `${sum.jeonse_ratio_pct}%` : "–", rJeonse ? `${rJeonse}위` : ""]]}>

      <div className="flex flex-wrap items-center gap-2 text-small">
        <span className="text-default-500">구 평균</span><a href="/tiers/"><TierBadge k={guTier} /></a>
        <span className="text-default-500">· 1년 거래량 {rVol}위</span>
        {p3.n_prev && p3.vol_chg != null && <span className="text-default-500">· 최근 3개월 거래 {pct(p3.vol_chg)}</span>}
      </div>

      {need && (
        <Section icon="🧮" title="84㎡ 중위가를 사려면" desc={`생애최초, 금리 ${rate.pct}% + 스트레스 3%p, 30년 상환 기준 추정`}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[["필요 현금", won(need.cash)], ["필요 연소득", won(need.income)], ["월 상환", won(need.monthly)]].map(([l, v]) => (
              <div key={l} className="rounded-medium bg-default-50 px-2 py-2"><span className="block text-tiny text-default-500">{l}</span><b className="text-medium">{v}</b></div>
            ))}
          </div>
          <p className="text-tiny text-default-400">{won(need.P)}에 취득세 {won(need.acq)}, 중개보수 {won(need.fee)}가 더 들고 대출은 {won(need.loan)}까지예요. <a href="/guide/first-home/" className="underline">계산 방법</a></p>
        </Section>
      )}

      <Section icon="📊" title="거래 가격 분포 (최근 1년)">
        <div className="flex flex-col gap-1">
          <div className="h-3 rounded-full bg-gradient-to-r from-primary-100 via-primary-300 to-primary-600" />
          <div className="flex justify-between text-tiny text-default-500"><span>하위 25% {won(p12.q[5])}</span><span>중간 <b className="text-default-700">{won(p12.q[10])}</b></span><span>상위 25% {won(p12.q[15])}</span></div>
        </div>
        <p className="text-small text-default-600">최근 3개월 거래 중 신고가 비율은 {p3.high_share != null ? `${p3.high_share}%` : "–"}{p3.dip_n ? `, 시세보다 10% 넘게 싸게 팔린 거래는 ${p3.dip_n}건` : ""}이에요.</p>
      </Section>

      {dongs.length > 0 && (
        <Section icon="📍" title="동별 84㎡ 중위가" desc="최근 6개월, 거래 많은 동부터">
          <Bars rows={dongs.filter((d) => d.median_84_10k).slice(0, 10).map((d) => ({ label: d.dong, value: d.median_84_10k, text: won(d.median_84_10k) }))} />
          <Fold label={`${dongs.length}개 동 전체 표로 보기`}>
            <Table head={["동", "급지", "84㎡", "59㎡", "1년 거래"]} rows={dongs.map((d) => [d.dong, <TierBadge key="t" k={dongTier(d.dong)} />, won(d.median_84_10k), won(d.median_59_10k), `${d.trades_12m}건`])} />
          </Fold>
        </Section>
      )}

      {apts.length > 0 && (
        <Section icon="🔥" title="최근 6개월 거래가 많은 단지">
          <ul className="flex flex-col gap-2">
            {apts.slice(0, 6).map((a) => (
              <li key={a.apt + a.dong} className="flex items-center justify-between gap-2 rounded-medium bg-default-50 px-3 py-2 text-small">
                <span className="min-w-0"><b className="block truncate">{a.apt}</b><span className="text-tiny text-default-500">{a.dong}{a.build_year ? ` · ${a.build_year}년` : ""} · {a.trades_6m}건</span></span>
                <span className="shrink-0 text-right"><b>{won(a.median_price_10k)}</b><span className="block text-tiny text-default-400">{a.median_area_sqm}㎡ 중위</span></span>
              </li>
            ))}
          </ul>
          {apts.length > 6 && (
            <Fold label={`${apts.length}개 단지 표로 보기`}>
              <Table head={["단지", "준공", "거래", "중위가", "가격 범위"]} rows={apts.map((a) => [`${a.dong} ${a.apt}`, a.build_year ? `${a.build_year}년` : "–", `${a.trades_6m}건`,
                `${won(a.median_price_10k)} (${a.median_area_sqm}㎡)`, `${won(a.min_price_10k)}~${won(a.max_price_10k)}`])} />
            </Fold>
          )}
        </Section>
      )}

      {highs.length > 0 && <Section icon="🚀" title="최근 신고가" desc="그 단지·평형의 이전 최고가 대비"><DealList rows={highs.slice(0, 5)} tone="text-danger" /></Section>}
      {dips.length > 0 && (
        <Section icon="🏷" title="최근 급매 의심 거래" desc="직전 6개월 중위가 대비. 1~2층·직거래·가족 간 거래로 보이는 건은 뺐어요.">
          <DealList rows={dips.slice(0, 5)} tone="text-primary" />
        </Section>
      )}

      <Cta>내 소득·모은 돈으로 {name}에서 살 수 있는 단지 찾기 →</Cta>

      <nav className="flex flex-col gap-2 text-small">
        <span className="text-default-500">다른 구 시세</span>
        <div className="flex flex-wrap gap-1.5">
          {GU.map(([n, s]) => (n === name ? null : <a key={s} href={`/gu/${s}/`} className="rounded-full bg-default-100 px-2.5 py-0.5 text-default-700 hover:bg-primary-50">{n}</a>))}
        </div>
        <div className="flex justify-between pt-1">
          {idx > 0 ? <a href={`/gu/${GU[idx - 1][1]}/`} className="text-primary">← {GU[idx - 1][0]}</a> : <span />}
          {idx < GU.length - 1 && <a href={`/gu/${GU[idx + 1][1]}/`} className="text-primary">{GU[idx + 1][0]} →</a>}
        </div>
      </nav>
    </Page>
  );
}
