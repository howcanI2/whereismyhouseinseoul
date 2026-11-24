// Guide: 전세가율. 구별 전세가율 and the rough 매매−전세 gap (84㎡ median × (1 − ratio), marked 추정), from gu_summary.json.
import { readJson, slugOf, won } from "../../gu/data";
import { asOf, Bars, Cta, Fold, Note, Page, Section, Table } from "../../_ui.jsx";

export const metadata = {
  title: "전세가율로 서울 구별 아파트 시장 읽기 · 서울 내집마련 전략판",
  description: "서울 25개 구의 아파트 전세가율(매매가 대비 전세가)과 84㎡ 기준 매매·전세 차이를 실거래가로 계산하고, 전세가율이 높고 낮을 때 의미를 설명합니다.",
  alternates: { canonical: "/guide/jeonse-ratio/" },
};

export default function JeonseRatio() {
  const gs = readJson("gu_summary.json").filter((g) => g.jeonse_ratio_pct != null).sort((a, b) => b.jeonse_ratio_pct - a.jeonse_ratio_pct);
  const meta = readJson("insights.json").meta, hi = gs[0], lo = gs.at(-1);
  return (
    <Page icon="🔑" stats={[["가장 높은 구", hi.gu, `${hi.jeonse_ratio_pct}%`, "accent"], ["가장 낮은 구", lo.gu, `${lo.jeonse_ratio_pct}%`], ["차이", `${(hi.jeonse_ratio_pct - lo.jeonse_ratio_pct).toFixed(1)}%p`, "구 사이"]]} crumbs={[["/guide/", "내집마련 가이드"], [null, "전세가율"]]} title="전세가율로 서울 구별 시장 읽기" sub={`${asOf(meta.as_of)} 기준 · 국토교통부 매매·전월세 실거래가`}>
      <p className="leading-relaxed text-default-700">
        전세가율은 매매가 대비 전세가의 비율입니다. 이 페이지는 구별로 84㎡ 전세 중위가를 84㎡ 매매 중위가로 나눠 계산했고, 서울에서는 {hi.gu}가 {hi.jeonse_ratio_pct}%로 가장 높고 {lo.gu}가 {lo.jeonse_ratio_pct}%로 가장 낮습니다.
      </p>
      <Section icon="💡" title="전세가율이 말해 주는 것">
        <ul className="list-disc pl-5">
          <li><b>높으면:</b> 실제로 살려는 수요(전세)에 비해 매매가가 덜 올라 있다는 뜻입니다. 지금 전세로 사는 사람이 매수로 옮길 때 더 필요한 돈이 적습니다.</li>
          <li><b>낮으면:</b> 매매가에 앞으로의 기대(재건축, 학군, 개발)가 많이 반영돼 있다는 뜻입니다. 전세에서 매수로 옮길 때 차액이 큽니다.</li>
          <li><b>너무 높으면:</b> 집값이 조금만 내려도 전세 보증금을 돌려받기 어려워질 수 있어, 세입자라면 보증보험 가입 여부를 확인하는 게 좋습니다.</li>
        </ul>
      </Section>
      <Section icon="📊" title="서울 구별 전세가율">
        <Bars max={100} rows={gs.map((g) => ({ label: g.gu, href: `/gu/${slugOf(g.gu)}/`, value: g.jeonse_ratio_pct, text: `${g.jeonse_ratio_pct}%`, tone: "warm" }))} />
        <Fold label="84㎡ 매매·전세 차이 표로 보기">
        <Table head={["구", "전세가율", "84㎡ 중위가", "84㎡ 전세 추정", "매매−전세 차이(추정)"]} rows={gs.map((g) => {
          const p = g.median_84_10k, j = p ? Math.round(p * g.jeonse_ratio_pct / 100) : null;
          return [<a key="g" href={`/gu/${slugOf(g.gu)}/`} className="text-primary">{g.gu}</a>, `${g.jeonse_ratio_pct}%`, won(p), won(j), p ? won(p - j) : "–"];
        })} note="전세 추정과 차이는 84㎡ 매매 중위가에 구 전세가율을 곱한 대략값입니다. 단지마다 크게 다를 수 있습니다." />
        </Fold>
        <p>&lsquo;매매−전세 차이&rsquo;는 지금 그 구에서 전세로 살다가 같은 면적을 살 때 대략 더 필요한 돈입니다. 이 돈과 취득세·중개보수를 모은 돈과 대출로 채울 수 있는지가 매수 시점을 정하는 기준이 됩니다.</p>
      </Section>
      <Note>앱 지도에서 &lsquo;전세가율&rsquo; 지표를 고르면 동네 단위로 볼 수 있습니다. 필요한 현금 계산은 <a href="/budget/" className="text-primary underline">예산별 동네</a>를 보세요.</Note>
      <Cta>전세가율 지도에서 보기 →</Cta>
    </Page>
  );
}
