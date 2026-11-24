// /newbuild/: 서울 신축 입주 예정 단지 (분양 공고의 입주 예정월) and the yearly supply by 구, from newbuild.json.
import { GU, readJson, slugOf, won } from "../gu/data";
import { asOf, Cta, Page, Section, Table, ym } from "../_ui.jsx";

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
  const price = (x) => (!x.price_min ? "–" : x.price_min === x.price_max ? won(x.price_min) : `${won(x.price_min)}~${won(x.price_max)}`);
  return (
    <Page wide crumbs={[[null, "입주 예정"]]} title="서울 신축 아파트 입주 예정 단지" sub={`${asOf(nb.as_of)} 갱신 · 한국부동산원 청약홈 분양 공고(${nb.notices_since.slice(0, 4)}년 이후) 기준`}>
      <p className="leading-relaxed text-default-700">
        분양 공고에 적힌 입주 예정월로 서울에서 앞으로 입주할 아파트 {up.length}곳을 모았습니다.
        연도별로는 {years.map((y) => `${y}년 ${total(y).toLocaleString("ko-KR")}세대`).join(", ")}가 입주 예정입니다.
        입주가 몰리는 시기와 지역은 전세가가 일시적으로 약해질 수 있어, 전세로 살면서 기다리거나 입주 무렵 나오는 매물을 볼 때 참고가 됩니다.
        분양 공고가 없는 재건축 조합원 물량 등은 빠져 있을 수 있습니다.
      </p>
      <Section title="구별 연도별 입주 예정 세대">
        <Table head={["구", ...years.map((y) => `${y}년`)]}
          rows={supply.map(({ g, s }) => [<a key="g" href={`/gu/${slugOf(g)}/`} className="text-primary">{g}</a>, ...years.map((y) => (s.upcoming[y] ? s.upcoming[y].toLocaleString("ko-KR") : "–"))])} />
      </Section>
      <Section title={`입주 예정 단지 (${up.length}곳, 입주 빠른 순)`}>
        <Table head={["단지", "구", "세대", "입주 예정", "분양가", "평당 분양가"]} rows={up.map((x) => [
          x.url ? <a key="n" href={x.url} target="_blank" rel="noopener noreferrer" className="text-primary">{x.name}</a> : x.name,
          x.region, `${x.households}세대`, ym(x.mvn), price(x), x.ppp ? `${x.ppp.toLocaleString("ko-KR")}만` : "–"])}
          note="분양가는 분양 당시 공고 기준이며 지금 시세와 다릅니다. 입주 예정월은 공사 일정에 따라 바뀔 수 있습니다." />
      </Section>
      <p className="text-small text-default-600">
        지금 접수 중인 분양은 <a href="/cheongyak/" className="text-primary underline">청약 일정</a>,
        정비사업으로 앞으로 지어질 단지는 <a href="/redev/" className="text-primary underline">재건축·재개발</a>에서 볼 수 있습니다.
      </p>
      <Cta>입주 예정 단지를 지도에서 보기 →</Cta>
    </Page>
  );
}
