// /market/: this month's 서울 아파트 시장, rebuilt from the daily data (market, insights, monthly, deals, rates).
import { GU, readJson, slugOf, won, pct } from "../gu/data";
import { asOf, Bars, Columns, Cta, Fold, Page, Section, Table, ym } from "../_ui.jsx";

const load = () => ({ m: readJson("market.json"), ins: readJson("insights.json"), monthly: readJson("monthly.json"), deals: readJson("deals.json"), rates: readJson("rates.json") });
const TAG_ICON = { 거래: "📊", 가격: "💹", 동네: "📍", "인기 단지": "🔥", 신고가: "🚀", 급매: "🏷", 전세: "🔑", 금리: "🏦", 정비사업: "🏗" };

export function generateMetadata() {
  const { m } = load();
  return {
    title: `서울 아파트 시장 동향 (${m.period.replace(/\s*\(.*\)$/, "")}) · 서울 내집마련 전략판`,
    description: `${asOf(m.as_of)} 기준 서울 아파트 거래량, 구별 가격 변화, 신고가·급매, 전세가율, 주담대 금리를 국토교통부 실거래가와 한국은행 자료로 정리했습니다. ${m.bullets[0]?.text || ""}`.slice(0, 160),
    alternates: { canonical: "/market/" },
    openGraph: { title: "이번 달 서울 아파트 시장", url: "/market/", type: "article" },
  };
}

export default function Market() {
  const { m, ins, monthly, deals, rates } = load();
  const months = [...new Set(monthly.map((r) => r.month))].sort().slice(-12);
  // monthly.json carries a "서울 전체" row per month next to the 25 구 rows: use it, never the sum of both
  const seoul = months.map((mo) => { const r = monthly.find((x) => x.month === mo && x.gu === "서울 전체"); return { mo, n: r?.trades || 0, partial: !!r?.partial }; });
  const full = seoul.filter((r) => !r.partial), last = full.at(-1), prev = full.at(-2);
  const gus = GU.map(([g]) => ({ g, p: ins.gu[g]?.p3 })).filter((x) => x.p?.chg != null).sort((a, b) => b.p.chg - a.p.chg);
  const dips = deals.dips.filter((d) => d.sido === "11").sort((a, b) => a.gap_pct - b.gap_pct).slice(0, 10);
  const r0 = rates.at(-1), r1 = rates.at(-2), seoulHigh = deals.n?.["11"]?.high;
  return (
    <Page wide icon="📈" crumbs={[[null, "이번 달 시장"]]} title={`서울 아파트 시장 (${m.period.replace(/\s*\(.*\)$/, "")})`} sub={`${asOf(m.as_of)} 갱신 · 국토교통부 실거래가, 한국은행 ECOS`}
      stats={[
        [`${ym(last.mo).slice(6)} 거래`, `${last.n.toLocaleString("ko-KR")}건`, prev ? `전월 ${pct(((last.n - prev.n) / prev.n) * 100)}` : ""],
        ["가장 오른 구", gus[0]?.g, pct(gus[0]?.p.chg), "up"],
        [`신고가 (${deals.since.slice(5).replace("-", "/")}~)`, seoulHigh ? `${seoulHigh.toLocaleString("ko-KR")}건` : "–", "서울"],
        [`주담대 ${r0.month.slice(5)}월`, `${r0.mortgage_pct}%`, `전월 ${r0.mortgage_pct - r1.mortgage_pct >= 0 ? "+" : ""}${(r0.mortgage_pct - r1.mortgage_pct).toFixed(2)}%p`],
      ]}>

      <Section icon="📝" title="한눈에 보기">
        <ul className="flex flex-col gap-2">
          {m.bullets.map((b) => (
            <li key={b.tag} className="flex gap-2 text-small">
              <span className="shrink-0" aria-hidden="true">{TAG_ICON[b.tag] || "•"}</span>
              <span><b className="mr-1">{b.tag}</b>{b.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section icon="📊" title="월별 매매 거래량" desc="계약일 기준. 옅은 막대는 신고가 아직 다 들어오지 않은 달이에요.">
        <Columns rows={seoul.map((r) => ({ label: `${+r.mo.slice(5)}월`, value: r.n, faded: r.partial }))} fmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
      </Section>

      <Section icon="💹" title={`구별 가격 변화 (${ins.meta.notes.p3})`} desc="같은 단지·같은 평형끼리 비교한 값이에요.">
        <Bars signed rows={gus.map(({ g, p }) => ({ label: g, href: `/gu/${slugOf(g)}/`, value: p.chg, text: pct(p.chg) }))} />
        <Fold label="거래량·신고가 비율까지 표로 보기">
          <Table head={["구", "가격 변화", "거래", "거래 증감", "신고가 비율"]} rows={gus.map(({ g, p }) => [g, pct(p.chg), `${p.n}건`, pct(p.vol_chg), p.high_share != null ? `${p.high_share}%` : "–"])} />
        </Fold>
      </Section>

      {m.highs?.length > 0 && (
        <Section icon="🚀" title="크게 오른 신고가">
          <ul className="flex flex-col gap-2">
            {m.highs.slice(0, 5).map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-medium bg-default-50 px-3 py-2 text-small">
                <span className="min-w-0"><b className="block truncate">{h.name}</b><span className="text-tiny text-default-500">{h.gu} · {h.area}㎡ · {h.date.slice(5).replace("-", "/")}</span></span>
                <span className="shrink-0 text-right"><b className="text-danger">{won(h.price)}</b><span className="block text-tiny text-default-400">이전 {won(h.prev_max)}</span></span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {dips.length > 0 && (
        <Section icon="🏷" title="급매 의심 거래" desc="직전 6개월 중위가보다 10% 넘게 싸게 신고된 거래. 사정이 있는 거래일 수 있어요.">
          <ul className="flex flex-col gap-2">
            {dips.slice(0, 5).map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-medium bg-default-50 px-3 py-2 text-small">
                <span className="min-w-0"><b className="block truncate">{d.apt}</b><span className="text-tiny text-default-500">{d.gu} {d.dong} · {d.area}㎡ {d.floor}층 · {d.date.slice(5).replace("-", "/")}</span></span>
                <span className="shrink-0 text-right"><b className="text-primary">{won(d.price)}</b><span className="block text-tiny text-default-400">시세 {won(d.ref)} · {pct(d.gap_pct)}</span></span>
              </li>
            ))}
          </ul>
          <a href="/guide/deal-signals/" className="text-small text-primary">신고가·급매를 고르는 기준 ›</a>
        </Section>
      )}

      <Section icon="🏦" title="주담대 금리" desc="예금은행 신규취급액 가중평균 (한국은행)">
        <Columns rows={rates.slice(-12).map((r) => ({ label: `${+r.month.slice(5)}월`, value: r.mortgage_pct }))} fmt={(v) => v.toFixed(2)} />
        <Fold label="고정형·변동형·기준금리 표로 보기">
          <Table head={["월", "주담대", "고정형", "변동형", "기준금리"]} rows={rates.slice(-12).reverse().map((r) => [ym(r.month), `${r.mortgage_pct}%`, `${r.fixed_pct}%`, `${r.variable_pct}%`, `${r.base_pct}%`])} />
        </Fold>
      </Section>

      <Cta>지금 시세로 내 예산에 맞는 동네 찾기 →</Cta>
    </Page>
  );
}
