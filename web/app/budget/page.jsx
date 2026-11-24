// /budget/: how many 서울 동네 each budget reaches, linking to the per-budget pages.
import { readJson, won } from "../gu/data";
import { needFor } from "../../src/money.js";
import { rateNow, tiersNow } from "../_data.js";
import { asOf, Cta, Page } from "../_ui.jsx";
import { BUDGETS } from "./amounts.js";

export const metadata = {
  title: "예산별로 살 수 있는 서울 아파트 동네 · 서울 내집마련 전략판",
  description: "6억·8억·10억·12억·15억 예산으로 84㎡·59㎡ 아파트를 살 수 있는 서울 동네 수와, 각 예산에 필요한 현금·연소득을 실거래가와 현재 대출 규제로 계산했습니다.",
  alternates: { canonical: "/budget/" },
};

export default function BudgetIndex() {
  const rows = tiersNow().dong.rows, rate = rateNow(), meta = readJson("insights.json").meta;
  return (
    <Page icon="💰" crumbs={[[null, "예산별 동네"]]} title="예산별로 살 수 있는 서울 아파트 동네"
      sub={`${asOf(meta.as_of)} 기준 · 국토교통부 실거래가 · 서울 법정동 ${rows.length}곳`}
      lead="같은 예산이라도 59㎡로 낮추거나 생애최초 대출을 쓰면 닿는 동네가 크게 달라져요. 예산을 골라 보세요.">
      <div className="flex flex-col gap-2">
        {BUDGETS.map((b) => {
          const n = needFor(b.v, rate.pct, true), n84 = rows.filter((r) => r.m84 && r.m84 <= b.v).length, n59 = rows.filter((r) => r.m59 && r.m59 <= b.v).length;
          return (
            <a key={b.slug} href={`/budget/${b.slug}/`} className="flex items-center gap-4 rounded-large border border-default-200 bg-content1 p-4 hover:border-primary-300">
              <span className="w-16 text-2xl font-bold text-primary">{b.label}</span>
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 text-small">
                  <span className="h-2 flex-1 rounded-full bg-default-100"><span className="block h-2 rounded-full bg-primary-400" style={{ width: `${(n84 / rows.length) * 100}%` }} /></span>
                  <span className="w-28 text-right"><b>{n84}곳</b> <span className="text-default-400">(59㎡ {n59})</span></span>
                </span>
                <span className="text-tiny text-default-500">필요 현금 {won(n.cash)} · 연소득 {won(n.income)} (생애최초)</span>
              </span>
              <span className="text-default-300" aria-hidden="true">›</span>
            </a>
          );
        })}
      </div>
      <p className="text-tiny text-default-400">막대는 84㎡ 중위가가 그 예산 이하인 동네의 비율이에요. 금리 {rate.pct}%({rate.month}) + 스트레스 3%p, 30년 상환 기준 추정.</p>
      <Cta>내 소득·모은 돈으로 정확한 예산 계산하기 →</Cta>
    </Page>
  );
}
