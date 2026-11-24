// Guide: 갈아타기 양도세. Worked cases run through the app's gainTax() so the page matches what the calculator shows.
import { won } from "../../gu/data";
import { gainTax } from "../../../src/money.js";
import { Cta, Note, Page, Section, Table } from "../../_ui.jsx";

export const metadata = {
  title: "갈아탈 때 양도세: 1주택 비과세와 12억 초과분 · 서울 내집마련 전략판",
  description: "1세대1주택 비과세 요건(2년 보유·거주), 12억 초과분 과세, 장기보유특별공제, 단기 보유 세율을 실제 계산 예시로 설명합니다.",
  alternates: { canonical: "/guide/capital-gains/" },
};

// [설명, 산 가격, 판 가격, 보유 년, 거주 년, 거주 요건 적용]
const CASES = [
  ["8억에 사서 5년 살고 11억에 팔 때", 80000, 110000, 5, 5, true],
  ["10억에 사서 6년 살고 15억에 팔 때", 100000, 150000, 6, 6, true],
  ["10억에 사서 6년 세 주고 15억에 팔 때", 100000, 150000, 6, 0, true],
  ["8억에 사서 10년 살고 20억에 팔 때", 80000, 200000, 10, 10, true],
  ["8억에 사서 1년 반 만에 10억에 팔 때", 80000, 100000, 1, 1, true],
];

export default function CapitalGains() {
  return (
    <Page icon="🔄" crumbs={[["/guide/", "내집마련 가이드"], [null, "갈아타기 양도세"]]} title="갈아탈 때 양도세: 비과세와 12억 초과" sub="1세대 1주택을 팔고 다른 집으로 옮기는 경우">
      <p className="leading-relaxed text-default-700">
        지금 집을 팔아 더 좋은 동네로 갈아탈 계획이라면, 판 돈에서 대출과 세금을 빼고 실제로 손에 남는 돈이 다음 집 예산이 됩니다. 그중 양도세는 보유·거주 기간에 따라
        0원이 되기도 하고 수억 원이 되기도 해서, 파는 시점을 정할 때 가장 먼저 확인해야 합니다.
      </p>
      <Section icon="📐" title="기본 규칙">
        <ul className="list-disc pl-5">
          <li><b>1세대 1주택 비과세:</b> 2년 이상 보유하면 양도세가 없습니다. 살 때 그 지역이 조정대상지역이었다면 2년 이상 거주도 해야 합니다.</li>
          <li><b>12억 초과분:</b> 비과세 요건을 채워도 판 가격이 12억을 넘으면, 차익 중 12억을 넘는 비율만큼은 과세됩니다.</li>
          <li><b>장기보유특별공제:</b> 3년 이상 보유하면 과세 차익을 줄여 줍니다. 비과세 요건을 채운 1주택은 보유·거주 1년마다 각 4%(최대 80%), 그 외는 보유 1년마다 2%(최대 30%)입니다.</li>
          <li><b>단기 보유:</b> 1년 미만은 70%, 2년 미만은 60% 단일세율입니다.</li>
          <li><b>필요경비:</b> 살 때 낸 취득세·중개보수와 팔 때 중개보수는 차익에서 뺍니다.</li>
        </ul>
        <p className="text-small text-default-600">서울은 2017년 8월~2022년 12월과 2025년 10월 이후 전 지역이 조정대상지역이고, 2023년 1월~2025년 9월에는 강남·서초·송파·용산만 해당됩니다. 산 달에 따라 거주 요건이 갈립니다.</p>
      </Section>
      <Section icon="🧮" title="계산 예시">
        <Table wrap head={["경우", "차익(경비 뺀 뒤)", "양도세(지방세 포함)", "왜"]} rows={CASES.map(([d, cost, sale, hold, lived, need]) => {
          const t = gainTax(sale, cost, hold, lived, need);
          return [d, won(t.gain), <b key="t">{t.total ? won(t.total) : "0원"}</b>, <span key="n" className="whitespace-normal">{t.note}</span>];
        })} note="모두 서울 조정대상지역에서 산 1세대 1주택 가정. 기본공제 250만 원 반영. 실제 세액은 세무 전문가와 확인하세요." />
        <p>같은 15억에 팔아도 거주했는지에 따라 세금이 크게 달라집니다. 세를 줬다면 비과세 요건을 채우지 못해 차익 전체가 과세되고, 장기보유공제도 낮은 표가 적용되기 때문입니다.</p>
      </Section>
      <Note>앱의 &lsquo;내 조건 → 지금 가진 집&rsquo;에 산 가격과 시기, 거주 여부를 넣으면 팔 때 남는 돈과 양도세가 예산에 자동으로 반영됩니다.</Note>
      <Cta>내 집 팔고 갈아탈 때 예산 계산하기 →</Cta>
    </Page>
  );
}
