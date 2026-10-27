import { memo, useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import "d3-transition";
import { Button, ButtonGroup, Chip, Divider, ScrollShadow, Skeleton, Slider, Switch } from "@heroui/react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { annuity, DSR, fmt, loanCap, LTV, palette, STRESS, useIsDark, won } from "./lib.js";
import { AGES, ageOk, AptDetail, AREAS, areaOk, dist, LINE_COLOR, polysOf, REF, STAGE_COLOR, STAGE_GROUPS, STAGES, stageOk, ZoneDetail } from "./Explorer.jsx";

export const LEVELS = [["auto", "자동"], ["gu", "구"], ["bdong", "법정동"], ["hdong", "행정동"]];
export const LEVEL_NAME = { gu: "구", bdong: "법정동", hdong: "행정동", apt: "단지" };
export const PERIODS = [["p3", "3개월"], ["p6", "6개월"], ["p12", "1년"]];
export const PERIOD_NOTE = { p3: "7~9월 vs 4~6월", p6: "4~9월 vs 직전 6개월", p12: "최근 12개월 vs 그 전 12개월" };
export const METRICS = [
  { id: "chg", l: "가격 변화", get: (r, p) => r[p]?.chg, f: fmt.pct, div: true },
  { id: "ppp", l: "평당가", get: (r, p) => r[p]?.ppp, f: (v) => won(v) },
  { id: "fit", l: "내 예산 비중", get: (r, p, s) => r[p]?.[s === "now" ? "fit_now" : "fit_later"], f: fmt.share },
  { id: "vol", l: "거래량 변화", get: (r, p) => r[p]?.vol_chg, f: fmt.pct, div: true },
  { id: "jeonse", l: "전세가율", get: (r) => r.jeonse_ratio, f: fmt.share },
];
export const BAND = [["s", "소형 ~60㎡", "#7DD3C0"], ["m", "중형 60~85㎡", "#2E9F86"], ["l", "중대형 85㎡~", "#0B5D4B"]];
export const UP = "#E5484D", DOWN = "#3E7BFA";
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mixc = (a, b, t) => { const A = hex(a), B = hex(b); t = Math.max(0, Math.min(1, t)); return "#" + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, "0")).join(""); };
export const lum = (h) => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

