"use client";
import { useMemo, useState } from "react";
import { Button, ButtonGroup, Card, CardBody, CardHeader, Chip, Link, Select, SelectItem, Skeleton } from "@heroui/react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, palette, useIsDark, useLazyFile, won } from "./lib.js";

const Box = ({ title, sub, children, right }) => (
  <Card shadow="sm">
    <CardHeader className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1"><h3 className="text-medium font-semibold">{title}</h3>{sub && <p className="text-small text-default-500">{sub}</p>}</div>
      {right}
    </CardHeader>
    <CardBody className="pt-0">{children}</CardBody>
  </Card>
);
const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
const YEARS = ["2026", "2027", "2028", "2029", "2030+"];
const yearKey = (y) => (y >= "2030" ? "2030+" : y);

// 신축: where new apartments are being sold, built and moved into, and who lives in the new neighbourhoods.
export default function NewBuildTab({ data }) {
  const nb = useLazyFile("newbuild");
  const [scope, setScope] = useState("11");
  const metro = scope === "all";
  const mSgg = useLazyFile("metro_sgg_geo", metro), mIns = useLazyFile("metro_insights", metro);
  const P = palette(useIsDark());
  const inScope = (r) => metro || r.sido === "11";

  if (!nb) return <Skeleton className="h-96 rounded-large" />;
  if (!nb.upcoming) return <p className="text-small text-default-500">신축 데이터를 아직 받지 못했습니다.</p>;
  const up = nb.upcoming.filter(inScope), recent = nb.recent.filter(inScope), selling = nb.selling.filter(inScope);
  const in12 = (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); const lim = d.toISOString().slice(0, 7); return up.filter((n) => n.mvn <= lim); })();
  const sum = (xs) => xs.reduce((s, x) => s + (x.households || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ButtonGroup size="md" radius="full">
          {[["11", "서울"], ["all", "서울+경기"]].map(([k, l]) => <Button key={k} color={scope === k ? "primary" : "default"} variant={scope === k ? "solid" : "flat"} onPress={() => setScope(k)}>{l}</Button>)}
        </ButtonGroup>
        <span className="text-tiny text-default-500">청약홈 분양 공고({nb.notices_since.slice(0, 4)}년 이후)의 입주 예정월과 K-apt 사용승인일 기준 · {nb.as_of}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["분양 중", `${selling.length}곳`, `${sum(selling).toLocaleString()}세대`, P.rose], ["1년 안 입주 예정", `${sum(in12).toLocaleString()}세대`, `${in12.length}단지`, P.indigo],
          ["전체 입주 예정", `${sum(up).toLocaleString()}세대`, `${up.length}단지 · ~${up.at(-1)?.mvn?.slice(0, 4) || ""}`, P.indigo], ["최근 2년 입주", `${sum(recent).toLocaleString()}세대`, `${recent.length}단지`, P.primary]].map(([l, v, s, c]) => (
          <div key={l} className="rounded-large bg-content1 px-4 py-3 shadow-small">
            <div className="flex items-center gap-1.5 text-tiny text-default-500"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</div>
            <div className="text-xl font-bold num">{v}</div><div className="text-tiny text-default-400 num">{s}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SupplyMap outline={metro ? mSgg : data.seoul_geo} up={up} recent={recent} selling={selling} P={P} />
        <SupplyChart supply={nb.supply} scope={scope} P={P} />
      </div>
      <Upcoming up={up} ins={data.insights} mIns={mIns} metro={metro} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Recent recent={recent} />
        <Ages age={nb.age} scope={scope} P={P} />
      </div>
    </div>
  );
}

/* dots on a drawn outline: 입주 예정 (size = 세대수), 최근 입주, 분양 중 */
function SupplyMap({ outline, up, recent, selling, P }) {
  const [show, setShow] = useState({ up: true, recent: true, selling: true });
  const world = useMemo(() => {
    if (!outline) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    outline.forEach((r) => polysOf(r.geometry).forEach((p) => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })));
    const kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180), S = 1000 / ((x1 - x0) * kx);
    const X = (lon) => (lon - x0) * kx * S, Y = (lat) => (y1 - lat) * S;
    const d = outline.map((r) => polysOf(r.geometry).map((p) => "M" + p[0].map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join("L") + "Z").join("")).join("");
    return { X, Y, H: (y1 - y0) * S, d, inside: (lon, lat) => lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1 };
  }, [outline]);
  const r = (hh) => Math.max(3, Math.sqrt(hh || 1) * 0.45);
  const layer = (rows, color, key, label) => show[key] && rows.filter((n) => n.lon != null && world.inside(n.lon, n.lat)).map((n) => (
    <circle key={key + n.id} cx={world.X(n.lon)} cy={world.Y(n.lat)} r={r(n.households)} fill={color} fillOpacity={0.55} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke"
      className={n.url ? "cursor-pointer" : undefined} onClick={() => n.url && window.open(n.url, "_blank", "noopener")}>
      <title>{`${n.name} · ${(n.households || 0).toLocaleString()}세대 · ${label}${n.mvn ? ` ${n.mvn}` : n.approval ? ` ${n.approval.slice(0, 7)}` : ""}${n.approx ? " · 위치는 동 중심(대략)" : ""}`}</title>
    </circle>
  ));
  return (
    <Box title="어디에 짓고 있나" sub="원 크기 = 세대수. 입주 예정 원을 누르면 분양 공고가 열립니다."
      right={<div className="flex flex-wrap gap-1">{[["up", "입주 예정", P.indigo], ["recent", "최근 입주", P.primary], ["selling", "분양 중", P.rose]].map(([k, l, c]) => (
        <Chip key={k} size="sm" variant={show[k] ? "solid" : "bordered"} className="cursor-pointer" style={show[k] ? { background: c, color: "#fff" } : { borderColor: c, color: c }} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>{l}</Chip>))}</div>}>
      {!world ? <Skeleton className="h-80 rounded-large" /> : (
        <svg viewBox={`-10 -10 1020 ${world.H + 20}`} className="h-auto w-full" role="img" aria-label="신축 공급 지도">
          <path d={world.d} fill="hsl(var(--heroui-default-100))" stroke="hsl(var(--heroui-default-400))" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          {layer(recent, P.primary, "recent", "입주")}
          {layer(up, P.indigo, "up", "입주 예정")}
          {layer(selling, P.rose, "selling", "분양 중")}
        </svg>
      )}
    </Box>
  );
}

