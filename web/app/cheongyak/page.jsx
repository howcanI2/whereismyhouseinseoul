// /cheongyak/: 청약 일정 in 서울·경기 from 청약홈 (applyhome.json), plus the 청약 rules the site tracks (policy.json).
import { readJson, won } from "../gu/data";
import { asOf, Cta, Note, Page, Section, Table } from "../_ui.jsx";

const load = () => ({ a: readJson("applyhome.json"), policy: readJson("policy.json").filter((p) => p.category === "청약") });
const md = (d) => (d ? d.slice(5).replace("-", "/") : "–");
const priceRange = (types) => {
  const v = (types || []).map((t) => t.price_max).filter(Boolean);
  if (!v.length) return "–";
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? won(lo) : `${won(lo)}~${won(hi)}`;
};
const region = (x) => (x.addr || "").split(" ").slice(0, 2).join(" ").replace("서울특별시", "서울").replace("경기도", "경기");

export function generateMetadata() {
  const { a } = load(), open = a.items.filter((x) => x.receipt_end >= a.as_of);
  return {
    title: "서울·경기 아파트 청약 일정 · 서울 내집마련 전략판",
    description: `${asOf(a.as_of)} 기준 청약홈 공고: 접수 예정·진행 중 ${open.length}곳, 최근 공고 ${a.items.length}곳의 접수일, 세대수, 주택형별 분양가 상한을 정리했습니다.`,
    alternates: { canonical: "/cheongyak/" },
  };
}

export default function Cheongyak() {
  const { a, policy } = load();
  const items = [...a.items].sort((x, y) => (y.receipt_start || "").localeCompare(x.receipt_start || ""));
  const open = items.filter((x) => x.receipt_end >= a.as_of).reverse(), past = items.filter((x) => x.receipt_end < a.as_of);
  const row = (x) => [<a key="n" href={x.url} target="_blank" rel="noopener noreferrer" className="text-primary">{x.name}</a>, region(x), `${x.households.toLocaleString("ko-KR")}세대`,
    `${md(x.receipt_start)}~${md(x.receipt_end)}`, md(x.winner), priceRange(x.types)];
  const head = ["단지", "지역", "공급", "접수", "당첨 발표", "분양가 상한"];
  return (
    <Page wide crumbs={[[null, "청약 일정"]]} title="서울·경기 아파트 청약 일정" sub={`${asOf(a.as_of)} 갱신 · 한국부동산원 청약홈 분양정보 (${asOf(a.since)} 이후 공고)`}>
      <p className="leading-relaxed text-default-700">
        청약홈에 올라온 서울·경기 아파트 분양 공고를 접수일 순으로 모았습니다. 지금 접수 중이거나 접수 예정인 곳은 {open.length}곳입니다.
        단지 이름을 누르면 청약홈 공고 원문으로 이동합니다. 분양가 상한은 주택형별 최고 분양가의 범위입니다.
      </p>
      <Section title={`접수 중·접수 예정 (${open.length}곳)`}>
        {open.length ? <Table head={head} rows={open.map(row)} /> : <Note>지금 접수 중이거나 예정된 공고가 없습니다. 새 공고는 매일 반영됩니다.</Note>}
      </Section>
      <Section title={`최근 마감된 공고 (${past.length}곳)`}>
        <Table head={head} rows={past.map(row)} />
      </Section>
      {policy.length > 0 && (
        <Section title="알아둘 청약 규칙">
          <Table wrap head={["항목", "내용", "확인"]} rows={policy.map((p) => [p.item, p.value, p.status === "확인" ? "확인" : "확인 필요"])}
            note="'확인 필요'는 보도 등으로만 확인해 공고 원문과 다를 수 있는 항목입니다. 신청 전 청약홈 공고문을 꼭 확인하세요." />
        </Section>
      )}
      <p className="text-small text-default-600">
        분양가와 내 예산을 비교하려면 <a href="/budget/" className="text-primary underline">예산별 동네</a>에서 필요한 현금을 보세요.
        앞으로 입주할 단지는 <a href="/newbuild/" className="text-primary underline">입주 예정</a>에 있습니다.
      </p>
      <Cta>내 예산으로 청약 단지 지도에서 보기 →</Cta>
    </Page>
  );
}