const Polys = memo(function Polys({ paths, guPaths, linePaths, showLines }) {
  return (
    <>
      {paths.map((p, i) => <path key={`${p.k}#${i}`} d={p.d} fill={p.fill} fillOpacity={p.op} stroke="hsl(var(--heroui-content1))" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />)}
      {guPaths.map((p, i) => <path key={`${p.k}#${i}`} d={p.d} fill="none" stroke="hsl(var(--heroui-default-500))" strokeOpacity="0.85" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />)}
      {guPaths.length > 0 && <path d={guPaths.map((p) => p.d).join("")} fill="none" stroke="hsl(var(--heroui-foreground))" strokeOpacity="0.5" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
      <clipPath id="seoul-clip"><path d={guPaths.map((p) => p.d).join("")} /></clipPath>
      {showLines && linePaths.map((l) => (
        <g key={l.line} clipPath="url(#seoul-clip)">
          <path d={l.d} fill="none" stroke="hsl(var(--heroui-content1))" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={l.d} fill="none" stroke={l.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </>
  );
});

export default function Atlas({ data }) {
  const dark = useIsDark(), P = palette(dark);
  const later = data.budget?.find((b) => b.scenario === "later"), now = data.budget?.find((b) => b.scenario === "now");
  const [scen, setScen] = useState("later");
  const [budget, setBudget] = useState(100000);
  const [level, setLevel] = useState("auto");
  const [period, setPeriod] = useState("p6");
  const [metricId, setMetricId] = useState("chg");
  const [area, setArea] = useState("all");
  const [age, setAge] = useState("all");
  const [sel, setSel] = useState(null);
  const [selRegion, setSelRegion] = useState(null);
  const [selZone, setSelZone] = useState(null);
  const [hover, setHover] = useState(null);
  const [trades, setTrades] = useState(null);
  const [showLines, setShowLines] = useState(true);
  const [showRedev, setShowRedev] = useState(false);
  const [stageGroup, setStageGroup] = useState("all");
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth >= 1024);
  const [t, setT] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wrapRef = useRef(null), svgRef = useRef(null), zoomRef = useRef(null), k0Ref = useRef(1), raf = useRef(0), moved = useRef(false);
  const m = METRICS.find((x) => x.id === metricId);

  useEffect(() => { if (later && now) setBudget(scen === "later" ? later.max_price_10k : now.max_price_10k); }, [scen, later, now]);
  useEffect(() => { if (sel && !trades) fetch("data/trades.json").then((r) => r.json()).then(setTrades).catch(() => setTrades({})); }, [sel, trades]);

  const world = useMemo(() => {
    if (!data.seoul_geo) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    data.seoul_geo.forEach((r) => polysOf(r.geometry).forEach((p) => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })));
    const kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180), S = 1000 / ((x1 - x0) * kx);
    return { X: (lon) => (lon - x0) * kx * S, Y: (lat) => (y1 - lat) * S, W: 1000, H: (y1 - y0) * S, perM: S / 110574 };
  }, [data.seoul_geo]);
  const dOf = (g) => polysOf(g).map((p) => p.map((ring) => "M" + ring.map(([x, y]) => `${world.X(x).toFixed(2)},${world.Y(y).toFixed(2)}`).join("L") + "Z").join("")).join("");
  const geoms = useMemo(() => {
    if (!world) return null;
    return {
      gu: (data.seoul_geo || []).map((r) => ({ key: r.gu, d: dOf(r.geometry) })),
      bdong: (data.dong_geo || []).map((r) => ({ key: r.id, d: dOf(r.geometry) })),
      hdong: (data.hdong_geo || []).map((r) => ({ key: r.code, d: dOf(r.geometry) })),
    };
  }, [world, data.seoul_geo, data.dong_geo, data.hdong_geo]);
  const linePaths = useMemo(() => {
    if (!world || !data.subway_lines) return [];
    const by = {};
    data.subway_lines.forEach((s) => { by[s.line] = (by[s.line] || "") + "M" + s.coords.map(([x, y]) => `${world.X(x).toFixed(2)},${world.Y(y).toFixed(2)}`).join("L"); });
    return Object.entries(by).sort(([a], [b]) => (/^\d/.test(a) ? 1 : 0) - (/^\d/.test(b) ? 1 : 0)).map(([line, d]) => ({ line, d, color: LINE_COLOR[line] || P.text }));
  }, [world, data.subway_lines]);

  // zoom: set up once, keep Seoul framed on resize until the viewer moves the map
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const fit = () => { const k0 = Math.min(size.w / world.W, size.h / world.H) * 0.94; k0Ref.current = k0; return zoomIdentity.translate((size.w - world.W * k0) / 2, (size.h - world.H * k0) / 2).scale(k0); };
  const sized = size.w > 0;
  useEffect(() => {
    if (!world || !sized || !svgRef.current) return;
    const tr0 = fit();
    const z = d3zoom().scaleExtent([k0Ref.current * 0.9, k0Ref.current * 60]).translateExtent([[-world.W * 0.15, -world.H * 0.15], [world.W * 1.15, world.H * 1.15]])
      .filter((e) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : !e.button))
      .on("zoom", (e) => { if (e.sourceEvent) moved.current = true; cancelAnimationFrame(raf.current); const tr = e.transform; raf.current = requestAnimationFrame(() => setT(tr)); });
    zoomRef.current = z;
    const s = select(svgRef.current).call(z).on("dblclick.zoom", null);
    s.call(z.transform, tr0);
    return () => { s.on(".zoom", null); zoomRef.current = null; };
  }, [world, sized]);
  useEffect(() => { if (world && zoomRef.current && size.w && !moved.current) select(svgRef.current).call(zoomRef.current.transform, fit()); }, [size.w, size.h]);
  const zoomTo = (cx, cy, rel) => { moved.current = true; const k = k0Ref.current * rel; select(svgRef.current).transition().duration(650).call(zoomRef.current.transform, zoomIdentity.translate(size.w / 2 - cx * k, size.h / 2 - cy * k).scale(k)); };
  const zoomBy = (f) => { moved.current = true; select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, f); };
  const reset = () => { if (!world) return; select(svgRef.current).transition().duration(650).call(zoomRef.current.transform, fit()); moved.current = false; };

  const z = t ? t.k / k0Ref.current : 1;
  const eff = level === "auto" ? (z < 2 ? "gu" : z < 5 ? "bdong" : "apt") : level;
  const regionLevel = eff === "apt" ? "bdong" : eff;
  const showPins = eff === "apt" || (level !== "auto" && z >= 6);
  const sx = (lon) => t.applyX(world.X(lon)), sy = (lat) => t.applyY(world.Y(lat));
  const inView = (x, y, mg = 30) => x > -mg && y > -mg && x < size.w + mg && y < size.h + mg;
  const fitOf = (v) => (v == null ? "none" : v <= budget ? "ok" : v <= budget * 1.15 ? "near" : "over");
  const fitColor = { ok: P.primary, near: P.amber, over: P.muted, none: P.muted };
  const fitText = { ok: "예산 안", near: "조금 넘음 (15% 이내)", over: "예산 초과" };
  const ins = data.insights;

  // colour scale for the current metric across the current level's regions
  const scale = useMemo(() => {
    if (!ins) return null;
    const vals = Object.values(ins[regionLevel] || {}).filter((r) => (r[period]?.n || 0) >= 5).map((r) => m.get(r, period, scen)).filter((v) => v != null).sort((a, b) => a - b);
    if (!vals.length) return null;
    const q = (p) => vals[Math.floor(p * (vals.length - 1))];
    const lo = q(0.05), hi = q(0.95);
    if (m.div) { const a = Math.max(Math.abs(lo), Math.abs(hi), 1); return { lo: -a, hi: a, color: (v) => (v >= 0 ? mixc(P.faint, UP, v / a) : mixc(P.faint, DOWN, -v / a)) }; }
    const base = m.id === "jeonse" ? P.amber : P.primary;
    return { lo, hi, color: (v) => mixc(P.faint, base, hi > lo ? (v - lo) / (hi - lo) : 0.5) };
  }, [ins, regionLevel, period, metricId, scen, dark]);
  const polyPaths = useMemo(() => {
    if (!geoms || !scale) return (geoms?.[regionLevel] || []).map((g) => ({ k: g.key, d: g.d, fill: P.none, op: 1 }));
    const tbl = ins[regionLevel] || {};
    return geoms[regionLevel].map((g) => {
      const r = tbl[g.key], v = r && (r[period]?.n || 0) >= 5 ? m.get(r, period, scen) : null;
      return { k: g.key, d: g.d, fill: v == null ? P.none : scale.color(v), op: eff === "apt" ? 0.35 : 0.85 };
    });
  }, [geoms, scale, regionLevel, period, metricId, scen, eff, dark]);

  // labelled region tags, busiest first, skipping overlaps
  const tags = useMemo(() => {
    if (!t || !ins || eff === "apt") return [];
    const tbl = ins[regionLevel] || {}, placed = [], out = [];
    Object.entries(tbl).filter(([, r]) => r.center && (r[period]?.n || 0) >= 3).sort((a, b) => (b[1][period]?.n || 0) - (a[1][period]?.n || 0)).forEach(([key, r]) => {
      const x = sx(r.center[0]), y = sy(r.center[1]);
      if (!inView(x, y)) return;
      const v = m.get(r, period, scen), w = 78, h = 46, bx = { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 };
      const full = placed.every((p) => bx.x1 < p.x0 || bx.x0 > p.x1 || bx.y1 < p.y0 || bx.y0 > p.y1);
      if (full) placed.push(bx);
      out.push({ key, r, x, y, v, full, fill: v == null || !scale ? "#ffffff" : scale.color(v) });
    });
    return out;
  }, [t, ins, regionLevel, period, metricId, scen, eff, scale, size]);

  const apts = useMemo(() => (data.apts || []).filter((a) => a.lon != null), [data.apts]);
  const visibleApts = useMemo(() => {
    if (!t || !world) return [];
    return apts.filter((a) => areaOk(a.median_area_sqm, area) && ageOk(a.build_year, age)).map((a) => ({ ...a, x: sx(a.lon), y: sy(a.lat), f: fitOf(a.median_price_10k) })).filter((a) => inView(a.x, a.y, 0));
  }, [apts, t, world, area, age, budget, size]);
  const pins = useMemo(() => {
    if (!showPins) return { labels: [], dots: [] };
    const placed = [], labels = [], dots = [];
    [...visibleApts].sort((a, b) => b.trades_6m - a.trades_6m).forEach((a) => {
      const txt = won(a.median_price_10k), w = txt.length * 7.5 + 14, bx = { x0: a.x - w / 2, x1: a.x + w / 2, y0: a.y - 26, y1: a.y - 4 };
      if (labels.length < 140 && placed.every((p) => bx.x1 < p.x0 || bx.x0 > p.x1 || bx.y1 < p.y0 || bx.y0 > p.y1)) { placed.push(bx); labels.push({ ...a, txt, w }); } else dots.push(a);
    });
    return { labels, dots };
  }, [visibleApts, showPins]);
  const stations = useMemo(() => {
    if (!t || !data.subway || z < 2 || !showLines) return [];
    const vis = data.subway.map((s) => ({ ...s, x: sx(s.lon), y: sy(s.lat) })).filter((s) => inView(s.x, s.y));
    if (z >= 5) { const placed = [], named = new Set(); vis.forEach((s) => { if (named.has(s.station)) return; const hw = s.station.length * 5.5, bx = { x0: s.x - hw, x1: s.x + hw, y0: s.y - 18, y1: s.y - 2 }; if (placed.every((p) => bx.x1 < p.x0 || bx.x0 > p.x1 || bx.y1 < p.y0 || bx.y0 > p.y1)) { placed.push(bx); named.add(s.station); s.label = true; } }); }
    return vis;
  }, [t, data.subway, z, size, showLines]);
  const zones = useMemo(() => (data.redev || []).filter((r) => r.lon != null && r.stage !== "준공"), [data.redev]);

  const selApt = sel ? (data.apts || []).find((a) => a.id === sel) : null;
  const pickApt = (a) => { setSel(a.id); setSelZone(null); if (a.lon != null && world) zoomTo(world.X(a.lon), world.Y(a.lat), Math.max(z, 7)); };
  const pickRegion = (lv, key) => {
    setSelRegion({ level: lv, key }); setSel(null); setSelZone(null);
    const r = ins?.[lv]?.[key];
    if (r?.center) zoomTo(world.X(r.center[0]), world.Y(r.center[1]), lv === "gu" ? 3.2 : lv === "bdong" ? 6 : 7);
  };
  const ready = world && data.dong_geo && ins;

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
        <div className="rounded-large bg-content1 p-4 shadow-small">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-small font-semibold">내 예산</span>
            <ButtonGroup size="sm" radius="full">
              <Button color={scen === "now" ? "primary" : "default"} variant={scen === "now" ? "solid" : "flat"} onPress={() => setScen("now")}>지금 혼자</Button>
              <Button color={scen === "later" ? "primary" : "default"} variant={scen === "later" ? "solid" : "flat"} onPress={() => setScen("later")}>결혼 후</Button>
            </ButtonGroup>
          </div>
          <Slider aria-label="최대 집값" size="sm" color="primary" step={1000} minValue={20000} maxValue={200000} value={budget} onChange={setBudget}
            renderValue={() => null} startContent={<span className="w-[4.5rem] shrink-0 whitespace-nowrap text-2xl font-bold text-primary num">{won(budget)}</span>} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AREAS.map(([k, l]) => <Chip key={k} size="sm" variant={area === k ? "solid" : "flat"} color={area === k ? "primary" : "default"} className="cursor-pointer" onClick={() => setArea(k)}>{l}</Chip>)}
            {AGES.slice(1).map(([k, l]) => <Chip key={k} size="sm" variant={age === k ? "solid" : "flat"} color={age === k ? "primary" : "default"} className="cursor-pointer" onClick={() => setAge(age === k ? "all" : k)}>{l}</Chip>)}
          </div>
        </div>
        {selApt ? <AptDetail apt={selApt} trades={trades} budget={budget} scen={scen} data={data} onClose={() => setSel(null)} P={P} fitOf={fitOf} fitText={fitText} fitColor={fitColor} />
          : selZone ? <ZoneDetail zone={zones.find((x) => x.id === selZone)} apts={apts} onClose={() => setSelZone(null)} P={P} budget={budget} />
          : selRegion && ins?.[selRegion.level]?.[selRegion.key] ? <RegionPanel lv={selRegion.level} rkey={selRegion.key} r={ins[selRegion.level][selRegion.key]} period={period} data={data} apts={apts} zones={zones} budget={budget} scen={scen} P={P} fitOf={fitOf} fitColor={fitColor} onClose={() => setSelRegion(null)} onApt={pickApt} />
          : <Overview data={data} ins={ins} period={period} level={regionLevel} m={m} scen={scen} onPick={(key) => pickRegion(regionLevel, key)} P={P} onApt={(id) => { const a = (data.apts || []).find((x) => x.id === id); if (a) pickApt(a); }} />}
      </aside>

      <section className="order-1 flex flex-col gap-2 lg:order-2">
        <div className="flex flex-wrap items-center gap-2 rounded-large bg-content1 px-3 py-2 shadow-small">
          <ButtonGroup size="sm" radius="full" variant="flat">{LEVELS.map(([k, l]) => <Button key={k} color={level === k ? "primary" : "default"} variant={level === k ? "solid" : "flat"} onPress={() => setLevel(k)}>{l}</Button>)}</ButtonGroup>
          <Divider orientation="vertical" className="h-6" />
          <ButtonGroup size="sm" radius="full">{PERIODS.map(([k, l]) => <Button key={k} color={period === k ? "primary" : "default"} variant={period === k ? "solid" : "flat"} onPress={() => setPeriod(k)}>{l}</Button>)}</ButtonGroup>
          <Divider orientation="vertical" className="h-6" />
          <div className="flex flex-wrap gap-1">{METRICS.map((x) => <Chip key={x.id} size="sm" variant={metricId === x.id ? "solid" : "flat"} color={metricId === x.id ? "primary" : "default"} className="cursor-pointer" onClick={() => setMetricId(x.id)}>{x.l}</Chip>)}</div>
          <span className="ml-auto text-tiny text-default-500">지금 보는 단위: <b>{LEVEL_NAME[eff]}</b> · {PERIOD_NOTE[period]}</span>
        </div>
        <div ref={wrapRef} className="relative h-[62vh] min-h-[440px] overflow-hidden rounded-large bg-content1 shadow-small lg:h-[calc(100vh-230px)] lg:min-h-[560px]" style={{ touchAction: "none" }}>
          {!ready && <Skeleton className="absolute inset-0 rounded-large" />}
          <svg ref={svgRef} width={size.w} height={size.h} className="block cursor-grab active:cursor-grabbing" role="img" aria-label="서울 아파트 지역 지도">
            {t && world && geoms && (
              <>
                <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}><Polys paths={polyPaths} guPaths={geoms.gu} linePaths={linePaths} showLines={showLines} /></g>
                {showRedev && (
                  <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
                    {zones.filter((r) => stageOk(r.stage, stageGroup)).map((r) => (
                      <circle key={r.id} cx={world.X(r.lon)} cy={world.Y(r.lat)} r={Math.max(Math.sqrt((r.area_m2 || 20000) / Math.PI) * world.perM, (z < 2 ? 2.5 : 6) / t.k)} fill={STAGE_COLOR[r.stage]} fillOpacity={r.id === selZone ? 0.55 : 0.3}
                        stroke={r.id === selZone ? P.fg : STAGE_COLOR[r.stage]} strokeWidth={r.id === selZone ? 2.5 : 1.3} strokeDasharray={r.geo === "dong" ? "4 3" : undefined} vectorEffect="non-scaling-stroke" className="cursor-pointer"
                        onClick={() => { setSelZone(r.id); setSel(null); }}><title>{`${r.name} · ${r.stage}`}</title></circle>
                    ))}
                  </g>
                )}
                {stations.map((s, i) => (
                  <g key={i} transform={`translate(${s.x},${s.y})`} style={{ pointerEvents: "none" }}>
                    <circle r={z > 6 ? 5 : 3.5} fill="hsl(var(--heroui-content1))" stroke={LINE_COLOR[s.line] || P.text} strokeWidth="2.2" />
                    {s.label && <text y={-9} textAnchor="middle" className="map-label" style={{ fontSize: 10.5, fontWeight: 600 }}>{s.station.replace(/역$/, "")}</text>}
                  </g>
                ))}
                {tags.filter((g) => !g.full).map((g) => <circle key={g.key} cx={g.x} cy={g.y} r={4.5} fill={g.fill} stroke={P.axis} strokeWidth="1" className="cursor-pointer" onClick={() => pickRegion(regionLevel, g.key)}><title>{g.r.name}</title></circle>)}
                {tags.filter((g) => g.full).map((g) => {
                  const dkText = lum(g.fill) < 0.55, on = selRegion?.key === g.key;
                  const c = g.r[period]?.chg;
                  return (
                    <g key={g.key} transform={`translate(${g.x},${g.y})`} className="cursor-pointer" onClick={() => pickRegion(regionLevel, g.key)}>
                      <rect x={-39} y={-23} width={78} height={46} rx={14} fill={g.fill} stroke={on ? P.fg : "rgba(0,0,0,.12)"} strokeWidth={on ? 2.5 : 1} />
                      <text y={-8} textAnchor="middle" fontSize="11" fontWeight="600" fill={dkText ? "#fff" : "#16201D"}>{g.r.name.length > 6 ? g.r.name.slice(0, 6) : g.r.name}</text>
                      <text y={7} textAnchor="middle" fontSize="13" fontWeight="800" fill={dkText ? "#fff" : "#16201D"} className="num">{m.id === "chg" || m.id === "vol" ? (g.v == null ? "—" : `${g.v > 0 ? "▲" : g.v < 0 ? "▼" : ""}${Math.abs(g.v).toFixed(1)}%`) : m.f(g.v)}</text>
                      <text y={19} textAnchor="middle" fontSize="9.5" fill={dkText ? "rgba(255,255,255,.85)" : "#4b5753"} className="num">{m.id === "chg" ? `평당 ${won(g.r[period]?.ppp)}` : c == null ? "" : `${c > 0 ? "▲" : "▼"}${Math.abs(c).toFixed(1)}%`}</text>
                    </g>
                  );
                })}
                {showPins && pins.dots.map((a) => <circle key={a.id} cx={a.x} cy={a.y} r={4} fill={fitColor[a.f]} stroke="hsl(var(--heroui-content1))" strokeWidth="1" className="cursor-pointer" onClick={() => pickApt(a)} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)} />)}
                {showPins && pins.labels.map((a) => {
                  const on = a.id === sel || a.id === hover, fill = a.f === "over" ? "hsl(var(--heroui-content1))" : fitColor[a.f];
                  return (
                    <g key={a.id} transform={`translate(${a.x},${a.y})`} className="cursor-pointer" onClick={() => pickApt(a)} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}>
                      <path d={`M${-a.w / 2},-26h${a.w}v18h${-a.w / 2 + 5}l-5,6l-5,-6h${-a.w / 2 + 5}z`} fill={fill} stroke={on ? P.fg : a.f === "over" ? P.axis : "none"} strokeWidth={on ? 2 : 1} />
                      <text y={-13} textAnchor="middle" fontSize="12" fontWeight="700" fill={a.f === "over" ? P.fg : "#fff"} className="num">{a.txt}</text>
                      {on && <text y={14} textAnchor="middle" className="map-label" style={{ fontWeight: 600 }}>{a.apt}</text>}
                    </g>
                  );
                })}
                {REF.map((r) => (
                  <g key={r.n} transform={`translate(${sx(r.lon)},${sy(r.lat)})`} style={{ pointerEvents: "none" }}>
                    <path d="M0,-9L9,0L0,9L-9,0Z" fill={P.fg} stroke="hsl(var(--heroui-content1))" strokeWidth="2" />
                    <text y={22} textAnchor="middle" className="map-label" style={{ fontWeight: 700 }}>{r.n}</text>
                  </g>
                ))}
              </>
            )}
          </svg>
          <div className="pointer-events-none absolute left-3 top-3">
            <div className="pointer-events-auto max-w-[220px] rounded-medium bg-content1/90 px-3 py-2 text-tiny shadow-small backdrop-blur">
              <button type="button" className="flex w-full items-center justify-between gap-3 font-semibold" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen}>
                <span>{m.l} · {PERIODS.find((p) => p[0] === period)[1]}</span><span className="text-default-400">{legendOpen ? "접기 ▴" : "범례 ▾"}</span>
              </button>
              {legendOpen && (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {scale && <div className="flex items-center gap-2 num"><span>{m.f(scale.lo)}</span><span className="h-2 flex-1 rounded-full" style={{ background: m.div ? `linear-gradient(90deg,${DOWN},${P.faint},${UP})` : `linear-gradient(90deg,${P.faint},${m.id === "jeonse" ? P.amber : P.primary})` }} /><span>{m.f(scale.hi)}</span></div>}
                  {m.div && <span className="text-default-500">빨강 = 상승, 파랑 = 하락</span>}
                  {showPins && ["ok", "near", "over"].map((f) => <span key={f} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: fitColor[f] }} />{fitText[f]}</span>)}
                  <span className="inline-flex items-center gap-1.5"><span className="text-[10px]">◆</span>직장 · 기숙사</span>
                  <Switch size="sm" isSelected={showLines} onValueChange={setShowLines}>지하철 노선</Switch>
                  <Switch size="sm" isSelected={showRedev} onValueChange={setShowRedev}>재개발·정비구역</Switch>
                  {showRedev && <div className="flex flex-wrap gap-1">{STAGE_GROUPS.map(([k, l]) => <Chip key={k} size="sm" variant={stageGroup === k ? "solid" : "flat"} className="cursor-pointer" onClick={() => setStageGroup(k)}>{l}</Chip>)}</div>}
                  {showRedev && STAGES.slice(0, 6).map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-[10px]"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: STAGE_COLOR[s] + "70", borderColor: STAGE_COLOR[s] }} />{s}</span>)}
                </div>
              )}
            </div>
          </div>
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            <Button isIconOnly size="sm" variant="flat" className="bg-content1 shadow-small" aria-label="확대" onPress={() => zoomBy(1.6)}>＋</Button>
            <Button isIconOnly size="sm" variant="flat" className="bg-content1 shadow-small" aria-label="축소" onPress={() => zoomBy(1 / 1.6)}>－</Button>
            <Button isIconOnly size="sm" variant="flat" className="bg-content1 text-tiny shadow-small" aria-label="서울 전체" onPress={reset}>전체</Button>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-content1/90 px-3 py-1 text-tiny text-default-600 shadow-small backdrop-blur">
            {eff === "apt" ? "가격표를 누르면 실거래 내역이 열립니다" : `${LEVEL_NAME[eff]}을 누르면 지역 분석이 열립니다 · Ctrl+스크롤·핀치로 확대`}
          </div>
        </div>
      </section>
    </div>
  );
}

