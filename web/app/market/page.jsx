// /market/: this month's 서울 아파트 시장 in sentences and tables, rebuilt from the daily data (market, insights, deals, rates).
import { GU, readJson, slugOf, won, pct } from "../gu/data";
import { asOf, Cta, Page, Section, Table, ym } from "../_ui.jsx";

const load = () => ({ m: readJson("market.json"), ins: readJson("insights.json"), monthly: readJson("monthly.json"), deals: readJson("deals.json"), rates: readJson("rates.json") });

export function generateMetadata() {
  const { m } = load();
  return {
    title: `서울 아파트 시장 동향 (${m.period}) · 서울 내집마련 전략판`,
    description: `${asOf(m.as_of)} 기준 서울 아파트 거래량, 구별 가격 변화, 신고가·급매, 전세가율, 주담대 금리를 국토교통부 실거래가와 한국은행 자료로 정리했습니다. ${m.bullets[0]?.text || ""}`.slice(0, 160),
    alternates: { canonical: "/market/" },
    openGraph: { title: "이번 달 서울 아파트 시장", url: "/market/", type: "article" },
  };
}

export default function Market() {
  const { m, ins, monthly, deals, rates } = load();
  const months = [...new Set(monthly.map((r) => r.month))].sort().slice(-12);
  const seoul = months.map((mo) => { const rs = monthly.filter((r) => r.month === mo); return { mo, n: rs.reduce((s, r) => s + r.trades, 0), partial: rs.some((r) => r.partial) }; });
  const gus = GU.map(([g]) => ({ g, p: ins.gu[g]?.p3 })).filter((x) => x.p).sort((a, b) => (b.p.chg ?? -99) - (a.p.chg ?? -99));
  const dips = deals.dips.filter((d) => d.sido === "11").sort((a, b) => a.gap_pct - b.gap_pct).slice(0, 10);
  return (
    <Page wide crumbs={[[null, "이번 달 시장"]]} title={`서울 아파트 시장 동향 (${m.period})`} sub={`${asOf(m.as_of)} 갱신 · 국토교통부 실거래가, 한국은행 ECOS, 서울 열린데이터광장`}>
      <Section title="한눈에 보기">
        <ul className="flex flex-col gap-1.5">
          {m.bullets.map((b) => <li key={b.tag}><span className="mr-1 rounded-small bg-default-100 px-1.5 py-0.5 text-tiny font-semibold text-default-600">{b.tag}</span>{b.text}</li>)}
        </ul>
      </Section>

      <Section title="월별 서울 아파트 매매 거래량">
        <Table head={["월", "거래"]} rows={seoul.map((r) => [ym(r.mo), `${r.n.toLocaleString("ko-KR")}건${r.partial ? " (집계 중)" : ""}`])}
          note="계약일 기준. 신고 기한이 계약 후 30일이라 이번 달과 지난달 숫자는 앞으로 늘어납니다." />
      </Section>

      <Section title={`구별 가격·거래 변화 (${ins.meta.notes.p3})`}>
        <p className="text-small text-default-600">가격 변화는 같은 단지·같은 평형끼리 비교한 값이라, 비싼 단지 거래가 몰린 달에 평균이 튀는 효과를 줄였습니다. 신고가 비율은 그 단지·평형의 최근 2년 최고가를 넘은 거래의 비율입니다.</p>
        <Table head={["구", "가격 변화", "거래", "거래 증감", "신고가 비율"]} rows={gus.map(({ g, p }) => [
          <a key="g" href={`/gu/${slugOf(g)}/`} className="text-primary">{g}</a>, pct(p.chg), `${p.n}건`, pct(p.vol_chg), p.high_share != null ? `${p.high_share}%` : "–"])} />
      </Section>

      {m.highs?.length > 0 && (
        <Section title="크게 오른 신고가 거래">
          <Table head={["단지", "면적", "거래가", "이전 최고가", "날짜"]} rows={m.highs.map((h) => [`${h.gu} ${h.name}`, `${h.area}㎡`, won(h.price), won(h.prev_max), h.date.slice(5).replace("-", "/")])} />
        </Section>
      )}

      {dips.length > 0 && (
        <Section title="급매 의심 거래 (서울, 할인 폭 큰 순)">
          <Table head={["단지", "면적·층", "거래가", "직전 6개월 중위가", "차이", "날짜"]} rows={dips.map((d) => [`${d.gu} ${d.dong} ${d.apt}`, `${d.area}㎡ · ${d.floor}층`, won(d.price), won(d.ref), pct(d.gap_pct), d.date.slice(5).replace("-", "/")])}
            note={<>시세보다 낮게 신고된 거래일 뿐, 가족 간 거래 등 사정이 있는 거래일 수 있습니다. 고르는 기준은 <a href="/guide/deal-signals/" className="underline">신고가·급매 가이드</a>에 있습니다.</>} />
        </Section>
      )}

      <Section title="주택담보대출 금리 (예금은행 신규취급액 가중평균)">
        <Table head={["월", "주담대", "고정형", "변동형", "기준금리"]} rows={rates.slice(-12).reverse().map((r) => [ym(r.month), `${r.mortgage_pct}%`, `${r.fixed_pct}%`, `${r.variable_pct}%`, `${r.base_pct}%`])} note="자료: 한국은행 ECOS." />
      </Section>

      <Cta>지금 시세로 내 예산에 맞는 동네 찾기 →</Cta>
    </Page>
  );
}
