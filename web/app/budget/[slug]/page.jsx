// /budget/<n>eok/: 서울 동네 whose recent 84㎡ (or 59㎡) median fits a given budget, plus what that budget takes in cash
// and income under today's loan rules. Rebuilt with every data refresh.
import { GU, readJson, slugOf, won } from "../../gu/data";
import { MIN_YEAR } from "../../../src/tiers.js";
import { needFor, shareBelow } from "../../../src/money.js";
import { rateNow, tiersNow } from "../../_data.js";
import { asOf, Bars, Cards, Cta, Fold, Note, Page, Section, Table, TierBadge } from "../../_ui.jsx";
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

const guLink = (g) => <a href={`/gu/${slugOf(g)}/`} className="text-primary">{g}</a>;
const dongRow = (r) => [r.name, guLink(r.gu), <TierBadge key="t" k={r.tier} />, won(r.m84), won(r.m59), r.share == null ? "–" : `${r.share}%`, `${r.n12}건`];
const HEAD = ["동", "구", "급지", "84㎡", "59㎡", "예산 이하 거래", "1년 거래"];

export default function BudgetPage({ params }) {
  const { b, rows, fit84, fit59, byGu, meta } = load(params.slug);
  const rate = rateNow(), first = needFor(b.v, rate.pct, true), other = needFor(b.v, rate.pct, false);
  const gus84 = byGu.filter((x) => x.n84 > 0);
  return (
    <Page wide icon="💰" crumbs={[["/budget/", "예산별 동네"], [null, b.label]]} title={`${b.label}으로 살 수 있는 서울 아파트 동네`}
      sub={`${asOf(meta.as_of)} 기준 · 국토교통부 실거래가 · 1년 거래 ${MIN_YEAR}건 이상 법정동 ${rows.length}곳`}
      lead={gus84.length ? `84㎡ 기준으로 닿는 동네가 가장 많은 구는 ${gus84.slice(0, 3).map((x) => x.g).join(", ")}입니다.` : "지금 시세로는 84㎡로 닿는 동네가 없어 59㎡를 함께 봐야 합니다."}
      stats={[["84㎡로 닿는 동네", `${fit84.length}곳`, `전체 ${rows.length}곳 중`, "accent"], ["59㎡까지 넓히면", `${fit84.length + fit59.length}곳`, `+${fit59.length}곳`], ["필요한 현금", won(first.cash), "생애최초"], ["필요한 연소득", won(first.income), "스트레스 DSR"]]}>

      <div className="flex flex-wrap gap-2">
        {BUDGETS.map((o) => (
          <a key={o.slug} href={`/budget/${o.slug}/`} className={`rounded-full px-3 py-1 text-small font-medium ${o.slug === b.slug ? "bg-primary text-primary-foreground" : "bg-default-100 text-default-700"}`}>{o.label}</a>
        ))}
      </div>

      {fit84.length > 0 ? (
        <Section icon="🏘" title="84㎡로 닿는 동네" desc="평당가가 높은(입지가 좋은) 동네부터. 누르면 그 구의 시세를 볼 수 있어요.">
          <Cards items={fit84.slice(0, 6).map((r) => ({ title: r.name, sub: r.gu, value: won(r.m84), badge: <TierBadge k={r.tier} />, href: `/gu/${slugOf(r.gu)}/` }))} />
          <Fold label={`${fit84.length}곳 전체 보기`}>
            <Table head={HEAD} rows={fit84.map(dongRow)} note="84㎡·59㎡는 최근 6개월 중위가. '예산 이하 거래'는 최근 6개월 거래 중 이 예산 이하로 팔린 비율(모든 면적)입니다." />
          </Fold>
        </Section>
      ) : <Note>지금 시세로는 84㎡ 중위가가 {b.label} 이하인 동네가 없어요. 59㎡나 다른 예산을 보세요.</Note>}

      {fit59.length > 0 && (
        <Section icon="🏠" title={`59㎡라면 ${fit59.length}곳 더`}>
          <Cards items={fit59.slice(0, 6).map((r) => ({ title: r.name, sub: r.gu, value: won(r.m59), badge: <TierBadge k={r.tier} />, href: `/gu/${slugOf(r.gu)}/` }))} />
          {fit59.length > 6 && <Fold label={`${fit59.length}곳 전체 보기`}><Table head={HEAD} rows={fit59.map(dongRow)} /></Fold>}
        </Section>
      )}

      <Section icon="🗺" title="구별로 닿는 동네 수" desc="84㎡ 중위가가 예산 이하인 동네 수">
        <Bars rows={byGu.filter((x) => x.n84 || x.n59).slice(0, 12).map((x) => ({ label: x.g, href: `/gu/${slugOf(x.g)}/`, value: x.n84, text: `${x.n84}곳${x.n59 ? ` +${x.n59}` : ""}` }))} />
        <p className="text-tiny text-default-400">+ 숫자는 59㎡로 더 닿는 동네 수예요.</p>
      </Section>

      <Section icon="🧮" title={`${b.label} 아파트를 사려면`} desc={`금리 ${rate.pct}%(${rate.month}) + 스트레스 3%p, 30년 상환 기준 추정`}>
        <div className="grid grid-cols-2 gap-2">
          {[["생애최초", first], ["생애최초 아님", other]].map(([label, n]) => (
            <div key={label} className="flex flex-col gap-1 rounded-medium bg-default-50 p-3 text-small">
              <span className="font-semibold">{label}</span>
              <span className="flex justify-between"><span className="text-default-500">대출</span>{won(n.loan)}</span>
              <span className="flex justify-between"><span className="text-default-500">세금·수수료</span>{won(n.acq + n.fee)}</span>
              <span className="flex justify-between"><span className="text-default-500">필요 현금</span><b>{won(n.cash)}</b></span>
              <span className="flex justify-between"><span className="text-default-500">필요 연소득</span><b>{won(n.income)}</b></span>
              <span className="flex justify-between"><span className="text-default-500">월 상환</span>{won(n.monthly)}</span>
            </div>
          ))}
        </div>
        <p className="text-tiny text-default-400">대출은 LTV(생애최초 70%, 그 외 40%)와 주담대 한도(15억 이하 6억) 중 작은 금액이고, 연소득은 그 대출을 DSR 40% 안에서 받을 수 있는 최소 소득이에요. 소득이 이보다 낮으면 대출이 줄어 현금이 더 필요해요. <a href="/guide/first-home/" className="underline">계산 방법</a></p>
      </Section>

      <Cta>내 소득·모은 돈으로 지도에서 보기 →</Cta>
    </Page>
  );
}