/* --- left panel when nothing is selected: ranking for the current level/period/metric + loan market --- */
export const TAG_COLOR = { 거래: "default", 가격: "danger", 동네: "danger", 거래량: "default", "인기 단지": "primary", 신고가: "danger", 전세: "warning", 금리: "secondary", 정비사업: "default", 나에게: "primary" };
export function MarketSummary({ market, onApt }) {
  const [more, setMore] = useState(false);
  if (!market) return null;
  const list = more ? market.bullets : market.bullets.slice(0, 5);
  return (
    <div className="rounded-large bg-content1 p-4 shadow-small">
      <div className="flex items-baseline justify-between"><span className="text-small font-semibold">이달의 시장 요약</span><span className="text-[10px] text-default-400">{market.period}</span></div>
      <ol className="mt-2 flex flex-col gap-2">
        {list.map((b, i) => (
          <li key={i} className="flex gap-2 text-tiny leading-relaxed">
            <Chip size="sm" variant="flat" color={TAG_COLOR[b.tag] || "default"} className="h-5 shrink-0 px-0.5 text-[10px]">{b.tag}</Chip>
            <span>{b.text}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between">
        <Button size="sm" variant="light" className="h-6 min-w-0 px-2 text-tiny" onPress={() => setMore((v) => !v)}>{more ? "접기" : `${market.bullets.length - 5}개 더 보기`}</Button>
      </div>
      {more && market.highs?.length > 0 && (
        <div className="mt-1 border-t border-default-100 pt-2">
          <div className="mb-1 text-tiny font-semibold">최고가 경신 큰 순 (7월 이후)</div>
          {market.highs.slice(0, 6).map((h) => (
            <button key={h.id + h.area} type="button" onClick={() => onApt(h.id)} className="flex w-full items-center justify-between gap-2 rounded-small px-1.5 py-1 text-left text-tiny num hover:bg-default-100">
              <span className="min-w-0 truncate">{h.gu} {h.name} {h.area}㎡</span>
              <span className="shrink-0"><span className="text-default-400">{won(h.prev_max)} → </span><b style={{ color: UP }}>{won(h.price)}</b></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Overview({ data, ins, period, level, m, scen, onPick, P, onApt }) {
  if (!ins) return <Skeleton className="h-96 rounded-large" />;
  const rows = Object.entries(ins[level] || {}).filter(([, r]) => (r[period]?.n || 0) >= (level === "gu" ? 5 : 10)).map(([key, r]) => ({ key, r, v: m.get(r, period, scen) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
  const top = rows.slice(0, 8), bottom = m.div ? rows.slice(-5).reverse() : [];
  const mx = Math.max(1, ...rows.map((x) => Math.abs(x.v)));
  const item = (x) => (
    <button key={x.key} type="button" onClick={() => onPick(x.key)} className="grid w-full grid-cols-[6.5rem_minmax(0,1fr)_4.2rem] items-center gap-2 rounded-small px-2 py-1 text-left text-tiny num hover:bg-default-100">
      <span className="truncate">{level === "gu" ? x.r.name : `${x.r.gu.replace(/구$/, "")} ${x.r.name}`}</span>
      <span className="h-2 rounded-full" style={{ width: `${Math.max(3, (Math.abs(x.v) / mx) * 100)}%`, background: m.div ? (x.v >= 0 ? UP : DOWN) : P.primary }} />
      <span className="text-right font-semibold">{m.f(x.v)}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-4">
      <MarketSummary market={data.market} onApt={onApt} />
      <div className="rounded-large bg-content1 p-4 shadow-small">
        <div className="text-small font-semibold">{LEVEL_NAME[level]} 순위 · {m.l}</div>
        <p className="mb-2 text-tiny text-default-400">{PERIOD_NOTE[period]} · 거래 {level === "gu" ? 5 : 10}건 이상인 곳만</p>
        {top.map(item)}
        {bottom.length > 0 && <><div className="mt-2 text-tiny text-default-500">가장 많이 내린 곳</div>{bottom.map(item)}</>}
      </div>
      <LoanMarket data={data} />
    </div>
  );
}

export function LoanMarket({ data, gu }) {
  const r = data.rates?.at(-1), r0 = data.rates?.at(-2), lm = data.loan_market || [];
  const pick = (id) => lm.find((x) => x.id === id);
  const items = [
    ["주담대 평균 금리", r ? `${r.mortgage_pct.toFixed(2)}%` : "—", r && r0 ? `${r.month} · 전월 ${((r.mortgage_pct - r0.mortgage_pct) >= 0 ? "+" : "")}${(r.mortgage_pct - r0.mortgage_pct).toFixed(2)}%p` : ""],
    ["5대 은행 5년 고정", pick("r1")?.value, pick("r1")?.date],
    ["1인당 신규 주담대", pick("b1")?.value, pick("b1")?.date + " 전국"],
    ["서울 매수자금 중 대출", pick("b2")?.value, pick("b2")?.date],
    ["서울 아파트 30대 매수", pick("b4")?.value, gu === "구로구" || gu === "강서구" ? `${gu}는 50% 넘음 (2026-07)` : pick("b4")?.date],
  ];
  return (
    <div className="rounded-large bg-content1 p-4 shadow-small">
      <div className="mb-2 text-small font-semibold">대출 시장 지금</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([l, v, s]) => (
          <div key={l} className="rounded-medium bg-default-50 px-2.5 py-2">
            <div className="text-tiny text-default-500">{l}</div>
            <div className="text-medium font-bold num">{v ?? "—"}</div>
            <div className="truncate text-[10px] text-default-400">{s}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- population (행안부) and apartment stock (K-apt) for the selected region --- */
export function RegionStats({ s, asOf, lv }) {
  if (!s) return null;
  const u = s.units || {}, tot = (u.le60 || 0) + (u["60_85"] || 0) + (u["85_135"] || 0) + (u.gt135 || 0);
  const bands = [["~60㎡", u.le60, "#7DD3C0"], ["60~85㎡", u["60_85"], "#2E9F86"], ["85~135㎡", u["85_135"], "#0B5D4B"], ["135㎡~", u.gt135, "#06352B"]];
  const n = (v) => (v == null ? "—" : Number(v).toLocaleString());
  return (
    <div className="rounded-large bg-content1 p-4 shadow-small">
      <div className="mb-2 text-small font-semibold">지역 기본 정보</div>
      <div className="grid grid-cols-3 gap-2 text-tiny num">
        {[["인구", s.population != null ? `${n(s.population)}명` : "—"], ["세대수", s.households != null ? `${n(s.households)}세대` : "—"], ["아파트 거주 비중", s.apt_share != null ? `${s.apt_share}%` : "—"],
          ["아파트 단지", `${n(s.apt_complexes)}곳`], ["아파트 세대", `${n(s.apt_households)}세대`], ["임대 포함 단지", `${n(s.rental_complexes)}곳`]].map(([l, v]) => (
          <div key={l} className="rounded-medium bg-default-100 px-2.5 py-2"><div className="text-default-500">{l}</div><div className="text-small font-semibold">{v}</div></div>
        ))}
      </div>
      {tot > 0 && (
        <>
          <div className="mt-3 mb-1 text-tiny text-default-500">면적별 아파트 세대수</div>
          <div className="flex h-3 overflow-hidden rounded-full">{bands.map(([l, v, c]) => v ? <span key={l} style={{ width: `${(v / tot) * 100}%`, background: c }} title={`${l} ${n(v)}세대`} /> : null)}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-tiny num">
            {bands.map(([l, v, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{l} <b>{n(v)}</b><span className="text-default-400">({tot ? Math.round(((v || 0) / tot) * 100) : 0}%)</span></span>)}
          </div>
        </>
      )}
      <p className="mt-2 text-[10px] text-default-400">
        {lv === "bdong" ? "인구·세대는 행정동 단위로만 공개돼 법정동에는 없습니다. " : ""}인구: 행정안전부 주민등록 {asOf?.population}. 아파트: K-apt 관리비 공개 단지({asOf?.kapt}) 기준이라 소규모 단지는 빠져 있고, 오피스텔·빌라는 포함되지 않습니다.
      </p>
    </div>
  );
}

/* --- region analysis: price & change, 평형 mix, trend, jeonse, my loan, redevelopment, busiest complexes --- */
export function RegionPanel({ lv, rkey, r, period, data, apts, zones, budget, scen, P, fitOf, fitColor, onClose, onApt }) {
  const d = r[period] || {};
  const gu = lv === "gu" ? rkey : r.gu;
  const title = lv === "gu" ? r.name : `${r.gu} ${r.name}`;
  const price84 = d.p84 ?? (d.ppp ? Math.round(d.ppp * 25.4) : null);
  const b = data.budget?.find((x) => x.scenario === scen), rate = data.rates?.at(-1)?.mortgage_pct ?? 4.66;
  const need = price84 ? Math.max(0, price84 - (b?.cash_10k ?? 0)) : 0;
  const maxLoan = price84 ? Math.min(price84 * LTV, loanCap(price84), ((b?.income_10k ?? 0) * DSR) / (annuity(rate + STRESS) * 12)) : 0;
  const mon = Math.min(need, maxLoan) * annuity(rate);
  const inRegion = (a) => (lv === "gu" ? a.gu === rkey : lv === "bdong" ? `${a.gu} ${a.dong}` === rkey : a.hcode === rkey);
  const topApts = apts.filter((a) => inRegion(a) && a.median_area_sqm >= 40).sort((a, b2) => b2.trades_6m - a.trades_6m).slice(0, 6);
  const rz = zones.filter((z) => (lv === "gu" ? z.gu === rkey : lv === "bdong" ? `${z.gu} ${z.dong}` === rkey : false));
  const series = (r.series || []).map(([mth, n, ppp]) => ({ m: mth.slice(2, 4) + "." + mth.slice(4), n, ppp, partial: mth === "202610" }));
  // donut
  let acc = 0;
  const arcs = BAND.map(([k, l, c]) => { const s = d.bands?.[k]?.share || 0, a0 = acc; acc += s; return { k, l, c, s, a0, a1: acc, ...d.bands?.[k] }; });
  const arc = (a0, a1, R = 46, rI = 28) => {
    if (a1 - a0 >= 99.99) a1 = a0 + 99.99;
    const p = (a, rr) => [rr * Math.sin((a / 100) * 2 * Math.PI), -rr * Math.cos((a / 100) * 2 * Math.PI)];
    const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, rI), [x3, y3] = p(a0, rI), lg = a1 - a0 > 50 ? 1 : 0;
    return `M${x0},${y0}A${R},${R} 0 ${lg} 1 ${x1},${y1}L${x2},${y2}A${rI},${rI} 0 ${lg} 0 ${x3},${y3}Z`;
  };
  const chgEl = (v) => (v == null ? <span className="text-default-400">—</span> : <span style={{ color: v >= 0 ? UP : DOWN }}>{v > 0 ? "▲" : v < 0 ? "▼" : ""}{Math.abs(v).toFixed(1)}%</span>);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-large bg-content1 p-4 shadow-small">
        <div className="flex items-start justify-between">
          <div><div className="text-tiny text-default-500">{LEVEL_NAME[lv]} 분석 · {PERIOD_NOTE[period]}</div><h3 className="text-xl font-bold">{title}</h3></div>
          <Button size="sm" variant="light" onPress={onClose}>닫기</Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[["매매 평당가", won(d.ppp), chgEl(d.chg)], ["거래량", `${(d.n || 0).toLocaleString()}건`, chgEl(d.vol_chg)], ["전세가율", r.jeonse_ratio ? `${r.jeonse_ratio}%` : "—", r.jeonse_ppp ? <span className="text-default-500">전세 평당 {won(r.jeonse_ppp)}</span> : null]].map(([l, v, s]) => (
            <div key={l} className="rounded-medium bg-default-100 px-2.5 py-2"><div className="text-tiny text-default-500">{l}</div><div className="text-large font-bold num">{v}</div><div className="text-tiny num">{s}</div></div>
          ))}
        </div>
        <p className="text-tiny text-default-400">평당가는 전용 3.3㎡ 기준 중위값. 변화율은 직전 같은 기간 대비, 거래 5건 이상일 때만.</p>
      </div>

      <RegionStats s={data.region_stats?.[lv]?.[rkey]} asOf={data.region_stats?.as_of} lv={lv} />

      <div className="rounded-large bg-content1 p-4 shadow-small">
        <div className="mb-2 text-small font-semibold">평형별 거래</div>
        <div className="flex items-center gap-4">
          <svg width="104" height="104" viewBox="-52 -52 104 104" className="shrink-0">
            {arcs.filter((a) => a.s > 0).map((a) => <path key={a.k} d={arc(a.a0, a.a1)} fill={a.c} />)}
            <text y="-2" textAnchor="middle" fontSize="15" fontWeight="800" fill={P.fg} className="num">{(d.n || 0).toLocaleString()}</text>
            <text y="13" textAnchor="middle" fontSize="9" fill={P.text}>건</text>
          </svg>
          <div className="flex flex-1 flex-col gap-1.5 text-tiny num">
            {arcs.map((a) => (
              <div key={a.k} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: a.c }} /><span>{a.l}</span><span className="font-semibold">{a.s.toFixed(0)}%</span><span className="w-[5.5rem] text-right">{won(a.ppp)} {chgEl(a.chg)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-large bg-content1 p-4 shadow-small">
        <div className="mb-1 text-small font-semibold">2년 흐름</div>
        <p className="mb-1 text-tiny text-default-400">막대 = 월 거래량, 선 = 평당가 중위값 (26.10은 집계 중)</p>
        <div className="h-40">
          <ResponsiveContainer>
            <ComposedChart data={series} margin={{ top: 6, right: 0, bottom: 0, left: -14 }}>
              <CartesianGrid stroke={P.grid} vertical={false} />
              <XAxis dataKey="m" tick={{ fill: P.text, fontSize: 10 }} interval={5} tickLine={false} />
              <YAxis yAxisId="n" tick={{ fill: P.text, fontSize: 10 }} tickLine={false} axisLine={false} width={34} />
              <YAxis yAxisId="p" orientation="right" domain={["auto", "auto"]} tickFormatter={(v) => (v / 1000).toFixed(1) + "천"} tick={{ fill: P.text, fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="rounded-medium bg-content1 px-2 py-1 text-tiny shadow-medium num"><div className="text-default-500">{label}</div><div>거래 {payload.find((p) => p.dataKey === "n")?.value}건</div><div>평당 {won(payload.find((p) => p.dataKey === "ppp")?.value)}</div></div> : null} />
              <Bar yAxisId="n" dataKey="n" fill={P.muted} radius={[3, 3, 0, 0]} />
              <Line yAxisId="p" dataKey="ppp" stroke={P.primary} strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-large bg-content1 p-4 shadow-small">
        <div className="mb-1 text-small font-semibold">내가 여기 84㎡를 사면 ({scen === "later" ? "결혼 후 둘이" : "지금 혼자"})</div>
        {price84 ? (
          <div className="flex flex-col gap-1.5 text-small">
            <div className="num">84㎡ 기준가 <b>{won(price84)}</b> <span className="text-tiny text-default-400">{d.p84 ? "실거래 중위가" : "평당가 × 25.4평 환산"}</span></div>
            <div className="flex flex-wrap items-center gap-2 num">
              <Chip size="sm" variant="flat" color={need <= maxLoan ? "success" : "danger"}>{need <= maxLoan ? "대출 가능" : `대출 ${won(need - maxLoan)} 부족`}</Chip>
              <span className="text-default-500">필요 {won(need)} · 최대 {won(maxLoan)}</span>
            </div>
            <div className="num">월 상환 약 <b>{won(mon)}원</b> <span className="text-tiny text-default-400">금리 {rate}% · 30년</span></div>
            <div className="num text-tiny text-default-500">이 지역 거래 중 내 예산대 비중 {fmt.share(scen === "now" ? d.fit_now : d.fit_later)}</div>
          </div>
        ) : <p className="text-tiny text-default-400">이 기간 거래가 적어 기준가를 낼 수 없습니다.</p>}
      </div>

      {rz.length > 0 && (
        <div className="rounded-large bg-content1 p-4 shadow-small">
          <div className="mb-1 text-small font-semibold">재개발·정비구역 {rz.length}곳</div>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.slice(0, 6).map((s) => { const n = rz.filter((z) => z.stage === s).length; return n ? <Chip key={s} size="sm" variant="flat" style={{ background: STAGE_COLOR[s] + "55" }}>{s} {n}</Chip> : null; })}
          </div>
          <p className="mt-1 text-tiny text-default-400">지도 범례에서 "재개발·정비구역"을 켜면 위치가 보입니다.</p>
        </div>
      )}

      <div className="rounded-large bg-content1 p-4 shadow-small">
        <div className="mb-1 text-small font-semibold">거래 많은 단지</div>
        {topApts.length === 0 ? <p className="text-tiny text-default-400">최근 6개월 거래 단지가 없습니다.</p> : topApts.map((a) => { const f = fitOf(a.median_price_10k); return (
          <button key={a.id} type="button" onClick={() => onApt(a)} className="flex w-full items-center gap-3 rounded-medium px-2 py-1.5 text-left hover:bg-default-100">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: fitColor[f] }} />
            <span className="min-w-0 flex-1"><span className="block truncate text-small font-medium">{a.apt}</span><span className="block text-tiny text-default-500">{a.dong} · {a.median_area_sqm}㎡ · {a.build_year || "—"}년 · {a.trades_6m}건</span></span>
            <span className="text-small font-semibold num">{won(a.median_price_10k)}</span>
          </button>
        ); })}
      </div>
      <LoanMarket data={data} gu={gu} />
    </div>
  );
}
