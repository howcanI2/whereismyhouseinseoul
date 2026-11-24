// /tiers/: 서울 아파트 급지 순위, the same grades as the app's 급지 기준 tab, as plain HTML for search crawlers.
// Rebuilt on every deploy, so the cut-offs and lists follow the daily data refresh.
import { readJson, slugOf, won } from "../gu/data";
import { buildTiers, man, median, MIN_YEAR, tierRange } from "../../src/tiers.js";
import { needFor } from "../../src/money.js";
import { rateNow } from "../_data.js";
import { asOf, Cards, Cta, Fold, Note, Page, Section, Table, TierBadge } from "../_ui.jsx";

function load() {
  const ins = readJson("insights.json");
  const t = buildTiers(ins, readJson("dong_summary.json"), readJson("gu_summary.json"));
  const tiers = t.dong.cut.map((c) => {
    const ds = t.dong.rows.filter((r) => t.dong.tier.get(r.key) === c.k).sort((a, b) => b.ppp - a.ppp);
    return { ...c, ds, m84: median(ds.map((r) => r.m84)), m59: median(ds.map((r) => r.m59)),
      gus: t.gu.rows.filter((g) => t.gu.tier.get(g.key) === c.k).sort((a, b) => b.ppp - a.ppp) };
  });
  return { t, tiers, meta: ins.meta };
}

export function generateMetadata() {
  const { tiers, meta } = load();
  const top = tiers[0].gus.map((g) => g.name).join("·");
  return {
    title: "서울 아파트 급지 순위 (실거래가 기준) · 서울 내집마련 전략판",
    description: `${asOf(meta.as_of)} 기준 서울 법정동을 최근 1년 실거래 평당가로 1~5급지로 나눴습니다. 1급지 평당 ${man(tiers[0].lo)} 이상(${top}), 급지별 84㎡ 가격과 동네 목록.`,
    alternates: { canonical: "/tiers/" },
    openGraph: { title: "서울 아파트 급지 순위 (실거래가 기준)", url: "/tiers/", type: "article" },
  };
}

const guLink = (name) => <a href={`/gu/${slugOf(name)}/`} className="text-primary">{name}</a>;

export default function TiersPage() {
  const { t, tiers, meta } = load(), rate = rateNow();
  const gus = [...t.gu.rows].sort((a, b) => b.ppp - a.ppp);
  return (
    <Page wide icon="🏆" crumbs={[[null, "급지 순위"]]} title="서울 아파트 급지 순위" sub={`${asOf(meta.as_of)} 기준 · 국토교통부 실거래가 (${meta.notes.p12})`}
      lead={`흔히 말하는 '급지'를 실제 거래 가격으로 다시 매겼어요. 1년 거래 ${MIN_YEAR}건 이상인 서울 법정동 ${t.dong.rows.length}곳을 평당가 순으로 다섯 등분했고, 구는 같은 기준선에 구 평균을 대어 정했어요.`}
      stats={tiers.slice(0, 4).map((c) => [`${c.k}급지 84㎡`, won(c.m84), `평당 ${tierRange(c)}`, c.k === 1 ? "accent" : undefined])}>

      <Section icon="🪜" title="급지별 기준과 필요한 돈" desc={`84㎡ 대략 가격을 생애최초로 살 때 (금리 ${rate.pct}% + 스트레스 3%p, 30년)`}>
        <div className="flex flex-col gap-2">
          {tiers.filter((c) => c.m84).map((c) => {
            const n = needFor(c.m84, rate.pct, true);
            return (
              <a key={c.k} href={`#tier-${c.k}`} className="flex flex-col gap-1 rounded-medium bg-default-50 px-3 py-2 hover:bg-default-100">
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><TierBadge k={c.k} /><b>{won(c.m84)}</b><span className="text-tiny text-default-500">84㎡</span></span>
                  <span className="text-tiny text-default-500">{c.ds.length}개 동</span>
                </span>
                <span className="text-tiny text-default-600">현금 <b>{won(n.cash)}</b> · 연소득 <b>{won(n.income)}</b> · 대표 구 {c.gus.slice(0, 3).map((g) => g.name).join(", ") || "–"}</span>
              </a>
            );
          })}
        </div>
        <p className="text-tiny text-default-400">급지를 고를 때는 &ldquo;몇 급지에 살고 싶은가&rdquo;보다 &ldquo;현금과 소득 중 무엇이 먼저 막히는가&rdquo;를 보면 목표가 분명해져요. <a href="/budget/" className="underline">예산별 동네 보기</a></p>
      </Section>

      <Section icon="🗺" title="구별 평당가" desc="최근 1년 실거래 평당가. 오른쪽 배지는 구 평균의 급지예요.">
        <ul className="flex flex-col gap-1.5">
          {gus.map((g) => (
            <li key={g.key} className="grid grid-cols-[5.5rem_1fr_auto_auto] items-center gap-2 text-small">
              {guLink(g.name)}
              <span className="h-3 rounded-full bg-default-100"><span className="block h-3 rounded-full bg-primary-400" style={{ width: `${(g.ppp / gus[0].ppp) * 100}%` }} /></span>
              <span className="w-16 text-right tabular-nums">{man(g.ppp)}</span>
              <TierBadge k={t.gu.tier.get(g.key)} />
            </li>
          ))}
        </ul>
      </Section>

      {tiers.map((c) => (
        <Section key={c.k} id={`tier-${c.k}`} icon={<TierBadge k={c.k} />} title={`평당 ${tierRange(c)} · ${c.ds.length}곳`}>
          <Cards items={c.ds.slice(0, 6).map((r) => ({ title: r.name, sub: r.gu, value: won(r.m84), href: `/gu/${slugOf(r.gu)}/` }))} />
          <Fold label={`${c.k}급지 ${c.ds.length}곳 전체 보기`}>
            <Table head={["동", "구", "평당가", "84㎡ 중위가", "59㎡ 중위가", "1년 거래"]} rows={c.ds.map((r) => [r.name, guLink(r.gu), man(r.ppp), won(r.m84), won(r.m59), `${r.n12}건`])} />
          </Fold>
        </Section>
      ))}

      <Note icon="ℹ️">급지는 이 사이트가 실거래가로 매긴 자체 분류예요. 평당가는 면적·연식이 섞인 거래 전체 기준이라 재건축을 앞둔 오래된 단지가 많은 동은 높게 나올 수 있고, 학군·교통·신축 여부는 반영하지 않아요.</Note>
      <Cta href="/#money">내 소득·모은 돈으로 몇 급지까지 닿는지 계산하기 →</Cta>
    </Page>
  );
}
