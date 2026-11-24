// /cheongyak/: 청약 일정 in 서울·경기 from 청약홈 (applyhome.json), plus the 청약 rules the site tracks (policy.json).
import { readJson, won } from "../gu/data";
import { asOf, Cta, Fold, Note, Page, Section, Table } from "../_ui.jsx";

const load = () => ({ a: readJson("applyhome.json"), policy: readJson("policy.json").filter((p) => p.category === "청약") });
const md = (d) => (d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : "–");
const priceRange = (types) => {
  const v = (types || []).map((t) => t.price_max).filter(Boolean);
  if (!v.length) return "–";
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? won(lo) : `${won(lo)}~${won(hi)}`;
};
const region = (x) => (x.addr || "").split(" ").slice(0, 2).join(" ").replace("서울특별시", "서울").replace("경기도", "경기");
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

export function generateMetadata() {
  const { a } = load(), open = a.items.filter((x) => x.receipt_end >= a.as_of);
  return {
    title: "서울·경기 아파트 청약 일정 · 서울 내집마련 전략판",
    description: `${asOf(a.as_of)} 기준 청약홈 공고: 접수 예정·진행 중 ${open.length}곳, 최근 공고 ${a.items.length}곳의 접수일, 세대수, 주택형별 분양가 상한을 정리했습니다.`,
    alternates: { canonical: "/cheongyak/" },
  };
}

function Item({ x, today }) {
  const d = days(today, x.receipt_start), live = x.receipt_start <= today && x.receipt_end >= today;
  const tag = live ? ["접수 중", "bg-danger text-white"] : d > 0 ? [`D-${d}`, "bg-primary text-white"] : null;
  return (
    <a href={x.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1.5 rounded-large border border-default-200 bg-content1 p-3 hover:border-primary-300">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0"><b className="block break-keep">{x.name}</b><span className="text-tiny text-default-500">{region(x)} · {x.households.toLocaleString("ko-KR")}세대</span></span>
        {tag && <span className={`shrink-0 rounded-full px-2 py-0.5 text-tiny font-semibold ${tag[1]}`}>{tag[0]}</span>}
      </span>
      <span className="grid grid-cols-3 gap-1 text-tiny">
        <span className="rounded-small bg-default-50 px-2 py-1"><span className="block text-default-400">접수</span>{md(x.receipt_start)}~{md(x.receipt_end)}</span>
        <span className="rounded-small bg-default-50 px-2 py-1"><span className="block text-default-400">발표</span>{md(x.winner)}</span>
        <span className="rounded-small bg-default-50 px-2 py-1"><span className="block text-default-400">분양가 상한</span>{priceRange(x.types)}</span>
      </span>
    </a>
  );
}

export default function Cheongyak() {
  const { a, policy } = load();
  const items = [...a.items].sort((x, y) => (y.receipt_start || "").localeCompare(x.receipt_start || ""));
  const open = items.filter((x) => x.receipt_end >= a.as_of).reverse(), past = items.filter((x) => x.receipt_end < a.as_of);
  const seoul = open.filter((x) => x.sido === "11").length;
  return (
    <Page wide icon="📝" crumbs={[[null, "청약 일정"]]} title="서울·경기 아파트 청약 일정" sub={`${asOf(a.as_of)} 갱신 · 한국부동산원 청약홈`}
      stats={[["접수 중·예정", `${open.length}곳`, `서울 ${seoul}곳`, "accent"], ["최근 마감", `${past.length}곳`, `${asOf(a.since).slice(6)} 이후`], ["공급 세대", `${open.reduce((s, x) => s + x.households, 0).toLocaleString("ko-KR")}`, "접수 중·예정"]]}>
      <Section icon="⏰" title="접수 중·접수 예정" desc="누르면 청약홈 공고 원문으로 이동해요.">
        {open.length ? <div className="grid gap-2 sm:grid-cols-2">{open.map((x) => <Item key={x.id} x={x} today={a.as_of} />)}</div>
          : <Note>지금 접수 중이거나 예정된 공고가 없어요. 새 공고는 매일 반영돼요.</Note>}
      </Section>
      <Section icon="📁" title={`최근 마감된 공고 ${past.length}곳`}>
        <Fold label="목록 펼치기">
          <Table head={["단지", "지역", "공급", "접수", "분양가 상한"]} rows={past.map((x) => [
            <a key="n" href={x.url} target="_blank" rel="noopener noreferrer" className="text-primary">{x.name}</a>, region(x), `${x.households}세대`, `${md(x.receipt_start)}~${md(x.receipt_end)}`, priceRange(x.types)])} />
        </Fold>
      </Section>
      {policy.length > 0 && (
        <Section icon="📌" title="알아둘 청약 규칙">
          <ul className="flex flex-col gap-2">
            {policy.map((p) => (
              <li key={p.id} className="rounded-medium bg-default-50 px-3 py-2 text-small">
                <span className="flex items-center gap-2"><b>{p.item}</b>{p.status !== "확인" && <span className="rounded-full bg-warning-100 px-2 text-tiny text-warning-700">확인 필요</span>}</span>
                <span className="text-default-600">{p.value}</span>
              </li>
            ))}
          </ul>
          <p className="text-tiny text-default-400">&lsquo;확인 필요&rsquo;는 보도로만 확인한 내용이에요. 신청 전 공고문을 꼭 확인하세요.</p>
        </Section>
      )}
      <Cta href="/budget/">분양가로 필요한 현금 계산해 보기 →</Cta>
    </Page>
  );
}
