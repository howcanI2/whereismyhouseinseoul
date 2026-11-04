"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonGroup, Tab, Tabs } from "@heroui/react";
import Atlas from "./Atlas.jsx";
import KakaoAtlas from "./KakaoAtlas.jsx";
import { PERIOD_NOTE } from "./Atlas.jsx";

import ProfileModal from "./Profile.jsx";
import WatchModal from "./Watch.jsx";
import NewBuildTab from "./NewBuild.jsx";
import TossBanner from "./TossBanner.jsx";
import { installExternalLinks } from "./TossLinks.js";
import { LoanTab, PlanTab, PolicyTab } from "./Tabs.jsx";
import { budgetsFrom, DEFAULT_WORK, derive, fmt, HOUSEHOLDS, householdOf, pendingFocus, workState, useData, useProfile, useWatch, won } from "./lib.js";

// every outside source the screens draw on, with the credit its licence asks for
const SOURCES = [
  ["아파트 매매·전월세 실거래가", "국토교통부 실거래가 공개시스템 (공공데이터포털)"],
  ["단지 기본정보·관리비", "국토교통부 공동주택관리정보시스템(K-apt)"],
  ["건축물대장 (세대수·용적률·주차)", "국토교통부 건축HUB (공공데이터포털)"],
  ["단지·구역 위치, 용도지역·토지이용계획", "국토교통부 공간정보 오픈플랫폼(브이월드)"],
  ["청약 분양정보", "한국부동산원 청약홈 (공공데이터포털)"],
  ["재개발·재건축 정비사업", "서울 열린데이터광장"],
  ["배정 초등학교·중학교군", "한국지방교육행정연구재단 학구도 (공공데이터포털)"],
  ["학원·교습소", "교육부 나이스 교육정보 개방 포털"],
  ["학교 공시 지표", "교육부 학교알리미"],
  ["인구·세대", "행정안전부 주민등록 인구통계"],
  ["주택담보대출 금리", "한국은행 경제통계시스템(ECOS)"],
  ["대출 상품·정책 소식", "금융위원회·주택도시기금·한국주택금융공사와 언론 보도를 요약 (항목마다 원문 링크)"],
  ["행정동 경계", "통계청 SGIS, vuski/admdongkor (CC BY 4.0)"],
  ["지하철 노선·역", "© OpenStreetMap contributors (ODbL)"],
  ["배경 지도", "카카오맵"],
];

// Next.js inlines this at build time; the claude.ai build has no Kakao key and uses the drawn map.
const KAKAO_KEY = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_KAKAO_JS_KEY : undefined;

// Three screens, one question each: where can I buy, how much can I afford, what do I do next.
const TABS = [
  ["map", "지도", "어디를 살 수 있나"],
  ["money", "내 돈", "얼마까지, 월 얼마"],
  ["new", "신축", "어디에 새로 짓나"],
  ["todo", "할 일", "언제 무엇을"],
];

function Stat({ label, value, sub, tone }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-tiny text-default-500">{label}</span>
      <span className={`text-xl font-bold leading-tight num ${tone || ""}`}>{value ?? "—"}</span>
      <span className="truncate text-tiny text-default-400 num">{sub}</span>
    </div>
  );
}

