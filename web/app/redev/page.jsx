// /redev/: 서울 재건축·재개발·정비사업 by 진행 단계 and 구, from 서울 열린데이터광장 (redev.json).
import { GU, readJson, slugOf } from "../gu/data";
import { asOf, Bars, Cta, Fold, Page, Section, Table } from "../_ui.jsx";

const STEPS = [
  ["후보지", "신속통합기획·모아타운 등의 후보로 선정. 구역은 아직 확정 전"],
  ["구역지정", "정비구역(또는 관리지역)으로 지정돼 사업 범위가 정해짐"],
  ["추진위", "조합을 만들기 위한 추진위원회 승인"],
  ["조합설립", "소유자 동의를 받아 조합 설립 인가"],
  ["건축심의", "건물 배치·층수 등 건축 계획 심의"],
  ["사업시행", "사업시행계획 인가. 세대수와 설계가 사실상 정해짐"],
  ["관리처분", "분담금과 일반분양 물량이 정해지고 이주·철거로"],
  ["착공", "공사 시작. 일반분양(청약)은 보통 이 무렵"],
  ["준공", "공사가 끝나 입주"],
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
  const near = r.filter((x) => x.step === "관리처분" || x.step === "착공")
    .sort((a, b) => ORDER.indexOf(b.step) - ORDER.indexOf(a.step) || (b.households || 0) - (a.households || 0));
  const after = (x) => ORDER.indexOf(x.step) >= ORDER.indexOf("조합설립");
  const byGu = GU.map(([g]) => ({ g, n: cnt((x) => x.gu === g), a: cnt((x) => x.gu === g && after(x)), near: cnt((x) => x.gu === g && (x.step === "관리처분" || x.step === "착공")) })).sort((a, b) => b.n - a.n);
  return (
    <Page wide icon="🏗" crumbs={[[null, "재건축·재개발"]]} title="서울 재건축·재개발 진행 현황" sub={`서울 열린데이터광장 정비사업 현황 · 최근 갱신 ${asOf(upd)}`}
      lead="정비사업은 단계마다 몇 년씩 걸려요. 지금 어느 단계인지가 입주 시기와 위험을 가늠하는 가장 기본 정보예요. 안전진단 결과는 공개 데이터가 없어 빠져 있어요."
      stats={[["정비사업", `${r.length.toLocaleString("ko-KR")}곳`, "서울 전체"], ["조합설립 이후", `${cnt(after)}곳`, "사업이 궤도에 오른 곳"], ["관리처분·착공", `${near.length}곳`, "분양·입주에 가까움", "accent"]]}>
      <Section icon="🪜" title="진행 단계별" desc="위에서 아래로 진행돼요.">
        <ol className="flex flex-col gap-1">
          {STEPS.map(([s, d], i) => {
            const n = cnt((x) => x.step === s), m = Math.max(...STEPS.map(([k]) => cnt((x) => x.step === k)));
            return (
              <li key={s} className="flex items-center gap-3 text-small">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-tiny font-bold ${i >= 6 ? "bg-primary text-white" : "bg-default-100 text-default-600"}`}>{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center justify-between"><b>{s}</b><span className="tabular-nums">{n}곳</span></span>
                  <span className="h-1.5 rounded-full bg-default-100"><span className="block h-1.5 rounded-full bg-primary-400" style={{ width: `${(n / m) * 100}%` }} /></span>
                  <span className="text-tiny text-default-500">{d}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </Section>
      <Section icon="🗺" title="구별 정비사업 수">
        <Bars rows={byGu.slice(0, 12).map((x) => ({ label: x.g, href: `/gu/${slugOf(x.g)}/`, value: x.n, text: `${x.n}곳` }))} />
        <Fold label="25개 구 전체 표로 보기">
          <Table head={["구", "전체", "조합설립 이후", "관리처분·착공"]} rows={byGu.map((x) => [x.g, x.n, x.a, x.near])} />
        </Fold>
      </Section>
      <Section icon="🚧" title="관리처분·착공 단계" desc="세대수는 계획 기준이며 바뀔 수 있어요.">
        <ul className="flex flex-col gap-2">
          {near.slice(0, 8).map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 rounded-medium bg-default-50 px-3 py-2 text-small">
              <span className="min-w-0"><b className="block truncate">{x.name}</b><span className="text-tiny text-default-500">{x.gu} {x.dong || ""} · {x.subtype || x.type}{x.households ? ` · ${x.households.toLocaleString("ko-KR")}세대` : ""}</span></span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-tiny font-semibold ${x.step === "착공" ? "bg-primary text-white" : "bg-primary-50 text-primary"}`}>{x.step}</span>
            </li>
          ))}
        </ul>
        {near.length > 8 && (
          <Fold label={`${near.length}곳 전체 보기`}>
            <Table head={["사업장", "구·동", "유형", "단계", "세대", "시공사"]}
              rows={near.map((x) => [x.name, `${x.gu} ${x.dong || ""}`, x.subtype || x.type, x.step, x.households ? x.households.toLocaleString("ko-KR") : "–", x.builder || "–"])} />
          </Fold>
        )}
      </Section>
      <Cta>재건축 단지를 지도에서 보기 →</Cta>
    </Page>
  );
}
