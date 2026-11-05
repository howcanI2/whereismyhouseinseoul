"use client";
// 내 예산으로 갈 수 있는 동네, 급지 좋은 순: 급지 is this site's own grade from 실거래 평당가 (최근 1년, 같은 기준으로
// 다섯 등분), not a community list. Default view is 동 (구 averages hide 아현동 vs 망원동); a 구 tab shows the familiar
// picture. Everything is computed here from shared files and the viewer's own budget, which never leaves the browser.
import { useMemo, useState } from "react";
import { Button, ButtonGroup, Card, CardBody, CardHeader, Chip, Select, SelectItem, Skeleton, Tab, Tabs } from "@heroui/react";
import { estCommute, kmTo, shareBelow, won } from "./lib.js";

const MIN_YEAR = 30, MIN_6M = 10, SHOW = 15;
const TIER_TONE = ["", "danger", "warning", "success", "primary", "default"];
const COMMUTE = [["all", "통근 전체"], ["30", "30분 이내"], ["45", "45분 이내"], ["60", "60분 이내"]];

// rank by 평당가 and cut into five equal groups: 1급지 = top fifth
function grade(rows) {
  const s = [...rows].sort((a, b) => b.ppp - a.ppp), n = s.length, tier = new Map();
  s.forEach((r, i) => tier.set(r.key, Math.min(5, 1 + Math.floor((i * 5) / n))));
  const cut = [1, 2, 3, 4, 5].map((k) => { const m = s.filter((r) => tier.get(r.key) === k); return { k, lo: m.at(-1)?.ppp, hi: m[0]?.ppp }; });
  return { tier, cut };
}
const man = (v) => (v == null ? "–" : `${Math.round(v).toLocaleString("ko-KR")}만`);