export default function App() {
  const { data: loaded, errors } = useData();
  const [profile, saveProfile, resetProfile] = useProfile();
  const [profileOpen, setProfileOpen] = useState(false);
  const [watchOpen, setWatchOpen] = useState(false);
  const [watch] = useWatch(), nWatch = Object.keys(watch).length;
  // budgets come from the viewer's own 내 조건, never from a shared file
  const work = profile.work?.lon != null ? profile.work : DEFAULT_WORK;
  Object.assign(workState, work);  // read by commute estimates and labels everywhere
  const data = useMemo(() => ({ ...loaded, work, budget: budgetsFrom(profile, loaded.rates?.at(-1)?.mortgage_pct) }), [loaded, profile]);
  const dv = useMemo(() => derive(data), [data]);
  // period labels ("7월~9월 vs 4월~6월") come from the daily refresh, so they move with the data
  if (data.insights?.meta?.notes) Object.assign(PERIOD_NOTE, data.insights.meta.notes);
  const [tab, setTab] = useState(() => (TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : "map"));
  useEffect(() => { installExternalLinks(); }, []);
  useEffect(() => { try { history.replaceState(null, "", "#" + tab); } catch (e) { /* hash is cosmetic */ } }, [tab]);
  const b = (s) => data.budget?.find((x) => x.scenario === s);
  const failed = Object.keys(errors);
  const [kakaoError, setKakaoError] = useState(null);
  const [scope, setScope] = useState("seoul");
  // a 청약 row's "지도에서 위치 보기": open the map (서울+경기 for a Gyeonggi site); the map then zooms to it
  useEffect(() => {
    const go = () => { const r = pendingFocus.apply; if (!r) return; if (r.sido !== "11") setScope("metro"); setTab("map"); window.scrollTo({ top: 0, behavior: "smooth" }); };
    window.addEventListener("hb:focus-apply", go); return () => window.removeEventListener("hb:focus-apply", go);
  }, []);

  return (
    <main className="page mx-auto flex max-w-[1440px] flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setProfileOpen(true)} className="flex w-fit items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-tiny font-medium text-primary hover:bg-primary-100">
              {profile.example ? "예시 조건으로 보는 중 · 내 조건 입력하기" : `내 조건: 직장 ${work.name} · ${HOUSEHOLDS.find(([k]) => k === householdOf(profile))[1]} · 연소득 ${won(profile.income)} · 모은 돈 ${won(profile.cash)}${Number(profile.marry) ? ` · ${profile.marry}년 뒤 매수` : ""} · 수정`}
            </button>
            <button type="button" onClick={() => setWatchOpen(true)} className="flex w-fit items-center gap-1 rounded-full bg-warning-50 px-3 py-1 text-tiny font-medium text-warning-700 hover:bg-warning-100">
              {nWatch ? `★ 관심 단지 ${nWatch}` : "☆ 관심 단지"}
            </button>
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">서울 내집마련 전략판</h1>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-large bg-content1 px-4 py-3 shadow-small sm:grid-cols-4">
          <Stat label={b("now")?.label} value={won(b("now")?.max_price_10k)} sub={dv.pay ? `월 ${won(dv.pay.now.monthly)} 상환` : ""} />
          <Stat label={b("later")?.label} value={won(b("later")?.max_price_10k)} tone="text-primary" sub={dv.pay ? `월 ${won(dv.pay.later.monthly)} 상환` : ""} />
          <Stat label={`주담대 금리 ${dv.rateNow?.month?.slice(5) ?? ""}월`} value={dv.rateNow && fmt.rate(dv.rateNow.pct)} sub={dv.rateNow ? `전월 ${fmt.pp(dv.rateNow.change)}` : ""} tone={dv.rateNow?.change > 0 ? "text-danger" : ""} />
          <Stat label={`서울 거래 ${dv.market?.month?.slice(5) ?? ""}월`} value={dv.market && fmt.cnt(dv.market.trades)} sub={dv.market ? `전월 ${fmt.pct(dv.market.change)}` : ""} />
        </div>
      </header>

      {failed.length > 0 && <p className="text-small text-danger">일부 데이터를 불러오지 못했습니다: {failed.join(", ")}</p>}
      <WatchModal open={watchOpen} onClose={() => setWatchOpen(false)} data={data} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} profile={profile} onSave={saveProfile} onReset={resetProfile} rate={loaded.rates?.at(-1)?.mortgage_pct} stations={loaded.subway} />

      <Tabs aria-label="화면" color="primary" variant="solid" radius="full" size="lg" selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}
        classNames={{ base: "w-full", tabList: "bg-content1 shadow-small", tab: "px-5 h-11", panel: "px-0 pt-1" }}>
        {TABS.map(([k, l, q]) => (
          <Tab key={k} title={<span className="flex items-baseline gap-2"><span className="font-semibold">{l}</span><span className="hidden text-tiny opacity-70 sm:inline">{q}</span></span>}>
            {k === "map" && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <ButtonGroup size="md" radius="full">
                  <Button color={scope === "seoul" ? "primary" : "default"} variant={scope === "seoul" ? "solid" : "flat"} onPress={() => setScope("seoul")}>서울</Button>
                  <Button color={scope === "metro" ? "primary" : "default"} variant={scope === "metro" ? "solid" : "flat"} onPress={() => setScope("metro")}>서울+경기 (출퇴근권)</Button>
                </ButtonGroup>
                <span className="text-tiny text-default-500">{scope === "metro" ? `서울 25개 구와 경기 시군구를 함께 봅니다. 통근시간으로 거르면 ${work.name} 출퇴근이 가능한 곳만 남습니다.` : "서울 구 · 법정동 · 행정동 단위로 봅니다."}</span>
              </div>
            )}
            {k === "map" && (KAKAO_KEY && !kakaoError ? <KakaoAtlas data={data} appKey={KAKAO_KEY} onFail={setKakaoError} scope={scope} /> : (
              <div className="flex flex-col gap-2">
                {kakaoError && (process.env.NEXT_PUBLIC_TOSS !== "1" || process.env.NEXT_PUBLIC_TOSS_AD_DEBUG === "1") && <p className="rounded-medium bg-warning-50 px-3 py-2 text-small text-warning-700">카카오맵을 불러오지 못해 기본 지도로 보여드립니다. 카카오 개발자 콘솔 &gt; 플랫폼 &gt; Web에 이 사이트 주소({typeof window !== "undefined" ? window.location.origin : ""})가 등록돼 있는지 확인하세요.</p>}
                <Atlas data={data} scope={scope} />
              </div>
            ))}
            {k === "money" && (
              <div className="flex flex-col gap-4">
                <PlanTab data={data} dv={dv} part="budget" />
                <TossBanner />
                <LoanTab data={data} />
              </div>
            )}
            {k === "new" && <NewBuildTab data={data} />}
            {k === "todo" && (
              <div className="flex flex-col gap-4">
                <PlanTab data={data} dv={dv} />
                <TossBanner />
                <h2 className="mt-2 text-large font-semibold">알아둘 정책</h2>
                <PolicyTab data={data} />
              </div>
            )}
          </Tab>
        ))}
      </Tabs>

      <footer className="flex flex-col gap-1.5 text-tiny leading-relaxed text-default-400">
        <p>예산은 내 조건(이 브라우저에만 저장)과 최신 주담대 금리, 스트레스 금리 3%p, 30년 상환으로 계산한 추정이며 투자 조언이 아닙니다. 통근 시간은 직선거리로 낸 대략값입니다.</p>
        {process.env.NEXT_PUBLIC_TOSS !== "1" && <p><a href="privacy/" className="underline">개인정보처리방침</a> · 광고는 Google AdSense가 쿠키를 사용해 게재합니다.</p>}
        <details>
          <summary className="cursor-pointer text-default-500">데이터 출처</summary>
          <ul className="mt-1 list-disc pl-4">
            {SOURCES.map(([what, who]) => <li key={what}><span className="text-default-500">{what}</span> · {who}</li>)}
          </ul>
        </details>
      </footer>
    </main>
  );
}
