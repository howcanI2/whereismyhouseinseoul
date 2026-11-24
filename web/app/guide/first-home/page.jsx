// Guide: 생애최초로 서울 어디까지. Every number is computed at build time with the app's own maxPrice() and today's data.
import { readJson, won } from "../../gu/data";
import { maxPrice } from "../../../src/money.js";
import { rateNow, tiersNow } from "../../_data.js";
import { Cta, Note, Page, Section, Table } from "../../_ui.jsx";

export const metadata = {
  title: "생애최초로 서울 어디까지 살 수 있을까 · 서울 내집마련 전략판",
  description: "LTV·주담대 한도·스트레스 DSR을 모두 적용해 연소득과 모은 돈별로 살 수 있는 최대 집값을 계산하고, 그 예산으로 84㎡를 살 수 있는 서울 동네 수를 실거래가로 셌습니다.",
  alternates: { canonical: "/guide/first-home/" },
};

const INCOMES = [5000, 6000, 8000, 10000, 12000];
const CASH = [10000, 20000, 30000, 50000];

export default function FirstHome() {
  const rate = rateNow(), rows = tiersNow().dong.rows, policy = readJson("policy.json");
  const reach = (P) => rows.filter((r) => r.m84 && r.m84 <= P).length;
  const pol = (id) => policy.find((p) => p.id === id);
  const ex = maxPrice(20000, 6000, rate.pct, true), exNo = maxPrice(20000, 6000, rate.pct, false);
  const loans = ["p06", "p07", "p08"].map(pol).filter(Boolean);
  return (
    <Page icon="🔑" stats={[["연소득 6천·모은 돈 2억", won(ex.P), "생애최초 최대", "accent"], ["대출", won(ex.loan), ex.binding], ["생애최초 아니면", won(exNo.P), "LTV 40%"]]} crumbs={[["/guide/", "내집마련 가이드"], [null, "생애최초"]]} title="생애최초로 서울 어디까지 살 수 있을까"
      sub={`금리 ${rate.pct}%(${rate.month} 주담대 평균) 기준 · 동네 수는 최근 실거래가로 매일 다시 계산`}>
      <p className="leading-relaxed text-default-700">
        집값 상한은 &ldquo;모은 돈 + 받을 수 있는 대출 − 취득세·중개보수&rdquo;로 정해집니다. 어려운 부분은 대출인데, 서울에서는 세 가지 한도 중 <b>가장 작은 것</b>이 실제 대출이 됩니다.
      </p>
      <Section icon="🚧" title="대출을 막는 세 가지 한도">
        <Table head={["한도", "내용"]} rows={[
          ["LTV", pol("p02")?.value || "생애최초 70%, 그 외 40%"],
          ["주담대 한도", pol("p03")?.value || "15억 이하 6억"],
          ["스트레스 DSR", `${pol("p04")?.value || "DSR 40%"}. 실제 금리에 3%p를 더한 금리로 원리금을 계산해 연소득의 40% 안에 들어와야 합니다.`],
        ]} wrap note="규제 내용은 이 사이트가 정리한 정책 목록 기준이며, 실제 대출은 은행 심사에 따라 다릅니다." />
        <p>예를 들어 <b>연소득 6,000만 원, 모은 돈 2억</b>이면 생애최초로 최대 <b>{won(ex.P)}</b>까지 살 수 있고, 이때 대출은 {won(ex.loan)}이며 대출을 막는 한도는 &lsquo;{ex.binding}&rsquo;입니다.
          생애최초가 아니면 LTV가 40%로 내려가 최대 {won(exNo.P)}로 줄어듭니다.</p>
      </Section>

      <Section icon="📋" title="연소득·모은 돈별 최대 집값 (생애최초)">
        <Table head={["연소득 \\ 모은 돈", ...CASH.map(won)]} rows={INCOMES.map((inc) => [won(inc), ...CASH.map((c) => {
          const m = maxPrice(c, inc, rate.pct, true);
          return <span key={c}>{won(m.P)}<span className="text-tiny text-default-400"> · {reach(m.P)}곳</span></span>;
        })])} note={`각 칸: 최대 집값 · 그 가격 이하로 84㎡ 중위가가 형성된 서울 동네 수(최근 1년 거래 30건 이상 동 ${rows.length}곳 중). 30년 원리금균등, 스트레스 3%p, 취득세·중개보수 반영.`} />
        <p>표를 보면 소득이 낮을 때는 DSR이, 모은 돈이 적을 때는 LTV가 먼저 막힙니다. 소득을 올리는 것과 현금을 모으는 것 중 어느 쪽이 더 효과적인지는 지금 어떤 한도에 걸려 있는지에 달렸습니다.</p>
      </Section>

      {loans.length > 0 && (
        <Section icon="🏛" title="정책대출도 확인하세요">
          <Table wrap head={["상품", "조건"]} rows={loans.map((p) => [p.item, `${p.value}${p.status === "확인" ? "" : " (확인 필요)"}`])}
            note="정책대출은 소득·집값 조건이 맞으면 금리가 낮아 같은 소득으로 더 많이 빌릴 수 있습니다. 조건은 자주 바뀌니 신청 전 주택도시기금에서 확인하세요." />
        </Section>
      )}

      <Note>이 표는 금리와 규제를 고정한 추정입니다. 결혼 계획, 몇 년 뒤 저축, 지금 가진 집까지 넣은 내 예산은 앱의 &lsquo;내 조건&rsquo;에서 바로 계산됩니다. <a href="/budget/" className="text-primary underline">예산별 동네 목록</a>도 함께 보세요.</Note>
      <Cta>내 소득·모은 돈으로 계산하기 →</Cta>
    </Page>
  );
}
