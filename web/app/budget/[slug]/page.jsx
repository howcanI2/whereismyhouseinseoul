// /budget/<n>eok/: 서울 동네 whose recent 84㎡ (or 59㎡) median fits a given budget, plus what that budget takes in cash
// and income under today's loan rules. Rebuilt with every data refresh.
import { GU, readJson, slugOf, won } from "../../gu/data";
import { man, MIN_YEAR } from "../../../src/tiers.js";
import { needFor, shareBelow } from "../../../src/money.js";
import { rateNow, tiersNow } from "../../_data.js";
import { asOf, Cta, Note, Page, Section, Table } from "../../_ui.jsx";
import { BUDGETS, budgetOf } from "../amounts.js";

export const dynamicParams = false;
export const generateStaticParams = () => BUDGETS.map((b) => ({ slug: b.slug }));

function load(slug) {
  const b = budgetOf(slug), t = tiersNow();
  const rows = t.dong.rows.map((r) => ({ ...r, tier: t.dong.tier.get(r.key), share: shareBelow(r.q, b.v) }));
  const fit84 = rows.filter((r) => r.m84 && r.m84 <= b.v).sort((a, c) => c.ppp - a.ppp);
  const fit59 = rows.filter((r) => r.m59 && r.m59 <= b.v && !(r.m84 && r.m84 <= b.v)).sort((a, c) => c.ppp - a.ppp);
  const byGu = GU.map(([g]) => ({ g, n84: fit84.filter((r) => r.gu === g).length, n59: fit59.filter((r) => r.gu === g).length, all: rows.filter((r) => r.gu === g).length }))
    .filter((x) => x.all).sort((a, c) => c.n84 - a.n84 || c.n59 - a.n59);
  return { b, rows, fit84, fit59, byGu, meta: readJson("insights.json").meta };
}

export function generateMetadata({ params }) {
  const { b, rows, fit84, fit59, meta } = load(params.slug);
  return {
    title: `${b.label}으로 살 수 있는 서울 아파트 동네 · 서울 내집마련 전략판`,
    description: `${asOf(meta.as_of)} 실거래가 기준, 84㎡ 중위가가 ${b.label} 이하인 서울 동네 ${fit84.length}곳(전체 ${rows.length}곳 중), 59㎡까지 넓히면 ${fit84.length + fit59.length}곳. ${b.label} 집을 사는 데 필요한 현금과 연소득도 계산했습니다.`,
    alternates: { canonical: `/budget/${b.slug}/` },
    openGraph: { title: `${b.label}으로 살 수 있는 서울 아파트 동네`, url: `/budget/${b.slug}/`, type: "article" },
  };
}

const dongRow = (r) => [r.name, <a key="g" href={`/gu/${slugOf(r.gu)}/`} className="text-primary">{r.gu}</a>, `${r.tier}급지`, won(r.m84), won(r.m59), r.share == null ? "–" : `${r.share}%`, `${r.n12}건`];