export default function TierRank({ data }) {
  const [view, setView] = useState("dong");
  const [scen, setScen] = useState("later");
  const [area, setArea] = useState("84");
  const [commute, setCommute] = useState("all");
  const [more, setMore] = useState(false);
  const budget = data.budget?.find((b) => b.scenario === scen);
  const ins = data.insights, ds = data.dong_summary, gs = data.gu_summary;

  const base = useMemo(() => {
    if (!ins?.bdong || !ins?.gu || !ds || !gs) return null;
    const dsum = new Map(ds.map((r) => [r.id, r]));
    const dongs = Object.entries(ins.bdong)
      .filter(([, r]) => (r.p12?.n || 0) >= MIN_YEAR && r.p12?.ppp)
      .map(([key, r]) => {
        const s = dsum.get(key) || {};
        return { key, name: r.name, gu: r.gu, ppp: r.p12.ppp, n6: s.trades_6m ?? r.p6?.n ?? 0, m84: s.median_84_10k, m59: s.median_59_10k, q: r.p6?.q, center: r.center };
      });
    // 구 centre for the commute filter: the mean of its graded 동 centres
    const cen = {};
    dongs.forEach((d) => { if (!d.center) return; const c = (cen[d.gu] ||= [0, 0, 0]); c[0] += d.center[0]; c[1] += d.center[1]; c[2]++; });
    const gsum = new Map(gs.map((r) => [r.gu, r]));
    const gus = Object.entries(ins.gu).filter(([, r]) => r.p12?.ppp).map(([key, r]) => {
      const s = gsum.get(key) || {}, c = cen[key];
      return { key, name: key, gu: key, ppp: r.p12.ppp, n6: r.p6?.n || 0, m84: s.median_84_10k ?? r.p6?.p84, m59: s.median_59_10k, q: r.p6?.q, center: c ? [c[0] / c[2], c[1] / c[2]] : null };
    });
    // one scale for both: the 동 cut-offs also grade the 구, so "아현동 1급지 · 마포구 3급지" read on the same ruler
    const dg = grade(dongs), byPrice = (ppp) => (dg.cut.find((c) => c.lo != null && ppp >= c.lo) || { k: 5 }).k;
    const gtier = new Map(gus.map((g) => [g.key, byPrice(g.ppp)]));
    const gcut = [1, 2, 3, 4, 5].map((k) => ({ k, lo: dg.cut[k - 1].lo, hi: dg.cut[k - 1].hi }));
    return { dong: { rows: dongs, ...dg }, gu: { rows: gus, tier: gtier, cut: gcut } };
  }, [ins, ds, gs]);

  const work = data.work || {};
  const list = useMemo(() => {
    if (!base || !budget) return null;
    const B = budget.max_price_10k, lv = base[view], guTier = base.gu.tier;
    return lv.rows
      .map((r) => ({ ...r, tier: lv.tier.get(r.key), guTier: guTier.get(r.gu), price: area === "84" ? r.m84 : r.m59,
        share: shareBelow(r.q, B), min: r.center ? estCommute(kmTo({ lon: r.center[0], lat: r.center[1] }, work)) : null }))
      .filter((r) => r.price && r.price <= B && r.n6 >= MIN_6M && (commute === "all" || (r.min != null && r.min <= Number(commute))))
      .sort((a, b) => a.tier - b.tier || b.n6 - a.n6);
  }, [base, budget, view, area, commute, work.lon, work.lat]);

  const cut = base?.[view]?.cut;
  const rows = list ? (more ? list : list.slice(0, SHOW)) : null;
  const unit = view === "dong" ? "동" : "구", eul = view === "dong" ? "동을" : "구를", iga = view === "dong" ? "동이" : "구가";

  return (
    <Card shadow="sm">
      <CardHeader className="flex flex-col items-stretch gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-medium font-semibold">내 예산으로 갈 수 있는 동네, 급지 좋은 순</h3>
          <p className="text-small text-default-500">
            {budget ? `${budget.label} 예산 ${won(budget.max_price_10k)} 안에 ${area}㎡ 중위가가 드는 ${eul} 급지 높은 순으로, 같은 급지 안에서는 최근 6개월 거래가 많은 순으로 보여 줍니다.` : "내 조건을 불러오는 중입니다."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs aria-label="단위" size="sm" radius="full" selectedKey={view} onSelectionChange={(k) => { setView(String(k)); setMore(false); }}>
            <Tab key="dong" title="동" />
            <Tab key="gu" title="구" />
          </Tabs>
          <ButtonGroup size="sm" radius="full">
            {[["now", data.budget?.[0]?.short || "지금"], ["later", data.budget?.[1]?.short || "나중에"]].map(([k, l]) => (
              <Button key={k} color={scen === k ? "primary" : "default"} variant={scen === k ? "solid" : "flat"} onPress={() => setScen(k)}>{l}</Button>
            ))}
          </ButtonGroup>
          <ButtonGroup size="sm" radius="full">
            {["59", "84"].map((a) => <Button key={a} color={area === a ? "primary" : "default"} variant={area === a ? "solid" : "flat"} onPress={() => setArea(a)}>{a}㎡</Button>)}
          </ButtonGroup>
          <Select aria-label="통근" size="sm" className="w-36" selectedKeys={[commute]} onSelectionChange={(s) => setCommute(String([...s][0] || "all"))}>
            {COMMUTE.map(([k, l]) => <SelectItem key={k}>{k === "all" ? l : `${work.name || "직장"} ${l}`}</SelectItem>)}
          </Select>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        {!rows ? <Skeleton className="h-48 w-full rounded-large" /> : rows.length === 0 ? (
          <p className="text-small text-default-500">이 조건에 맞는 {iga} 없습니다. 면적을 59㎡로 바꾸거나, 통근 조건을 풀거나, '내 조건'에서 예산·매수 시점을 바꿔 보세요.</p>
        ) : (
          <ol className="flex flex-col">
            {rows.map((r, i) => (
              <li key={r.key} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-default-100 py-2 text-small num last:border-0">
                <span className="text-default-400">{i + 1}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <b className="truncate">{r.name}</b>
                    <Chip size="sm" variant="flat" color={TIER_TONE[r.tier]}>{r.tier}급지</Chip>
                    {view === "dong" && <span className="text-tiny text-default-400">{r.gu} {r.guTier}급지</span>}
                  </span>
                  <span className="text-tiny text-default-400">
                    평당 {man(r.ppp)} · 6개월 {r.n6}건{r.share != null ? ` · 예산 안 거래 ${Math.round(r.share)}%` : ""}{r.min != null ? ` · 약 ${r.min}분` : ""}
                  </span>
                </span>
                <span className="whitespace-nowrap text-right font-semibold">{won(r.price)}</span>
              </li>
            ))}
          </ol>
        )}
        {list && list.length > SHOW && (
          <Button size="sm" variant="light" className="mt-1 self-start" onPress={() => setMore((m) => !m)}>{more ? "접기" : `${list.length - SHOW}곳 더 보기`}</Button>
        )}
        {cut && (
          <p className="mt-3 text-tiny leading-relaxed text-default-400">
            급지는 이 사이트가 최근 1년 실거래 평당가로 거래 {MIN_YEAR}건 이상인 법정동 {base.dong.rows.length}곳을 줄 세워 다섯 등분한 자체 기준이며{view === "gu" ? "(구는 같은 기준선에 구 평균을 대어 봄)" : ""}, 흔히 말하는 급지와 다를 수 있습니다.
            {" "}{cut.map((c) => `${c.k}급지 ${man(c.lo)}~${man(c.hi)}`).join(" · ")} (3.3㎡당).
            {" "}금액은 최근 6개월 {area}㎡ 중위가, 통근은 직선거리로 낸 대략값입니다. 투자 조언이 아닙니다.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
