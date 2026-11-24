// Guide: 신고가·급매 의심 거래 기준, with the current counts from deals.json and insights.json.
import { GU, readJson, slugOf, pct } from "../../gu/data";
import { asOf, Bars, Cta, Fold, Note, Page, Section, Table } from "../../_ui.jsx";

export const metadata = {
  title: "신고가·급매 의심 거래는 어떻게 골라낼까 · 서울 내집마련 전략판",
  description: "같은 단지·같은 평형의 최근 2년 최고가, 직전 6개월 중위가와 비교해 신고가와 급매 의심 거래를 고르는 기준과, 서울 구별 신고가 비율을 정리했습니다.",
  alternates: { canonical: "/guide/deal-signals/" },
};

export default function DealSignals() {
  const deals = readJson("deals.json"), ins = readJson("insights.json"), n = deals.n?.["11"] || {};
  const gus = GU.map(([g]) => ({ g, p: ins.gu[g]?.p3 })).filter((x) => x.p?.high_share != null).sort((a, b) => b.p.high_share - a.p.high_share);
  return (
    <Page icon="🚀" stats={[["신고가 (서울)", n.high?.toLocaleString("ko-KR") ?? "–", `${asOf(deals.since).slice(6)} 이후`, "up"], ["급매 의심 (서울)", n.dip?.toLocaleString("ko-KR") ?? "–", "할인 10% 이상"], ["신고가 비율 1위", gus[0]?.g || "–", gus[0] ? `${gus[0].p.high_share}%` : ""]]} crumbs={[["/guide/", "내집마련 가이드"], [null, "신고가·급매"]]} title="신고가·급매 의심 거래는 어떻게 골라낼까" sub={`${asOf(ins.meta.as_of)} 기준 · 국토교통부 실거래가`}>
      <p className="leading-relaxed text-default-700">
        &ldquo;신고가가 나왔다&rdquo;, &ldquo;급매가 나왔다&rdquo;는 말은 기준이 제각각입니다. 이 사이트는 모든 거래를 <b>같은 단지·같은 평형</b>의 과거 거래와만 비교해서,
        면적이나 단지가 섞여 생기는 착시를 줄입니다. {asOf(deals.since)} 이후 서울에서 신고가는 {n.high?.toLocaleString("ko-KR") ?? "–"}건, 급매 의심 거래는 {n.dip?.toLocaleString("ko-KR") ?? "–"}건 잡혔습니다.
      </p>
      <Section icon="📐" title="기준">
        <Table wrap head={["구분", "기준"]} rows={[
          ["신고가", "그 단지·평형의 최근 2년 최고 거래가를 넘은 거래"],
          ["급매 의심", "그 단지·평형의 직전 6개월 중위가보다 10% 이상 낮은 거래"],
          ["급매에서 빼는 것", "1~2층, 직거래, 가족 간 거래가 몰리는 할인 폭(시가 30% 또는 3억 기준선 바로 안쪽)"],
        ]} />
        <p>신고가가 많다는 건 매수자가 이전 최고가를 받아들이고 있다는 뜻이라, 그 동네 시세가 위로 움직이는 신호로 볼 수 있습니다. 반대로 급매 의심 거래는 시세보다 싸게 신고된 것일 뿐,
          집 상태가 나쁘거나 급하게 팔아야 했던 사정이 있을 수 있어 그 자체로 &ldquo;싸게 살 기회&rdquo;를 뜻하지는 않습니다.</p>
      </Section>
      <Section icon="📊" title={`구별 신고가 비율 (${ins.meta.notes.p3})`}>
        <Bars rows={gus.slice(0, 12).map(({ g, p }) => ({ label: g, href: `/gu/${slugOf(g)}/`, value: p.high_share, text: `${p.high_share}%`, tone: "warm" }))} />
        <Fold label="25개 구 전체 표로 보기">
        <Table head={["구", "신고가 비율", "가격 변화", "급매 의심"]} rows={gus.map(({ g, p }) => [
          <a key="g" href={`/gu/${slugOf(g)}/`} className="text-primary">{g}</a>, `${p.high_share}%`, pct(p.chg), p.dip_n != null ? `${p.dip_n}건` : "–"])}
          note="신고가 비율 = 신고가 거래 ÷ 전체 거래. 가격 변화는 같은 단지·평형 기준입니다." />
        </Fold>
      </Section>
      <Note>구별 페이지와 <a href="/market/" className="text-primary underline">이번 달 시장</a>에서 최근 신고가·급매 거래 목록을 볼 수 있습니다. 앱 지도에서는 &lsquo;신고가 비율&rsquo;로 동네를 색칠할 수 있습니다.</Note>
      <Cta>신고가가 많은 동네 지도에서 보기 →</Cta>
    </Page>
  );
}