export default function BudgetPage({ params }) {
  const { b, rows, fit84, fit59, byGu, meta } = load(params.slug);
  const rate = rateNow(), first = needFor(b.v, rate.pct, true), other = needFor(b.v, rate.pct, false);
  const gus84 = byGu.filter((x) => x.n84 > 0);
  return (
    <Page wide crumbs={[["/budget/", "예산별 동네"], [null, b.label]]} title={`${b.label}으로 살 수 있는 서울 아파트 동네`}
      sub={`${asOf(meta.as_of)} 기준 · 국토교통부 실거래가 신고분 · 최근 1년 거래 ${MIN_YEAR}건 이상인 서울 법정동 ${rows.length}곳 대상`}>
      <p className="leading-relaxed text-default-700">
        최근 6개월 전용 84㎡ 중위가가 {b.label} 이하인 서울 동네는 <b>{fit84.length}곳</b>이고, 59㎡로 눈높이를 낮추면 {fit59.length}곳이 더 있습니다.
        {gus84.length ? ` 84㎡ 기준으로 닿는 동네가 가장 많은 구는 ${gus84.slice(0, 3).map((x) => `${x.g}(${x.n84}곳)`).join(", ")}입니다.` : " 84㎡ 기준으로는 닿는 동네가 없습니다."}
        {" "}중위가는 그 동네 거래의 가운데 가격이라, 중위가가 예산보다 높은 동네에도 예산 안의 거래가 일부 있습니다. 표의 &lsquo;예산 이하 거래&rsquo;는 최근 6개월 거래 중 {b.label} 이하로 팔린 비율(모든 면적)입니다.
      </p>

      <Section title={`${b.label} 아파트를 사려면 (추정)`}>
        <Table head={["", "생애최초", "생애최초 아님"]} rows={[
          ["취득세 + 중개보수", won(first.acq + first.fee), won(other.acq + other.fee)],
          ["대출 가능 (DSR 전)", `${won(first.loan)} (LTV ${first.ltv * 100}%)`, `${won(other.loan)} (LTV ${other.ltv * 100}%)`],
          ["필요한 현금", won(first.cash), won(other.cash)],
          ["필요한 연소득", won(first.income), won(other.income)],
          ["매달 상환액", won(first.monthly), won(other.monthly)],
        ]} note={`금리 ${rate.pct}%(${rate.month} 주담대 평균), 스트레스 금리 3%p, 30년 원리금균등 상환 기준. 대출은 LTV와 주담대 한도(15억 이하 6억) 중 작은 금액, 연소득은 그 대출을 DSR 40% 안에서 받을 수 있는 최소 소득입니다.`} />
        <p className="text-small text-default-600">소득이 이보다 낮으면 대출이 줄어 현금이 더 필요합니다. 내 소득·모은 돈으로 정확히 계산하려면 <a href="/" className="text-primary underline">내 조건</a>을 넣어 보세요. 계산 방식은 <a href="/guide/first-home/" className="text-primary underline">생애최초 가이드</a>에 있습니다.</p>
      </Section>

      <Section title={`84㎡ 중위가가 ${b.label} 이하인 동네 (${fit84.length}곳)`}>
        {fit84.length
          ? <Table head={["동", "구", "급지", "84㎡ 중위가", "59㎡ 중위가", "예산 이하 거래", "1년 거래"]} rows={fit84.map(dongRow)} note="평당가가 높은 동네부터. 급지는 최근 1년 실거래 평당가 기준 이 사이트의 자체 분류입니다." />
          : <Note>지금 시세로는 84㎡ 중위가가 {b.label} 이하인 동네가 없습니다. 59㎡나 다른 예산을 보세요.</Note>}
      </Section>

      {fit59.length > 0 && (
        <Section title={`59㎡라면 추가로 닿는 동네 (${fit59.length}곳)`}>
          <Table head={["동", "구", "급지", "84㎡ 중위가", "59㎡ 중위가", "예산 이하 거래", "1년 거래"]} rows={fit59.map(dongRow)} />
        </Section>
      )}

      <Section title="구별로 보면">
        <Table head={["구", "84㎡로 닿는 동", "59㎡로 더 닿는 동", "대상 동"]} rows={byGu.map((x) => [<a key="g" href={`/gu/${slugOf(x.g)}/`} className="text-primary">{x.g}</a>, `${x.n84}곳`, `${x.n59}곳`, `${x.all}곳`])} />
      </Section>

      <Section title="다른 예산">
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((o) => (o.slug === b.slug ? null : <a key={o.slug} href={`/budget/${o.slug}/`} className="rounded-medium bg-default-100 px-3 py-1 text-small text-primary">{o.label}</a>))}
        </div>
      </Section>

      <Cta>내 조건으로 지도에서 예산 안 동네 보기 →</Cta>
    </Page>
  );
}
