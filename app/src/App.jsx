import { useEffect, useMemo, useState } from "react";
import { Tab, Tabs } from "@heroui/react";
import Atlas from "./Atlas.jsx";
import { LoanTab, PlanTab, PolicyTab } from "./Tabs.jsx";
import { derive, fmt, useData, won } from "./lib.js";

// Three screens, one question each: where can I buy, how much can I afford, what do I do next.
const TABS = [
  ["map", "지도", "어디를 살 수 있나"],
  ["money", "내 돈", "얼마까지, 월 얼마"],
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
  const { data, errors } = useData();
  const dv = useMemo(() => derive(data), [data]);
  const [tab, setTab] = useState(() => (TABS.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : "map"));
  useEffect(() => { try { history.replaceState(null, "", "#" + tab); } catch (e) { /* hash is cosmetic */ } }, [tab]);
  const b = (s) => data.budget?.find((x) => x.scenario === s);
  const failed = Object.keys(errors);

  return (
    <main className="page mx-auto flex max-w-[1440px] flex-col gap-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-tiny font-medium text-primary">오류동 기숙사 → 광화문 출퇴근 · 결혼 3년 후 매수 목표</span>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">서울 내집마련 전략판</h1>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-large bg-content1 px-4 py-3 shadow-small sm:grid-cols-4">
          <Stat label="지금 혼자" value={won(b("now")?.max_price_10k)} sub={dv.pay ? `월 ${won(dv.pay.now.monthly)} 상환` : ""} />
          <Stat label="결혼 후 둘이" value={won(b("later")?.max_price_10k)} tone="text-primary" sub={dv.pay ? `월 ${won(dv.pay.later.monthly)} 상환` : ""} />
          <Stat label={`주담대 금리 ${dv.rateNow?.month?.slice(5) ?? ""}월`} value={dv.rateNow && fmt.rate(dv.rateNow.pct)} sub={dv.rateNow ? `전월 ${fmt.pp(dv.rateNow.change)}` : ""} tone={dv.rateNow?.change > 0 ? "text-danger" : ""} />
          <Stat label={`서울 거래 ${dv.market?.month?.slice(5) ?? ""}월`} value={dv.market && fmt.cnt(dv.market.trades)} sub={dv.market ? `전월 ${fmt.pct(dv.market.change)}` : ""} />
        </div>
      </header>

      {failed.length > 0 && <p className="text-small text-danger">일부 데이터를 불러오지 못했습니다: {failed.join(", ")}</p>}

      <Tabs aria-label="화면" color="primary" variant="solid" radius="full" size="lg" selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}
        classNames={{ base: "w-full", tabList: "bg-content1 shadow-small", tab: "px-5 h-11", panel: "px-0 pt-1" }}>
        {TABS.map(([k, l, q]) => (
          <Tab key={k} title={<span className="flex items-baseline gap-2"><span className="font-semibold">{l}</span><span className="hidden text-tiny opacity-70 sm:inline">{q}</span></span>}>
            {k === "map" && <Atlas data={data} />}
            {k === "money" && (
              <div className="flex flex-col gap-4">
                <PlanTab data={data} dv={dv} part="budget" />
                <LoanTab data={data} />
              </div>
            )}
            {k === "todo" && (
              <div className="flex flex-col gap-4">
                <PlanTab data={data} dv={dv} />
                <h2 className="mt-2 text-large font-semibold">알아둘 정책</h2>
                <PolicyTab data={data} />
              </div>
            )}
          </Tab>
        ))}
      </Tabs>

      <footer className="text-tiny leading-relaxed text-default-400">
        실거래가: 국토교통부 아파트 매매 실거래 (real-estate MCP, 2026-10-27 스냅샷). 금리: 한국은행 ECOS·은행연합회·언론 보도. 지도: 통계청·도로명주소 경계, 단지·역 위치는 카카오 로컬 검색.
        예산은 금리 4.66%, 스트레스 금리 3%p, 30년 상환, 월 250만 저축 가정의 추정이며 투자 조언이 아닙니다.
      </footer>
    </main>
  );
}
