// Guide: 스트레스 DSR. Loan limits computed with the app's annuity() at today's rate, with and without the 3%p stress.
import { won } from "../../gu/data";
import { annuity, DSR, STRESS } from "../../../src/money.js";
import { rateNow } from "../../_data.js";
import { Cta, Page, Section, Table } from "../../_ui.jsx";

export const metadata = {
  title: "스트레스 DSR은 대출 한도를 얼마나 줄일까 · 서울 내집마련 전략판",
  description: "DSR 40%와 스트레스 금리 3%p가 연소득별 주택담보대출 한도를 얼마나 줄이는지 현재 주담대 평균 금리로 계산했습니다.",
  alternates: { canonical: "/guide/stress-dsr/" },
};

const INCOMES = [3000, 4000, 5000, 6000, 8000, 10000, 12000];

export default function StressDsr() {
  const rate = rateNow(), r = rate.pct;
  const cap = (inc, x) => (inc * DSR) / (annuity(x) * 12);
  const ex = 6000, a = cap(ex, r), b = cap(ex, r + STRESS);
  return (
    <Page crumbs={[["/guide/", "내집마련 가이드"], [null, "스트레스 DSR"]]} title="스트레스 DSR은 대출 한도를 얼마나 줄일까"
      sub={`금리 ${r}%(${rate.month} 주담대 평균) · 30년 원리금균등 상환 기준`}>
      <p className="leading-relaxed text-default-700">
        DSR(총부채원리금상환비율)은 1년 동안 갚는 모든 대출의 원금과 이자가 연소득의 몇 %인지 보는 규제입니다. 은행 주택담보대출은 이 비율이 {DSR * 100}%를 넘을 수 없습니다.
        스트레스 DSR은 여기에 &lsquo;앞으로 금리가 오를 수 있다&rsquo;는 가정을 더해, 실제 금리보다 높은 금리(이 사이트는 +{STRESS}%p)로 원리금을 계산합니다. 실제로 내는 이자는 그대로지만 한도는 줄어듭니다.
      </p>
      <Section title="계산 예시">
        <p>연소득 {won(ex)}이면 1년에 갚을 수 있는 원리금은 {won(ex * DSR)}입니다. 금리 {r}%, 30년 상환이면 이만큼으로 갚을 수 있는 대출은 <b>{won(a)}</b>이지만,
          스트레스 금리 {(r + STRESS).toFixed(2)}%로 계산하면 <b>{won(b)}</b>로 약 {Math.round((1 - b / a) * 100)}% 줄어듭니다.</p>
      </Section>
      <Section title="연소득별 대출 한도 (DSR만 따질 때)">
        <Table head={["연소득", `금리 ${r}%`, `스트레스 ${(r + STRESS).toFixed(2)}%`, "줄어드는 폭"]}
          rows={INCOMES.map((inc) => { const x = cap(inc, r), y = cap(inc, r + STRESS); return [won(inc), won(x), won(y), `−${won(x - y)} (${Math.round((1 - y / x) * 100)}%)`]; })}
          note="다른 대출(신용대출, 자동차 할부 등)이 있으면 그 원리금만큼 한도가 더 줄어듭니다. 실제 대출은 LTV·주담대 상한과 비교해 가장 작은 금액입니다." />
      </Section>
      <Section title="한도를 늘리는 방법">
        <ul className="list-disc pl-5">
          <li><b>다른 대출 먼저 갚기:</b> 신용대출·할부는 DSR에 그대로 들어가, 갚는 만큼 주담대 한도가 늘어납니다.</li>
          <li><b>소득 합산:</b> 배우자 소득을 합치면 DSR 한도가 함께 늘어납니다. 결혼 계획이 있다면 앱의 &lsquo;결혼 예정&rsquo;으로 합가 뒤 예산을 볼 수 있습니다.</li>
          <li><b>정책대출 확인:</b> 디딤돌·보금자리론 같은 정책대출은 은행 주담대와 다른 기준이 적용될 수 있습니다. <a href="/guide/first-home/" className="text-primary underline">생애최초 가이드</a>를 보세요.</li>
        </ul>
      </Section>
      <Cta>내 소득으로 대출 한도 계산하기 →</Cta>
    </Page>
  );
}
