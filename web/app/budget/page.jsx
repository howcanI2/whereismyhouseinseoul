// /budget/: how many 서울 동네 each budget reaches, linking to the per-budget pages.
import { readJson, won } from "../gu/data";
import { needFor } from "../../src/money.js";
import { rateNow, tiersNow } from "../_data.js";
import { asOf, Cta, Page, Table } from "../_ui.jsx";
import { BUDGETS } from "./amounts.js";

export const metadata = {
  title: "예산별로 살 수 있는 서울 아파트 동네 · 서울 내집마련 전략판",
  description: "6억·8억·10억·12억·15억 예산으로 84㎡·59㎡ 아파트를 살 수 있는 서울 동네 수와, 각 예산에 필요한 현금·연소득을 실거래가와 현재 대출 규제로 계산했습니다.",
  alternates: { canonical: "/budget/" },
};

export default function BudgetIndex() {
  const rows = tiersNow().dong.rows, rate = rateNow(), meta = readJson("insights.json").meta;
  return (
    <Page crumbs={[[null, "예산별 동네"]]} title="예산별로 살 수 있는 서울 아파트 동네" sub={`${asOf(meta.as_of)} 기준 · 국토교통부 실거래가 · 서울 법정동 ${rows.length}곳`}>
      <p className="leading-relaxed text-default-700">
        같은 예산이라도 면적을 59㎡로 낮추거나 생애최초 대출을 쓰면 닿는 동네가 크게 달라집니다. 예산마다 최근 6개월 중위가가 그 금액 이하인 동네 수와,
        그 가격의 집을 생애최초로 살 때 필요한 현금·연소득을 정리했습니다. 예산을 누르면 동네 목록이 나옵니다.
      </p>
      <Table head={["예산", "84㎡로 닿는 동", "59㎡로 닿는 동", "필요 현금", "필요 연소득"]} rows={BUDGETS.map((b) => {
        const n = needFor(b.v, rate.pct, true);
        return [<a key="b" href={`/budget/${b.slug}/`} className="font-semibold text-primary">{b.label}</a>,
          `${rows.filter((r) => r.m84 && r.m84 <= b.v).length}곳`, `${rows.filter((r) => r.m59 && r.m59 <= b.v).length}곳`, won(n.cash), won(n.income)];
      })} note={`필요 현금·연소득은 생애최초(LTV 70%) 기준 추정입니다. 금리 ${rate.pct}%(${rate.month}) + 스트레스 3%p, 30년 상환.`} />
      <Cta>내 소득·모은 돈으로 정확한 예산 계산하기 →</Cta>
    </Page>
  );
}
