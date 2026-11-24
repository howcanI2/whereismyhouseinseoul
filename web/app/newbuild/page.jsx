// /newbuild/: 서울 신축 입주 예정 단지 (분양 공고의 입주 예정월) and the yearly supply by 구, from newbuild.json.
import { GU, readJson, slugOf, won } from "../gu/data";
import { asOf, Bars, Columns, Cta, Fold, Page, Section, Table, ym } from "../_ui.jsx";

const load = () => readJson("newbuild.json");

export function generateMetadata() {
  const nb = load(), up = nb.upcoming.filter((x) => x.sido === "11");
  return {
    title: "서울 신축 아파트 입주 예정 단지 · 서울 내집마련 전략판",
    description: `${asOf(nb.as_of)} 기준 청약홈 분양 공고로 본 서울 입주 예정 아파트 ${up.length}곳(${up.reduce((s, x) => s + (x.households || 0), 0).toLocaleString("ko-KR")}세대)의 입주 예정월, 분양가, 구별 연도별 공급.`,
    alternates: { canonical: "/newbuild/" },
  };
}

export default function NewBuild() {
  const nb = load();
  const up = nb.upcoming.filter((x) => x.sido === "11").sort((a, b) => (a.mvn || "").localeCompare(b.mvn || ""));
  const years = [...new Set(up.map((x) => (x.mvn || "").slice(0, 4)).filter(Boolean))].sort();
  const supply = GU.map(([g]) => ({ g, s: nb.supply[g] })).filter((x) => x.s && Object.keys(x.s.upcoming || {}).length);
  const total = (y) => supply.reduce((s, x) => s + (x.s.upcoming[y] || 0), 0);
  const guTotal = supply.map(({ g, s }) => ({ g, n: Object.values(s.upcoming).reduce((a, b) => a + b, 0) })).sort((a, b) => b.n - a.n);
  const all = up.reduce((s, x) => s + (x.households || 0), 0);
  const price = (x) => (!x.price_min ? "–" : x.price_min === x.price_max ? won(x.price_min) : `${won(x.price_min)}~${won(x.price_max)}`);
  return (
    <Page wide icon="🏢" crumbs={[[null, "입주 예정"]]} title="서울 신축 아파트 입주 예정" sub={`${asOf(nb.as_of)} 갱신 · 한국부동산원 청약홈 분양 공고 기준`}
      lead="입주가 몰리는 시기·지역은 전세가가 잠깐 약해질 수 있어, 전세로 기다리거나 입주 무렵 매물을 볼 때 참고가 돼요."
      stats={[["입주 예정 단지", `${up.length}곳`, "서울", "accent"], ["입주 예정 세대", all.toLocaleString("ko-KR"), "분양 공고 기준"], ["가장 많은 구", guTotal[0]?.g || "–", guTotal[0] ? `${guTotal[0].n.toLocaleString("ko-KR")}세대` : ""]]}>
      <Section icon="📅" title="연도별 입주 예정 세대">
        <Columns rows={years.map((y) => ({ label: `${y}년`, value: total(y) }))} fmt={(v) => v.toLocaleString("ko-KR")} />
      </Section>
      <Section icon="🗺" title="구별 입주 예정 세대">
        <Bars rows={guTotal.slice(0, 12).map((x) => ({ label: x.g, href: `/gu/${slugOf(x.g)}/`, value: x.n, text: `${x.n.toLocaleString("ko-KR")}세대` }))} />
        <Fold label="구별·연도별 표로 보기">
          <Table head={["구", ...years.map((y) => `${y}년`)]} rows={supply.map(({ g, s }) => [g, ...years.map((y) => (s.upcoming[y] ? s.upcoming[y].toLocaleString("ko-KR") : "–"))])} />
        </Fold>
      </Section>
      <Section icon="🏗" title="곧 입주하는 단지" desc="입주 예정월이 빠른 순. 분양가는 분양 당시 공고 기준이에요.">
        <ul className="flex flex-col gap-2">
          {up.slice(0, 8).map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 rounded-medium bg-default-50 px-3 py-2 text-small">
              <span className="min-w-0"><b className="block truncate">{x.name}</b><span className="text-tiny text-default-500">{x.region} · {x.households}세대 · {price(x)}</span></span>
              <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-tiny font-semibold text-primary">{ym(x.mvn).replace("년 ", ".").replace("월", "")}</span>
            </li>
          ))}
        </ul>
        {up.length > 8 && (
          <Fold label={`${up.length}곳 전체 보기`}>
            <Table head={["단지", "구", "세대", "입주 예정", "분양가", "평당 분양가"]} rows={up.map((x) => [
              x.url ? <a key="n" href={x.url} target="_blank" rel="noopener noreferrer" className="text-primary">{x.name}</a> : x.name,
              x.region, `${x.households}세대`, ym(x.mvn), price(x), x.ppp ? `${x.ppp.toLocaleString("ko-KR")}만` : "–"])}
              note="입주 예정월은 공사 일정에 따라 바뀔 수 있어요. 분양 공고가 없는 재건축 조합원 물량은 빠져 있을 수 있어요." />
          </Fold>
        )}
      </Section>
      <Cta>입주 예정 단지를 지도에서 보기 →</Cta>
    </Page>
  );
}