/* 지역별 입주 예정 세대, by year */
function SupplyChart({ supply, scope, P }) {
  const colors = ["#C9D3F5", "#9DAEEB", "#6E86DF", "#4F63C9", "#2F3F8F"];
  const rows = Object.entries(supply || {}).filter(([, s]) => scope === "all" || s.sido === "11").map(([k, s]) => {
    const row = { region: k, recent: s.recent }; let tot = 0;
    Object.entries(s.upcoming).forEach(([y, v]) => { const yk = yearKey(y); row[yk] = (row[yk] || 0) + v; tot += v; });
    return { ...row, tot };
  }).filter((r) => r.tot > 0).sort((a, b) => b.tot - a.tot).slice(0, 15);
  return (
    <Box title="어디가 많이 짓나" sub="입주 예정 세대수 상위 15곳 (입주 연도별). 서울은 구, 경기는 시·군 단위.">
      <div style={{ height: Math.max(260, rows.length * 26 + 60) }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
            <CartesianGrid stroke={P.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: P.text, fontSize: 10 }} tickFormatter={(v) => (v >= 10000 ? `${v / 10000}만` : v.toLocaleString())} />
            <YAxis type="category" dataKey="region" width={64} tick={{ fill: P.text, fontSize: 11 }} />
            <Tooltip formatter={(v, n) => [`${Number(v).toLocaleString()}세대`, `${n}년 입주`]} contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {YEARS.map((y, i) => <Bar key={y} dataKey={y} stackId="a" fill={colors[i]} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-tiny text-default-400">입주가 몰리는 해에는 그 지역 전세가가 약해지는 경향이 있습니다. 분양 공고 기준이라 공고 없이 짓는 단지(조합원 물량 등)는 빠져 있습니다.</p>
    </Box>
  );
}

/* 입주 예정 목록: 분양가(전용 3.3㎡당) vs that region's 평당가 now */
function Upcoming({ up, ins, mIns, metro }) {
  const [region, setRegion] = useState("all");
  const regions = [...new Set(up.map((n) => n.region))].sort();
  const nowPpp = (n) => {
    if (n.sido === "11") return ins?.gu?.[n.region]?.p6?.ppp;
    const xs = Object.values(mIns?.sgg || {}).filter((r) => r.name?.startsWith(n.region) && r.p6?.ppp).map((r) => r.p6.ppp).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : null;
  };
  const rows = up.filter((n) => region === "all" || n.region === region);
  return (
    <Box title="입주 예정 단지" sub="입주 예정월 순. 분양가는 공고의 주택형별 최고가, 평당 분양가는 전용 3.3㎡ 기준 중위값으로 지역 평당 시세(최근 6개월 매매)와 비교합니다."
      right={<Select size="sm" aria-label="지역" className="w-36" selectedKeys={[region]} onSelectionChange={(k) => setRegion([...k][0] || "all")}>{[<SelectItem key="all">전체 지역</SelectItem>, ...regions.map((r) => <SelectItem key={r}>{r}</SelectItem>)]}</Select>}>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-tiny num">
          <thead className="sticky top-0 bg-content1 text-default-500"><tr><th className="py-1 text-left font-medium">입주</th><th className="text-left font-medium">단지</th><th className="text-right font-medium">세대</th><th className="text-right font-medium">분양가</th><th className="text-right font-medium">평당 분양가 / 지역 시세</th></tr></thead>
          <tbody>
            {rows.slice(0, 200).map((n) => { const p = nowPpp(n), ratio = n.ppp && p ? n.ppp / p : null; return (
              <tr key={n.id} className="border-t border-default-100 align-top">
                <td className="py-1.5 font-semibold">{n.mvn?.replace("-", ".")}</td>
                <td className="max-w-[18rem]"><div className="truncate font-medium">{n.url ? <Link href={n.url} isExternal size="sm" className="text-tiny">{n.name}</Link> : n.name}</div><div className="truncate text-[10px] text-default-400">{n.region} · {n.kind}{n.builder ? ` · ${n.builder}` : ""}</div></td>
                <td className="text-right">{n.households.toLocaleString()}</td>
                <td className="text-right">{n.price_min ? (n.price_min === n.price_max ? won(n.price_min) : `${won(n.price_min)}~${won(n.price_max)}`) : "—"}</td>
                <td className="text-right">{n.ppp ? won(n.ppp) : "—"}{p ? <span className="text-default-400"> / {won(p)}</span> : null}{ratio && <span className="ml-1" style={{ color: ratio > 1.05 ? "#E5484D" : ratio < 0.95 ? "#3E7BFA" : undefined }}>{ratio >= 1 ? "+" : ""}{Math.round((ratio - 1) * 100)}%</span>}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-default-400">분양 당시 가격이라 지금 시세와 시점이 다릅니다. 지역 시세는 구(서울) 또는 시 안 구들의 중위값(경기)으로, 단지 입지와는 차이가 납니다.</p>
    </Box>
  );
}

function Recent({ recent }) {
  const rows = [...recent].sort((a, b) => b.households - a.households).slice(0, 15);
  return (
    <Box title="최근 2년 입주한 큰 단지" sub="K-apt 사용승인일 기준, 세대수 순.">
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-default-100 py-1.5 text-tiny num">
            <span className="truncate"><b>{r.name}</b> <span className="text-default-400">{r.region} {r.dong}</span></span>
            <span className="text-default-500">{r.approval.slice(0, 7).replace("-", ".")}</span>
            <span className="w-16 text-right font-semibold">{r.households.toLocaleString()}세대</span>
          </li>
        ))}
      </ul>
    </Box>
  );
}

/* age mix of the 행정동 with the most new households, against the whole 시도 */
function Ages({ age, scope, P }) {
  if (!age?.dongs?.length) return null;
  const groups = [["아이 0-9세", [0], "#F2C14E"], ["10대", [1], "#F5DFA0"], ["20대", [2], "#B9C6F0"], ["30대", [3], "#4F63C9"], ["40대", [4], "#7E8FDB"], ["50대", [5], "#C9CFD6"], ["60세+", [6, 7, 8, 9], "#9AA5A1"]];
  const share = (v) => { const t = v.reduce((s, x) => s + x, 0) || 1; return groups.map(([, idx]) => idx.reduce((s, i) => s + v[i], 0) / t * 100); };
  const dongs = age.dongs.filter((d) => scope === "all" || d.sido === "11").slice(0, 10);
  const base = [["서울 전체", age.base?.["11"]], ...(scope === "all" ? [["경기 전체", age.base?.["41"]]] : [])].filter(([, v]) => v);
  const bar = (label, v, sub, strong) => { const s = share(v); return (
    <div key={label} className="grid grid-cols-[8.5rem_minmax(0,1fr)_3.2rem] items-center gap-2 text-tiny num">
      <span className={`truncate ${strong ? "font-semibold" : ""}`} title={label}>{label}{sub && <span className="block text-[10px] font-normal text-default-400">{sub}</span>}</span>
      <span className="flex h-3 overflow-hidden rounded-full">{s.map((x, i) => <span key={i} style={{ width: `${x}%`, background: groups[i][2] }} title={`${groups[i][0]} ${x.toFixed(1)}%`} />)}</span>
      <span className="text-right" style={{ color: P.indigo }}>{s[3].toFixed(0)}%</span>
    </div>
  ); };
  return (
    <Box title="신축이 많은 동네엔 누가 사나" sub={`최근 2년 입주 세대가 많은 행정동의 연령 구성 (행안부 주민등록 ${age.as_of}). 오른쪽 숫자는 30대 비중.`}>
      <div className="flex flex-col gap-1.5">
        {base.map(([l, v]) => bar(l, v, null, true))}
        <div className="my-1 border-t border-default-100" />
        {dongs.map((d) => bar(d.name.split(" ").slice(-2).join(" "), d.ages, `신축 ${d.new_hh.toLocaleString()}세대`))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">{groups.map(([l, , c]) => <span key={l} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>)}</div>
      <p className="mt-2 text-[10px] text-default-400">동네 전체 주민 기준이라 신축 입주자만의 연령은 아닙니다. 청약 당첨자 연령 통계는 공공데이터포털 '청약홈 청약 신청·당첨자 정보 조회 서비스' 활용신청 후 붙일 수 있습니다.</p>
    </Box>
  );
}
