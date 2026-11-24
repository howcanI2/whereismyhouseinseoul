// /redev/: 서울 재건축·재개발·정비사업 by 진행 단계 and 구, from 서울 열린데이터광장 (redev.json).
import { GU, readJson, slugOf } from "../gu/data";
import { asOf, Cta, Page, Section, Table } from "../_ui.jsx";

const STEPS = [
  ["후보지", "신속통합기획·모아타운 등의 후보로 선정된 단계. 아직 구역이 확정되지 않았습니다."],
  ["구역지정", "정비구역(또는 관리지역)으로 지정돼 사업 범위가 정해진 단계."],
  ["추진위", "조합을 만들기 위한 추진위원회가 승인된 단계."],
  ["조합설립", "소유자 동의를 받아 조합 설립 인가를 받은 단계."],
  ["건축심의", "건물 배치·층수 등 건축 계획을 심의받는 단계."],
  ["사업시행", "사업시행계획 인가. 세대수와 설계가 사실상 정해집니다."],
  ["관리처분", "관리처분계획 인가. 조합원 분담금과 일반분양 물량이 정해지고 이주·철거로 이어집니다."],
  ["착공", "공사가 시작된 단계. 일반분양(청약)은 보통 이 무렵 나옵니다."],
  ["준공", "공사가 끝나 입주하는 단계."],
];
const ORDER = STEPS.map((s) => s[0]);
const load = () => readJson("redev.json");

export function generateMetadata() {
  const r = load();
  return {
    title: "서울 재건축·재개발 진행 단계 현황 · 서울 내집마련 전략판",
    description: `서울 정비사업 ${r.length}곳을 후보지부터 준공까지 진행 단계별·구별로 정리했습니다. 관리처분·착공 단계 단지 목록 포함.`,
    alternates: { canonical: "/redev/" },
  };
}

export default function Redev() {
  const r = load(), upd = r.map((x) => x.updated).filter(Boolean).sort().at(-1);
  const cnt = (f) => r.filter(f).length;
  const types = ["재건축", "재개발", "모아타운", "신속통합기획", "기타"].filter((t) => cnt((x) => x.type === t));
  const near = r.filter((x) => x.step === "관리처분" || x.step === "착공")
    .sort((a, b) => ORDER.indexOf(b.step) - ORDER.indexOf(a.step) || (b.households || 0) - (a.households || 0));
  const after = (x) => ORDER.indexOf(x.step) >= ORDER.indexOf("조합설립");
  return (
    <Page wide crumbs={[[null, "재건축·재개발"]]} title="서울 재건축·재개발 진행 단계 현황" sub={`서울 열린데이터광장 정비사업 현황(OA-23112, OA-23113) · 가장 최근 갱신 항목 ${asOf(upd)}`}>
      <p className="leading-relaxed text-default-700">
        서울시가 공개하는 정비사업 {r.length.toLocaleString("ko-KR")}곳을 진행 단계별로 나눴습니다. 재건축·재개발은 단계마다 몇 년씩 걸리는 경우가 많아,
        지금 어느 단계인지가 입주 시기와 위험을 가늠하는 가장 기본적인 정보입니다. 관리처분·착공 단계인 {near.length}곳은 다른 곳보다 일반분양이나 입주에 가까이 와 있습니다.
        안전진단 결과는 공개 데이터가 없어 넣지 않았습니다.
      </p>
      <Section title="진행 단계별 현황">
        <Table head={["단계", ...types, "설명"]}
          rows={STEPS.map(([s, d]) => [s, ...types.map((t) => cnt((x) => x.step === s && x.type === t) || "–"), <span key="d" className="inline-block min-w-[16rem] whitespace-normal">{d}</span>])} />
      </Section>
      <Section title="구별 현황">
        <Table head={["구", "전체", "조합설립 이후", "관리처분·착공"]} rows={GU.map(([g]) => [
          <a key="g" href={`/gu/${slugOf(g)}/`} className="text-primary">{g}</a>, cnt((x) => x.gu === g), cnt((x) => x.gu === g && after(x)),
          cnt((x) => x.gu === g && (x.step === "관리처분" || x.step === "착공"))])} />
      </Section>
      <Section title={`관리처분·착공 단계 (${near.length}곳)`}>
        <Table head={["사업장", "구·동", "유형", "단계", "세대", "시공사"]}
          rows={near.map((x) => [x.name, `${x.gu} ${x.dong || ""}`, x.subtype || x.type, x.step, x.households ? x.households.toLocaleString("ko-KR") : "–", x.builder || "–"])}
          note="세대수는 계획 기준이며 바뀔 수 있습니다. 서울시 자료에 단계가 늦게 반영되는 곳도 있습니다." />
      </Section>
      <Cta>재건축 단지를 지도에서 보기 →</Cta>
    </Page>
  );
}
