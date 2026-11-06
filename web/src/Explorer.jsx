import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SOURCE_LINKS } from "./TossLinks.js";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import "d3-transition";
import { Button, ButtonGroup, Chip, Divider, ScrollShadow, Skeleton, Slider, Switch } from "@heroui/react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { DSR, LTV, STRESS, annuity, buyPlan, estCommute, fmt, kmTo, loanCap, palette, useIsDark, useLazyFile, useWatch, won } from "./lib.js";

// the map's ◆ marker: the viewer's workplace
export const refOf = (w) => [{ n: w?.name || "직장", lon: w?.lon, lat: w?.lat }].filter((r) => r.lon != null);
export const REF = refOf({ name: "광화문", lon: 126.9769, lat: 37.5759 });
export const LINE_COLOR = { "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE", "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C", "9호선": "#BDB092", "신분당선": "#D4003B", "경의중앙선": "#77C4A3", "공항철도": "#0090D2", "수인분당선": "#F5A200", "우이신설선": "#B0CE18", "신림선": "#6789CA", "서해선": "#8FC31F", "GTX-A": "#9A6292", "경춘선": "#0C8E72" };
export const AREAS = [["all", "전체 면적"], ["s", "40~60㎡"], ["m", "60~85㎡"], ["l", "85㎡~"]];
export const STAGES = ["후보지·선정", "정비구역 지정", "추진위·조합설립", "사업시행인가", "관리처분인가", "이주·철거·착공", "준공"];
export const STAGE_COLOR = { "후보지·선정": "#F5B3D3", "정비구역 지정": "#EE84B8", "추진위·조합설립": "#E2569C", "사업시행인가": "#C93582", "관리처분인가": "#A21F68", "이주·철거·착공": "#6E1247", "준공": "#7C8582" };
export const STAGE_GROUPS = [["all", "전체 단계"], ["early", "초기 (후보~조합)"], ["late", "후기 (사업시행 이후)"]];
export const stageOk = (s, g) => g === "all" || (g === "early" ? STAGES.indexOf(s) <= 2 : STAGES.indexOf(s) >= 3);
export const AGES = [["all", "전체 연식"], ["new", "신축 10년 이내"], ["old", "30년+ 재건축 연한"]];
export const ageOk = (y, f) => f === "all" || (y && (f === "new" ? y >= 2016 : y <= 1996));
// studios under 40㎡ are left out: they are not a home for a couple and crowd the price tags
export const areaOk = (a, f) => (a == null ? f === "all" : a >= 40 && (f === "all" || (f === "s" ? a < 60 : f === "m" ? a >= 60 && a <= 85 : a > 85)));
export const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
export const dist = (a, b) => { const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

// Static base layer (neighbourhood + district outlines); memoised so zoom frames only move its <g>.
const BaseLayer = memo(function BaseLayer({ dongPaths, guPaths, linePaths, showLines }) {
  return (
    <>
      {dongPaths.map((p) => <path key={p.k} d={p.d} fill={p.fill} stroke="hsl(var(--heroui-default-200))" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />)}
      {guPaths.map((p) => <path key={p.k} d={p.d} fill="none" stroke="hsl(var(--heroui-default-500))" strokeOpacity="0.8" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />)}
      {guPaths.length > 0 && <path d={guPaths.map((p) => p.d).join("")} fill="none" stroke="hsl(var(--heroui-foreground))" strokeOpacity="0.55" strokeWidth="2.2" vectorEffect="non-scaling-stroke" style={{ mixBlendMode: "normal" }} />}
      {showLines && linePaths.map((l) => (
        <g key={l.line}>
          <path d={l.d} fill="none" stroke="hsl(var(--heroui-content1))" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={l.d} fill="none" stroke={l.color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </>
  );
});

export default function Explorer({ data }) {
  const dark = useIsDark(), P = palette(dark);
  const later = data.budget?.find((b) => b.scenario === "later"), now = data.budget?.find((b) => b.scenario === "now");
  const [budget, setBudget] = useState(100000);
  const [scen, setScen] = useState("later");
  const [area, setArea] = useState("all");
  const [age, setAge] = useState("all");
  const [onlyFit, setOnlyFit] = useState(false);
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const [trades, setTrades] = useState(null);
  const [t, setT] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wrapRef = useRef(null), svgRef = useRef(null), zoomRef = useRef(null), k0Ref = useRef(1), raf = useRef(0);

  useEffect(() => { if (later && now) setBudget(scen === "later" ? later.max_price_10k : now.max_price_10k); }, [scen, later, now]);
  useEffect(() => { if (sel && !trades) fetch("data/trades.json").then((r) => r.json()).then(setTrades).catch(() => setTrades({})); }, [sel, trades]);

  // world projection: equirectangular fitted to Seoul, 1000 units wide
  const world = useMemo(() => {
    if (!data.seoul_geo) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    data.seoul_geo.forEach((r) => polysOf(r.geometry).forEach((p) => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); })));
    const kx = Math.cos(((y0 + y1) / 2) * Math.PI / 180), S = 1000 / ((x1 - x0) * kx);
    return { X: (lon) => (lon - x0) * kx * S, Y: (lat) => (y1 - lat) * S, W: 1000, H: (y1 - y0) * S, perM: S / 110574 };
  }, [data.seoul_geo]);
  const ringD = useCallback((ring) => "M" + ring.map(([x, y]) => `${world.X(x).toFixed(2)},${world.Y(y).toFixed(2)}`).join("L") + "Z", [world]);
  const guPaths = useMemo(() => (world && data.seoul_geo ? data.seoul_geo.map((r) => ({ k: r.gu, d: polysOf(r.geometry).map((p) => p.map(ringD).join("")).join("") })) : []), [world, data.seoul_geo, ringD]);
  const dongZone = useMemo(() => Object.fromEntries((data.dong_summary || []).map((r) => [r.id, r.apt_zone])), [data.dong_summary]);
  const dongPaths = useMemo(() => (world && data.dong_geo ? data.dong_geo.map((r) => ({ k: r.id, d: polysOf(r.geometry).map((p) => p.map(ringD).join("")).join(""), fill: dongZone[r.id] === "아파트 밀집" ? P.faint : P.none })) : []), [world, data.dong_geo, ringD, dongZone, dark]);
  // one path per line, drawn under the price tags; minor lines first so 1~9호선 sit on top
  const linePaths = useMemo(() => {
    if (!world || !data.subway_lines) return [];
    const by = {};
    data.subway_lines.forEach((s) => { by[s.line] = (by[s.line] || "") + "M" + s.coords.map(([x, y]) => `${world.X(x).toFixed(2)},${world.Y(y).toFixed(2)}`).join("L"); });
    return Object.entries(by).sort(([a], [b]) => (/^\d/.test(a) ? 1 : 0) - (/^\d/.test(b) ? 1 : 0)).map(([line, d]) => ({ line, d, color: LINE_COLOR[line] || P.text }));
  }, [world, data.subway_lines, dark]);
  const [showLines, setShowLines] = useState(true);
  const [showRedev, setShowRedev] = useState(true);
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth >= 1024);
  const [stageGroup, setStageGroup] = useState("all");
  const [selZone, setSelZone] = useState(null);
  const zones = useMemo(() => (data.redev || []).filter((r) => r.lon != null && r.stage !== "준공"), [data.redev]);

  // resize + zoom behaviour
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  // set up zoom once the map has a size; later resizes keep the current view instead of resetting it
  const sized = size.w > 0;
  useEffect(() => {
    if (!world || !sized || !svgRef.current) return;
    const k0 = Math.min(size.w / world.W, size.h / world.H) * 0.94; k0Ref.current = k0;
    // the wheel zooms only with Ctrl/⌘ (trackpad pinch sends Ctrl), so the page still scrolls over the map
    const z = d3zoom().scaleExtent([k0 * 0.9, k0 * 60]).translateExtent([[-world.W * 0.15, -world.H * 0.15], [world.W * 1.15, world.H * 1.15]]).filter((e) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : !e.button)).on("zoom", (e) => { if (e.sourceEvent) moved.current = true; cancelAnimationFrame(raf.current); const tr = e.transform; raf.current = requestAnimationFrame(() => setT(tr)); });
    zoomRef.current = z;
    const s = select(svgRef.current).call(z).on("dblclick.zoom", null);
    s.call(z.transform, zoomIdentity.translate((size.w - world.W * k0) / 2, (size.h - world.H * k0) / 2).scale(k0));
    return () => { s.on(".zoom", null); zoomRef.current = null; };
  }, [world, sized]);
  // until the viewer moves the map, keep Seoul framed when the panel is resized
  const moved = useRef(false);
  useEffect(() => {
    if (!world || !zoomRef.current || !size.w || moved.current) return;
    const k0 = Math.min(size.w / world.W, size.h / world.H) * 0.94; k0Ref.current = k0;
    select(svgRef.current).call(zoomRef.current.transform, zoomIdentity.translate((size.w - world.W * k0) / 2, (size.h - world.H * k0) / 2).scale(k0));
  }, [size.w, size.h, world]);
  const zoomTo = (cx, cy, rel, animate = true) => {
    moved.current = true;
    const k = k0Ref.current * rel, s = select(svgRef.current), tr = zoomIdentity.translate(size.w / 2 - cx * k, size.h / 2 - cy * k).scale(k);
    (animate ? s.transition().duration(650) : s).call(zoomRef.current.transform, tr);
  };
  const zoomBy = (f) => (moved.current = true) && select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, f);
  const reset = () => { if (!world) return; zoomTo(world.W / 2, world.H / 2, 1); moved.current = false; };

  const z = t ? t.k / k0Ref.current : 1;
  const level = z < 2 ? "gu" : z < 4.5 ? "dong" : "apt";
  const sx = (lon) => t.applyX(world.X(lon)), sy = (lat) => t.applyY(world.Y(lat));
  const inView = (x, y, m = 20) => x > -m && y > -m && x < size.w + m && y < size.h + m;
  const fitOf = (v) => (v == null ? "none" : v <= budget ? "ok" : v <= budget * 1.15 ? "near" : "over");
  const fitColor = { ok: P.primary, near: P.amber, over: P.muted, none: P.muted };
  const fitText = { ok: "예산 안", near: "조금 넘음 (15% 이내)", over: "예산 초과" };

  // centroids for gu / dong bubbles from geocoded complexes (falls back to polygon centre)
  const apts = useMemo(() => (data.apts || []).filter((a) => a.lon != null), [data.apts]);
  const centers = useMemo(() => {
    const acc = {};
    apts.forEach((a) => { [a.gu, `${a.gu} ${a.dong}`].forEach((k) => { const c = (acc[k] ||= { x: 0, y: 0, n: 0 }); c.x += a.lon * a.trades_6m; c.y += a.lat * a.trades_6m; c.n += a.trades_6m; }); });
    return Object.fromEntries(Object.entries(acc).map(([k, c]) => [k, { lon: c.x / c.n, lat: c.y / c.n }]));
  }, [apts]);

  const visibleApts = useMemo(() => {
    if (!t || !world) return [];
    return apts.filter((a) => areaOk(a.median_area_sqm, area) && ageOk(a.build_year, age) && (!onlyFit || fitOf(a.median_price_10k) !== "over")).map((a) => ({ ...a, x: sx(a.lon), y: sy(a.lat), f: fitOf(a.median_price_10k) })).filter((a) => inView(a.x, a.y, 0));
  }, [apts, t, world, area, age, onlyFit, budget, size]);

  const bubbles = useMemo(() => {
    if (!t || !world || level === "apt") return [];
    const rows = level === "gu" ? (data.gu_summary || []).map((r) => ({ key: r.gu, name: r.gu, v: r.median_84_10k ?? (r.price_per_sqm_recent_10k ? r.price_per_sqm_recent_10k * 84 : null), c: centers[r.gu], sub: r.commute_min_est }))
      : (data.dong_summary || []).filter((r) => r.apt_zone !== "아파트 드묾").map((r) => ({ key: r.id, name: r.dong, gu: r.gu, v: r.median_84_10k ?? (r.price_per_sqm_10k ? r.price_per_sqm_10k * 84 : null), c: centers[r.id], n: r.trades_6m }));
    const vis = rows.filter((r) => r.c && r.v).map((r) => ({ ...r, x: sx(r.c.lon), y: sy(r.c.lat), f: fitOf(r.v) })).filter((r) => inView(r.x, r.y));
    if (level === "gu") return vis.map((r) => ({ ...r, tag: true }));
    const placed = [];
    return vis.sort((a, b) => (b.n || 0) - (a.n || 0)).map((r) => {
      const bx = { x0: r.x - 36, x1: r.x + 36, y0: r.y - 22, y1: r.y + 22 };
      const tag = placed.every((p) => bx.x1 < p.x0 || bx.x0 > p.x1 || bx.y1 < p.y0 || bx.y0 > p.y1);
      if (tag) placed.push(bx);
      return { ...r, tag };
    });
  }, [t, world, level, data.gu_summary, data.dong_summary, centers, budget, size]);

  // apt pins: label the busiest ones that fit without overlapping, dots for the rest
  const pins = useMemo(() => {
    if (level !== "apt") return { labels: [], dots: [] };
    const sorted = [...visibleApts].sort((a, b) => b.trades_6m - a.trades_6m), placed = [], labels = [], dots = [];
    sorted.forEach((a) => {
      const txt = won(a.median_price_10k), w = txt.length * 7.5 + 14, bx = { x0: a.x - w / 2, x1: a.x + w / 2, y0: a.y - 26, y1: a.y - 4 };
      if (labels.length < 140 && placed.every((p) => bx.x1 < p.x0 || bx.x0 > p.x1 || bx.y1 < p.y0 || bx.y0 > p.y1)) { placed.push(bx); labels.push({ ...a, txt, w }); } else dots.push(a);
    });
    return { labels, dots };
  }, [visibleApts, level]);

  // stations from 동네 zoom; names from 단지 zoom, skipping any that would collide (transfer stations share a name)
  const stations = useMemo(() => {
    if (!t || !data.subway || z < 2) return [];
    const vis = data.subway.map((s) => ({ ...s, x: sx(s.lon), y: sy(s.lat) })).filter((s) => inView(s.x, s.y));
    if (z >= 4.5) {
      const placed = [], named = new Set();
      vis.forEach((s) => {
        if (named.has(s.station)) return;
        const hw = s.station.length * 5.5, bx = { x0: s.x - hw, x1: s.x + hw, y0: s.y - 18, y1: s.y - 2 };
        if (placed.every((p) => bx.x1 < p.x0 || bx.x0 > p.x1 || bx.y1 < p.y0 || bx.y0 > p.y1)) { placed.push(bx); named.add(s.station); s.label = true; }
      });
    }
    return vis;
  }, [t, data.subway, z, size]);

  const list = useMemo(() => [...visibleApts].sort((a, b) => (a.f === "ok") - (b.f === "ok") ? (b.f === "ok") - (a.f === "ok") : b.trades_6m - a.trades_6m), [visibleApts]);
  const fitCount = visibleApts.filter((a) => a.f === "ok").length;
  const selApt = sel ? apts.find((a) => a.id === sel) || (data.apts || []).find((a) => a.id === sel) : null;
  const pick = (a) => { setSel(a.id); if (a.lon != null && world) zoomTo(world.X(a.lon), world.Y(a.lat), Math.max(z, 7)); };

  const ready = world && data.dong_geo && data.apts;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* ---------- side panel ---------- */}
      <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
        <div className="rounded-large bg-content1 p-4 shadow-small">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-small font-semibold">내 예산</span>
            <ButtonGroup size="sm" radius="full">
              <Button color={scen === "now" ? "primary" : "default"} variant={scen === "now" ? "solid" : "flat"} onPress={() => setScen("now")}>지금 혼자</Button>
              <Button color={scen === "later" ? "primary" : "default"} variant={scen === "later" ? "solid" : "flat"} onPress={() => setScen("later")}>결혼 후</Button>
            </ButtonGroup>
          </div>
          <Slider aria-label="최대 집값" size="sm" color="primary" step={1000} minValue={20000} maxValue={200000} value={budget} onChange={setBudget}
            renderValue={() => null} startContent={<span className="w-[4.5rem] shrink-0 whitespace-nowrap text-2xl font-bold text-primary num">{won(budget)}</span>} />
          <p className="mt-1 text-tiny text-default-500">이 가격 이하 단지가 초록색으로 보입니다. 슬라이더로 직접 바꿔 보세요. (40㎡ 미만 원룸형 제외)</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {AREAS.map(([k, l]) => <Chip key={k} size="sm" variant={area === k ? "solid" : "flat"} color={area === k ? "primary" : "default"} className="cursor-pointer" onClick={() => setArea(k)}>{l}</Chip>)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {AGES.map(([k, l]) => <Chip key={k} size="sm" variant={age === k ? "solid" : "flat"} color={age === k ? "primary" : "default"} className="cursor-pointer" onClick={() => setAge(k)}>{l}</Chip>)}
          </div>
          <Switch size="sm" className="mt-3" isSelected={onlyFit} onValueChange={setOnlyFit}>예산 넘는 단지 숨기기</Switch>
          {showRedev && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STAGE_GROUPS.map(([k, l]) => <Chip key={k} size="sm" variant={stageGroup === k ? "solid" : "flat"} className="cursor-pointer" style={stageGroup === k ? { background: STAGE_COLOR["사업시행인가"], color: "#fff" } : undefined} onClick={() => setStageGroup(k)}>재개발 {l}</Chip>)}
            </div>
          )}
        </div>

        {selZone && !selApt ? (
          <ZoneDetail zone={zones.find((z) => z.id === selZone)} apts={apts} onClose={() => setSelZone(null)} P={P} budget={budget} />
        ) : selApt ? (
          <AptDetail apt={selApt} trades={trades} budget={budget} scen={scen} data={data} onClose={() => setSel(null)} P={P} fitOf={fitOf} fitText={fitText} fitColor={fitColor} />
        ) : (
          <div className="flex min-h-0 flex-col rounded-large bg-content1 p-4 shadow-small">
            <div className="flex items-baseline justify-between">
              <span className="text-small font-semibold">지금 지도 안의 단지</span>
              <span className="text-tiny text-default-500 num">{visibleApts.length.toLocaleString()}곳 · 예산 안 <b className="text-primary">{fitCount.toLocaleString()}</b></span>
            </div>
            <p className="mb-2 text-tiny text-default-400">지도를 움직이면 목록이 바뀝니다. 예산 안 단지부터, 거래 많은 순.</p>
            <ScrollShadow className="max-h-[52vh] lg:max-h-[calc(100vh-420px)]">
              {!ready ? <Skeleton className="h-64 rounded-medium" /> : list.slice(0, 80).map((a) => (
                <button key={a.id} type="button" onClick={() => pick(a)} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}
                  className="flex w-full items-center gap-3 rounded-medium px-2 py-2 text-left hover:bg-default-100">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: fitColor[a.f] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium">{a.apt}</span>
                    <span className="block text-tiny text-default-500">{a.gu} {a.dong} · {a.median_area_sqm}㎡ · {a.build_year || "—"}년 · 6개월 {a.trades_6m}건</span>
                  </span>
                  <span className="text-small font-semibold num" style={{ color: a.f === "ok" ? P.primary : undefined }}>{won(a.median_price_10k)}</span>
                </button>
              ))}
              {ready && list.length === 0 && <p className="py-8 text-center text-small text-default-400">이 화면에는 조건에 맞는 단지가 없습니다.</p>}
            </ScrollShadow>
          </div>
        )}
      </aside>

      {/* ---------- map ---------- */}
      <section className="order-1 lg:order-2">
        <div ref={wrapRef} className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-large bg-content1 shadow-small lg:h-[calc(100vh-180px)] lg:min-h-[560px]" style={{ touchAction: "none" }}>
          {!ready && <Skeleton className="absolute inset-0 rounded-large" />}
          <svg ref={svgRef} width={size.w} height={size.h} className="block cursor-grab active:cursor-grabbing" role="img" aria-label="서울 아파트 실거래 지도">
            {t && world && (
              <>
                <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}><BaseLayer dongPaths={dongPaths} guPaths={guPaths} linePaths={linePaths} showLines={showLines} /></g>
                {showRedev && (
                  <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
                    {zones.filter((r) => stageOk(r.stage, stageGroup)).map((r) => {
                      // circle with the zone's real area; at least ~6px on screen so small zones stay clickable
                      const rad = Math.max(Math.sqrt((r.area_m2 || 20000) / Math.PI) * world.perM, (z < 2 ? 2.5 : 6) / t.k), on = r.id === selZone;
                      return (
                        <circle key={r.id} cx={world.X(r.lon)} cy={world.Y(r.lat)} r={rad} fill={STAGE_COLOR[r.stage]} fillOpacity={on ? 0.5 : 0.28}
                          stroke={on ? P.fg : STAGE_COLOR[r.stage]} strokeWidth={on ? 2.5 : 1.4} strokeDasharray={r.geo === "dong" ? "4 3" : undefined} vectorEffect="non-scaling-stroke"
                          className="cursor-pointer" onClick={() => { setSelZone(r.id); setSel(null); }}>
                          <title>{`${r.name} · ${r.stage}`}</title>
                        </circle>
                      );
                    })}
                  </g>
                )}
                {showLines && stations.map((s, i) => (
                  <g key={i} transform={`translate(${s.x},${s.y})`} style={{ pointerEvents: "none" }}>
                    <circle r={z > 6 ? 5 : 3.5} fill="hsl(var(--heroui-content1))" stroke={LINE_COLOR[s.line] || P.text} strokeWidth="2.2" />
                    {s.label && <text y={-9} textAnchor="middle" className="map-label" style={{ fontSize: 10.5, fontWeight: 600 }}>{s.station.replace(/역$/, "")}</text>}
                  </g>
                ))}
                {level !== "apt" && bubbles.filter((b) => !b.tag).map((b) => (
                  <circle key={b.key} cx={b.x} cy={b.y} r={5} fill={b.f === "over" ? "hsl(var(--heroui-content1))" : fitColor[b.f]} stroke={b.f === "over" ? P.axis : "hsl(var(--heroui-content1))"} strokeWidth="1.5" className="cursor-pointer"
                    onClick={() => zoomTo(world.X(centers[b.key].lon), world.Y(centers[b.key].lat), 6)}><title>{`${b.name} ${won(b.v)}`}</title></circle>
                ))}
                {level !== "apt" && bubbles.filter((b) => b.tag).map((b) => (
                  <g key={b.key} transform={`translate(${b.x},${b.y})`} className="cursor-pointer" onClick={() => zoomTo(world.X(centers[b.key].lon), world.Y(centers[b.key].lat), level === "gu" ? 3 : 6)}>
                    <rect x={-34} y={-20} width={68} height={40} rx={12} fill={b.f === "over" ? "hsl(var(--heroui-content1))" : fitColor[b.f]} stroke={b.f === "over" ? P.axis : "none"} opacity={0.96} />
                    <text y={-4} textAnchor="middle" fontSize="10.5" fill={b.f === "over" ? P.text : "#fff"}>{b.name.length > 6 ? b.name.slice(0, 6) : b.name}</text>
                    <text y={11} textAnchor="middle" fontSize="13" fontWeight="700" fill={b.f === "over" ? P.fg : "#fff"} className="num">{won(b.v)}</text>
                  </g>
                ))}
                {level === "apt" && pins.dots.map((a) => <circle key={a.id} cx={a.x} cy={a.y} r={4} fill={fitColor[a.f]} stroke="hsl(var(--heroui-content1))" strokeWidth="1" className="cursor-pointer" onClick={() => pick(a)} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)} />)}
                {level === "apt" && pins.labels.map((a) => {
                  const on = a.id === sel || a.id === hover, fill = a.f === "over" ? "hsl(var(--heroui-content1))" : fitColor[a.f];
                  return (
                    <g key={a.id} transform={`translate(${a.x},${a.y})`} className="cursor-pointer" onClick={() => pick(a)} onMouseEnter={() => setHover(a.id)} onMouseLeave={() => setHover(null)}>
                      <path d={`M${-a.w / 2},-26h${a.w}v18h${-a.w / 2 + 5}l-5,6l-5,-6h${-a.w / 2 + 5}z`} fill={fill} stroke={on ? P.fg : a.f === "over" ? P.axis : "none"} strokeWidth={on ? 2 : 1} />
                      <text y={-13} textAnchor="middle" fontSize="12" fontWeight="700" fill={a.f === "over" ? P.fg : "#fff"} className="num">{a.txt}</text>
                      {on && <text y={14} textAnchor="middle" className="map-label" style={{ fontWeight: 600 }}>{a.apt}</text>}
                    </g>
                  );
                })}
                {selApt?.lon != null && level !== "apt" && <circle cx={sx(selApt.lon)} cy={sy(selApt.lat)} r={7} fill={P.fg} stroke="hsl(var(--heroui-content1))" strokeWidth="2" />}
                {REF.map((r) => (
                  <g key={r.n} transform={`translate(${sx(r.lon)},${sy(r.lat)})`} style={{ pointerEvents: "none" }}>
                    <path d="M0,-9L9,0L0,9L-9,0Z" fill={P.fg} stroke="hsl(var(--heroui-content1))" strokeWidth="2" />
                    <text y={22} textAnchor="middle" className="map-label" style={{ fontWeight: 700 }}>{r.n}</text>
                  </g>
                ))}
              </>
            )}
          </svg>

          {/* overlays */}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
            <div className="pointer-events-auto rounded-medium bg-content1/90 px-3 py-2 text-tiny shadow-small backdrop-blur">
              <button type="button" className="mb-1 flex w-full items-center justify-between gap-3 font-semibold" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen}>
                <span>{level === "gu" ? "구별 84㎡ 중위가" : level === "dong" ? "동네별 84㎡ 중위가" : "단지별 실거래 중위가"}</span><span className="text-default-400">{legendOpen ? "접기 ▴" : "범례 ▾"}</span>
              </button>
              {legendOpen && <>
              <div className="flex flex-col gap-1">
                {["ok", "near", "over"].map((f) => <span key={f} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: fitColor[f] }} />{fitText[f]}</span>)}
                <span className="inline-flex items-center gap-1.5"><span className="text-[10px]">◆</span>광화문</span>
              </div>
              <Switch size="sm" className="mt-2" isSelected={showRedev} onValueChange={setShowRedev}>재개발·정비구역</Switch>
              {showRedev && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {STAGES.slice(0, 6).map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-[10px]"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: STAGE_COLOR[s] + "70", borderColor: STAGE_COLOR[s] }} />{s}</span>)}
                  <span className="text-[10px] text-default-400">원 크기 = 구역 면적 · 점선 = 위치 대략</span>
                </div>
              )}
              <Switch size="sm" className="mt-2" isSelected={showLines} onValueChange={setShowLines}>지하철 노선</Switch>
              {showLines && (
                <div className="mt-1.5 grid max-w-[180px] grid-cols-3 gap-x-2 gap-y-0.5">
                  {["1호선", "2호선", "3호선", "4호선", "5호선", "6호선", "7호선", "8호선", "9호선", "경의중앙선", "수인분당선", "공항철도", "신분당선", "신림선", "GTX-A"].map((l) => (
                    <span key={l} className="inline-flex items-center gap-1 whitespace-nowrap text-[10px]"><span className="h-1 w-3 rounded-full" style={{ background: LINE_COLOR[l] }} />{l.replace("호선", "").replace("선", "")}</span>
                  ))}
                </div>
              )}
              </>}
            </div>
          </div>
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            <Button isIconOnly size="sm" variant="flat" className="bg-content1 shadow-small" aria-label="확대" onPress={() => zoomBy(1.6)}>＋</Button>
            <Button isIconOnly size="sm" variant="flat" className="bg-content1 shadow-small" aria-label="축소" onPress={() => zoomBy(1 / 1.6)}>－</Button>
            <Button isIconOnly size="sm" variant="flat" className="bg-content1 shadow-small text-tiny" aria-label="서울 전체" onPress={reset}>전체</Button>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-content1/90 px-3 py-1 text-tiny text-default-600 shadow-small backdrop-blur">
            {level === "gu" ? "구를 누르면 동네로 확대 · Ctrl+스크롤, 핀치, ＋ 버튼으로 확대" : level === "dong" ? "동네를 누르면 단지별 가격이 보입니다" : "가격표를 누르면 실거래 내역이 열립니다"}
          </div>
          <div className="absolute bottom-3 right-3 hidden gap-1 sm:flex">
            {[["구로구", "구로"], ["성북구", "성북"], ["은평구", "은평"], ["서대문구", "서대문"]].map(([g, l]) => (
              <Button key={g} size="sm" radius="full" variant="flat" className="bg-content1/90 shadow-small" onPress={() => centers[g] && zoomTo(world.X(centers[g].lon), world.Y(centers[g].lat), 3.2)}>{l}</Button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ZoneDetail({ zone, apts, onClose, P, budget }) {
  if (!zone) return null;
  const idx = STAGES.indexOf(zone.stage);
  const near = apts.filter((a) => dist(a, zone) <= 500 && a.median_area_sqm >= 40);
  const prices = near.map((a) => a.median_price_10k).sort((a, b) => a - b);
  const med = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const link = /^https?:\/\//.test(zone.homepage || "") ? zone.homepage : /^https?:\/\//.test(zone.source || "") ? zone.source : null;
  return (
    <div className="flex flex-col gap-3 rounded-large bg-content1 p-4 shadow-small">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-tiny text-default-500">{zone.gu} {zone.dong} · {zone.subtype || zone.type}</div>
          <h3 className="text-large font-bold leading-snug">{zone.name}</h3>
        </div>
        <Button size="sm" variant="light" onPress={onClose}>닫기</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip size="sm" style={{ background: STAGE_COLOR[zone.stage], color: idx >= 3 ? "#fff" : "#3a0d24" }}>{zone.stage}</Chip>
        {zone.sintong && <Chip size="sm" variant="flat">신속통합기획</Chip>}
        {zone.geo === "dong" && <Chip size="sm" variant="flat" color="warning">위치는 동 중심 (대략)</Chip>}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-tiny text-default-500"><span>후보지</span><span>착공</span></div>
        <div className="flex gap-1">{STAGES.slice(0, 6).map((s, i) => <span key={s} className="h-2 flex-1 rounded-full" style={{ background: i <= idx ? STAGE_COLOR[s] : "hsl(var(--heroui-default-200))" }} title={s} />)}</div>
        <div className="mt-1 text-tiny text-default-400">원자료 단계: {zone.stage_raw || "—"}{zone.updated ? ` (${zone.updated})` : ""}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[["계획 세대수", zone.households ? `${Number(zone.households).toLocaleString()}세대` : "—"], ["구역 면적", zone.area_m2 ? `${Math.round(zone.area_m2).toLocaleString()}㎡ (${Math.round(zone.area_m2 / 3.3058).toLocaleString()}평)` : "—"]].map(([l, v]) => (
          <div key={l} className="rounded-medium bg-default-100 px-2.5 py-2"><div className="text-tiny text-default-500">{l}</div><div className="text-small font-semibold num">{v}</div></div>
        ))}
      </div>
      <div className="rounded-medium bg-default-50 px-3 py-2 text-small">
        <div className="font-semibold">주변 500m 아파트</div>
        {near.length ? <div className="num">{near.length}개 단지 · 중위가 <b style={{ color: med <= budget ? P.primary : undefined }}>{won(med)}</b></div> : <div className="text-default-400">반경 500m 안에 최근 거래된 아파트가 없습니다.</div>}
      </div>
      <p className="text-tiny leading-relaxed text-default-500">
        재개발은 보통 구역 지정부터 입주까지 10년 안팎이 걸리고, 지금 서울은 토지거래허가구역이라 매수 시 2년 실거주 의무가 붙습니다. 3년 뒤 실거주할 집보다는 "주변이 앞으로 바뀔 동네"를 고르는 참고로 보세요.
      </p>
      <div className="flex flex-wrap gap-3 text-tiny">
        <span className="text-default-400">{zone.address}</span>
        {link && SOURCE_LINKS && <a className="text-primary underline" href={link} target="_blank" rel="noopener noreferrer">구역 정보 열기</a>}
      </div>
      <p className="text-tiny text-default-400">출처: 서울 열린데이터광장 정비사업 현황 (OA-23112·23113), 2026-10-27 내려받음</p>
    </div>
  );
}

// 이 집을 사면: the loan check, then every cost — once at purchase, the loan's interest, and what it costs each month and year
export function BuyCosts({ plan: p, price, cash, rate, cost, sale }) {
  if (!p) return null;
  const propMon = p.prop.total / 12, monthly = p.mon + (cost ? cost[0] : 0) + propMon;
  const row = (l, v, sub) => (
    <div className="flex items-baseline justify-between gap-2 py-0.5"><span className="text-default-600">{l}</span><span className="text-right num"><b>{v}</b>{sub && <span className="block text-[10px] font-normal text-default-400">{sub}</span>}</span></div>
  );
  return (
    <div className="flex flex-col gap-2 text-small">
      <div className="flex flex-wrap items-center gap-2">
        <Chip color={p.ok ? "success" : "danger"} variant="flat" size="sm">{p.ok ? "대출 가능" : `대출 ${won(p.need - p.maxLoan)} 부족`}</Chip>
        <span className="text-default-500 num">필요 대출 {won(p.need)} · 최대 {won(p.maxLoan)} ({p.bind})</span>
      </div>
      <div className="rounded-medium bg-default-50 px-3 py-2">
        <div className="text-tiny font-semibold text-default-500">살 때 한 번</div>
        {row("집값", won(price))}
        {row("취득세 (지방교육세 포함)", won(p.acq.total), `세율 ${p.acq.rate}%${p.acq.farm ? " · 85㎡ 초과 농특세" : ""}${p.acq.cut ? ` · 생애최초 ${won(p.acq.cut)} 감면` : ""}`)}
        {row("중개보수", won(p.fee.total), `법정 상한 ${p.fee.rate}%, 부가세 별도`)}
        <div className="mt-1 flex items-baseline justify-between border-t border-default-200 pt-1"><span className="font-semibold">필요한 돈</span><b className="num">{won(price + p.upfront)}</b></div>
        <div className="text-[10px] text-default-400 num">가진 돈 {won(cash)}{sale ? ` (지금 집 판 돈 ${won(sale.net)} 포함)` : ""} → 나머지 {won(p.need)}을 대출</div>
      </div>
      <div className="rounded-medium bg-default-50 px-3 py-2">
        <div className="text-tiny font-semibold text-default-500">대출 {won(p.loan)} · 금리 {rate}% · 30년 원리금균등</div>
        {row("월 상환", `${won(p.mon)}원`, `첫 달 이자 ${won(p.int1)} + 원금 ${won(Math.max(0, p.mon - p.int1))}`)}
        {row("30년 총 이자", `${won(p.totalInt)}원`)}
      </div>
      <div className="rounded-medium bg-default-50 px-3 py-2">
        <div className="text-tiny font-semibold text-default-500">사는 동안 매달</div>
        {row("대출 상환", `${won(p.mon)}원`)}
        {cost && row("관리비", `${cost[0]}만원`, "K-apt 최근 12개월 평균")}
        {row("재산세 (월로 나눔)", `${won(propMon)}원`, `1년 약 ${won(p.prop.total)} · 공시가 약 ${won(p.prop.pub)} 가정`)}
        <div className="mt-1 flex items-baseline justify-between border-t border-default-200 pt-1"><span className="font-semibold">월 주거비</span><b className="num text-primary">약 {won(monthly)}원</b></div>
      </div>
      {p.prop.comp && <p className="text-tiny text-warning-700">공시가격이 12억을 넘을 것으로 보여 종합부동산세가 따로 붙을 수 있어요 (위 계산에는 없음).</p>}
      <p className="text-[10px] text-default-400">2026년 1주택 기준 추정치입니다. 취득세는 1주택 세율(종전 집을 3년 안에 파는 일시적 2주택 포함), 재산세는 공시가격을 시세의 69%로 보고 1주택 특례를 적용했습니다. 실제 세금은 공시가격·감면 요건에 따라 달라집니다.</p>
    </div>
  );
}

// 관리비 (K-apt, 세대당 최근 12개월 평균)
function Living({ cost }) {
  return (
    <div className="rounded-medium bg-default-50 px-3 py-2">
      <div className="text-small font-semibold">관리비</div>
      {cost && (
        <div className="mt-1 text-tiny num">
          <span className="text-default-500">관리비 (세대당 월평균)</span> <b className="text-small">{cost[0]}만원</b>
          <span className="text-default-500"> · 공용 {cost[1]}만 · 가장 많은 달 {cost[2]}만</span>
          <div className="text-[10px] text-default-400">K-apt 최근 {cost[3]}개월(~{String(cost[4]).slice(0, 4)}.{String(cost[4]).slice(4)}) 단지 부과액 ÷ 세대수. 큰 평형일수록 더 나옵니다.</div>
        </div>
      )}
    </div>
  );
}

// 배정 초등학교 (통학구역) and the 중학교 학교군, nearest schools first
const walk = (m) => Math.max(1, Math.round((m * 1.3) / 67));  // straight line × 1.3 for streets, 67 m a minute
const statLine = (st) => (st ? `학생 ${st[0]?.toLocaleString() ?? "—"}명 · 학급당 ${st[1] ?? "—"}명${st[2] != null ? ` · 순전입 ${st[2] > 0 ? "+" : ""}${st[2]}%` : ""}` : null);
function Schools({ sc, row, apt, stats }) {
  const [e, ed, gi] = row, es = e ? sc.schools[e] : null, g = gi != null ? sc.mgroups[gi] : null;
  const ms = g ? g[1].map((id) => ({ id, s: sc.schools[id] })).filter((x) => x.s).map((x) => ({ ...x, d: dist(apt, { lon: x.s[2], lat: x.s[3] }) })).sort((a, b) => a.d - b.d) : [];
  return (
    <div className="rounded-medium bg-default-50 px-3 py-2">
      <div className="text-small font-semibold">학교</div>
      {es && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-tiny num">
          <span className="text-default-500">배정 초등학교</span><Chip size="sm" variant="flat" color={ed <= 400 ? "success" : ed <= 800 ? "default" : "warning"} className="h-6">{es[0]}</Chip>
          <span>직선 {ed.toLocaleString()}m · 도보 약 {walk(ed)}분</span>{es[4] && es[4] !== "공립" && <span className="text-default-400">({es[4]})</span>}
          {stats?.[e] && <span className="w-full text-default-500">{statLine(stats[e])}</span>}
        </div>
      )}
      {g && (
        <div className="mt-1.5 text-tiny num">
          <span className="text-default-500">중학교 {g[0]}</span> <span className="text-default-400">({ms.length}개교 중 가까운 순)</span>
          <div className="mt-0.5 flex flex-col gap-0.5">{ms.slice(0, 4).map((x) => <span key={x.id} className="flex flex-wrap items-center gap-1.5"><Chip size="sm" variant="flat" className="h-6">{x.s[0].replace(/중학교$/, "중")} {(x.d / 1000).toFixed(1)}km</Chip>{stats?.[x.id] && <span className="text-[10px] text-default-500">{statLine(stats[x.id])}</span>}</span>)}</div>
        </div>
      )}
      <p className="mt-1 text-[10px] text-default-400">교육부 학구도({sc.base}) 기준. 서울 중학교는 학교군 안에서 지원·추첨으로 배정되고, 통학구역은 학기마다 바뀔 수 있으니 관할 교육지원청에서 확인하세요.</p>
    </div>
  );
}

// 용도지역·규제 (브이월드 토지이용계획, 단지 대표 필지 기준)
const FLAG_COLOR = { 토지거래허가구역: "warning", 정비구역: "primary", 재정비촉진지구: "primary", 지구단위계획구역: "secondary", 고도지구: "danger", 경관지구: "danger", 개발제한구역: "danger", 군사시설보호구역: "danger", 비행안전구역: "danger", "문화유산 주변": "danger" };
const FLAG_NOTE = { 토지거래허가구역: "사면 2년 실거주 의무", 정비구역: "재개발·재건축 등 정비사업 구역", 재정비촉진지구: "뉴타운 등 광역 정비", 지구단위계획구역: "높이·용도를 따로 정한 계획구역",
  고도지구: "건물 높이 제한", 경관지구: "경관 보호로 높이·형태 제한", 개발제한구역: "그린벨트", 군사시설보호구역: "건축·증축 시 협의 필요", 비행안전구역: "높이 제한", "문화유산 주변": "주변 건축 시 심의" };
function LandUse({ land, apt, bldg, hh }) {
  const [more, setMore] = useState(false);
  const old = apt.build_year && new Date().getFullYear() - apt.build_year >= 30;
  return (
    <div className="rounded-medium bg-default-50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-small font-semibold">용도지역·규제</span>
        {land.pnu && SOURCE_LINKS && <a className="text-tiny text-primary underline" href={`https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?pnu=${land.pnu}&mode=search&isNoScr=script&selGbn=umd`} target="_blank" rel="noopener noreferrer">토지이음에서 확인 ↗</a>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-tiny num">
        {land.zones[0] ? <Chip size="sm" variant="solid" color="default" className="h-6">{land.zones[0]}</Chip> : <span className="text-default-400">용도지역 정보 없음</span>}
        {land.zones.slice(1).map((z) => <Chip key={z} size="sm" variant="flat" className="h-6">일부 {z}</Chip>)}
        {land.far_max && <span className="text-default-600">용적률 상한 <b>{land.far_max}%</b> <span className="text-default-400">({land.far_basis})</span></span>}
      </div>
      {bldg?.[0] && (() => {
        const room = land.far_max ? Math.round(land.far_max - bldg[0]) : null;
        return (
          <div className="mt-1.5 rounded-small bg-content1 px-2 py-1.5 text-tiny num">
            <span className="text-default-500">지금 용적률</span> <b className="text-small">{Math.round(bldg[0])}%</b>{bldg[7] ? <span className="text-[10px] text-default-400"> (추정)</span> : null}
            {room != null && <> <span className="text-default-500">· 상한 {land.far_max}% →</span> <Chip size="sm" variant="flat" color={room >= 50 ? "success" : room >= 0 ? "warning" : "danger"} className="h-5">{room >= 0 ? `여유 ${room}%p` : `상한보다 ${-room}%p 높음`}</Chip></>}
            <div className="mt-0.5 text-[10px] text-default-500">{[bldg[1] && `건폐율 ${Math.round(bldg[1])}%`, bldg[4] && `주차 ${bldg[4].toLocaleString()}대${hh ? ` (세대당 ${(bldg[4] / hh).toFixed(2)})` : ""}`, bldg[5] && `승강기 ${bldg[5]}대`, bldg[6] && `최고 ${bldg[6]}층`].filter(Boolean).join(" · ")}</div>
            {room != null && <div className="text-[10px] text-default-400">{room >= 50 ? "상한까지 여유가 커서 재건축 때 더 지을 수 있는 편입니다." : room >= 0 ? "여유가 크지 않아 재건축 사업성은 조건(종상향 등)에 따라 달라집니다." : "이미 상한을 넘어 지어져, 재건축하면 오히려 줄어들 수 있습니다."} 건축물대장 기준.</div>}
          </div>
        );
      })()}
      {land.flags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{land.flags.map((f) => <Chip key={f} size="sm" variant="flat" color={FLAG_COLOR[f] || "default"} className="h-6" title={FLAG_NOTE[f]}>{f}</Chip>)}</div>}
      {land.flags.some((f) => FLAG_NOTE[f]) && <p className="mt-1 text-[10px] text-default-500">{land.flags.filter((f) => FLAG_NOTE[f]).map((f) => `${f}: ${FLAG_NOTE[f]}`).join(" · ")}</p>}
      {old && land.far_max && !bldg?.[0] && <p className="mt-1 text-[10px] text-default-500">준공 30년+ 단지입니다. 지금 용적률이 상한({land.far_max}%)보다 많이 낮을수록 재건축 때 더 지을 여지가 큽니다. 현재 용적률은 건축물대장에서 확인하세요.</p>}
      <button type="button" className="mt-1 text-[10px] text-default-400 underline" onClick={() => setMore((v) => !v)}>{more ? "접기" : `걸린 지역·지구 전체 ${land.all.length}개`}</button>
      {more && <p className="text-[10px] leading-relaxed text-default-500">{land.all.join(" · ")}</p>}
      <p className="mt-1 text-[10px] text-default-400">브이월드 토지이용계획, 단지 대표 필지 기준. 단지가 여러 필지면 다를 수 있으니 계약 전에는 토지이용계획확인서로 확인하세요.</p>
    </div>
  );
}

export function AptDetail({ apt, trades, budget, scen, data, onClose, P, fitOf, fitText, fitColor }) {
  const rows = trades?.[apt.id];
  const b = data.budget?.find((x) => x.scenario === scen), rate = b?.rate ?? data.rates?.at(-1)?.mortgage_pct ?? 4.66;
  const f = fitOf(apt.median_price_10k);
  const near = useMemo(() => {
    if (!data.subway || apt.lon == null) return null;
    const ds = data.subway.map((s) => ({ ...s, d: dist(apt, s) })).sort((a, b) => a.d - b.d);
    const seen = new Set(), out = [];
    for (const s of ds) { if (seen.has(s.station)) { const o = out.find((x) => x.station === s.station); if (o && !o.lines.includes(s.line)) o.lines.push(s.line); continue; } seen.add(s.station); out.push({ station: s.station, lines: [s.line], d: s.d }); if (out.length >= 2) break; }
    return out;
  }, [apt, data.subway]);
  const price = apt.median_price_10k, cash = b?.cash_10k ?? 0, income = b?.income_10k ?? 0;
  const plan = price != null ? buyPlan(price, { cash, income, rate, first: b ? b.first : true, area: apt.median_area_sqm }) : null;
  const pts = (rows || []).map(([d, a, fl, p]) => ({ t: Date.parse(d), p: p / 10000, a, d, fl }));
  const dong = data.dong_summary?.find((r) => r.id === `${apt.gu} ${apt.dong}`);
  const details = useLazyFile(apt.sido === "41" ? "apt_detail_gg" : "apt_detail"), basics = useLazyFile(apt.sido === "41" ? "apt_info_gg" : "apt_info");
  const work = data.work || { name: "광화문" }, odsay = work.name === "광화문" ? data.commute?.[apt.hcode] : null;
  const ride = odsay || (apt.lon != null && work.lon != null ? { min: estCommute(kmTo(apt, work)), est: true, km: kmTo(apt, work) } : null);
  const det = details?.[apt.id], info = basics?.[apt.id];
  // complexes K-apt does not list: 세대수 etc. from the 건축물대장 of the parcel under the map point
  const smallF = useLazyFile("apt_small", !!basics && !info), small = !info ? smallF?.items?.[apt.id] : null, hi = info || small;
  const landuse = useLazyFile("landuse"), land = info?.kaptCode ? landuse?.items?.[info.kaptCode] : null;
  const school = useLazyFile("school"), sstats = useLazyFile("school_stats");
  const cost = info?.kaptCode ? data.apt_cost?.items?.[info.kaptCode] : null;
  const bldg = info?.kaptCode ? data.bldg?.items?.[info.kaptCode] : null;  // 건축물대장 [용적률, 건폐율, 연면적, 대지, 주차, 승강기, 최고층]  // [월평균, 공용, 최고 달, 개월, 마지막 달] 만원/세대
  const [watch, toggleWatch] = useWatch(), saved = watch[apt.id];
  // the size people trade most here, and its recent price, are what the watchlist tracks
  const main = det?.areas?.length ? [...det.areas].sort((a, b2) => b2.n6 - a.n6 || b2.n - a.n)[0] : null;
  return (
    <div className="flex flex-col gap-3 rounded-large bg-content1 p-4 shadow-small">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-tiny text-default-500">{apt.gu} {apt.dong} · {apt.build_year ? `${apt.build_year}년 준공 · ${Math.max(1, new Date().getFullYear() - apt.build_year)}년 차` : "준공 연도 모름"}</div>
          <h3 className="text-large font-bold leading-snug">{apt.apt}</h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant={saved ? "solid" : "flat"} color={saved ? "warning" : "default"} isDisabled={!saved && !details}
            onPress={() => toggleWatch(apt, main?.a ?? apt.median_area_sqm, main ? main.med ?? main.last : price)}>{saved ? "★ 관심" : "☆ 관심"}</Button>
          <Button size="sm" variant="light" onPress={onClose}>목록</Button>
        </div>
      </div>
      {saved && <p className="-mt-1 text-[10px] text-default-400 num">{saved.savedAt}에 {saved.area}㎡ {won(saved.price)}로 저장 · 헤더의 '관심 단지'에서 비교</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="flat" style={{ background: fitColor[f] + "33" }}>{fitText[f]}</Chip>
        {dong && <Chip size="sm" variant="flat">{dong.apt_zone}</Chip>}
        {apt.build_year && apt.build_year <= 1996 && <Chip size="sm" variant="flat" color="warning">재건축 연한 (30년+)</Chip>}
        {near?.[0] && <Chip size="sm" variant="flat">{near[0].station} {near[0].lines.join("·")} · 도보 약 {Math.max(1, Math.round(near[0].d / 75))}분</Chip>}
        {ride && <Chip size="sm" variant="flat" color="primary">{work.name}까지 {ride.est ? `직선 ${ride.km.toFixed(1)}km · 대중교통 약 ${ride.min}분(추정)` : `대중교통 약 ${ride.min}분${ride.route ? ` · ${ride.route}` : ""}`}</Chip>}
      </div>
      {apt.no_trade && <p className="rounded-medium bg-default-100 px-3 py-2 text-small text-default-600">{apt.build_year && apt.build_year >= new Date().getFullYear() - 1
        ? "최근 입주한 신축이라 아직 아파트 매매 신고가 없습니다. 입주 전 거래는 분양권 전매로 따로 신고됩니다."
        : "최근 2년 동안 이 단지의 아파트 매매 신고가 없습니다."}{det?.rent_only ? " 대신 최근 전세 계약을 아래에 보여줍니다." : " 아래는 K-apt 단지 기본정보입니다."}</p>}
      {apt.stale && <p className="rounded-medium bg-default-100 px-3 py-2 text-tiny text-default-600">최근 6개월 매매가 없어 <b>마지막 거래({apt.last_trade}, {apt.median_area_sqm}㎡)</b> 가격을 보여줍니다. 지금 시세와 다를 수 있습니다.</p>}
      {!apt.no_trade && <div className="grid grid-cols-3 gap-2">
        {/* 전세 sits up here too: in the 평형 table it is the last column, which narrow phones push off screen */}
        {[[apt.stale ? "마지막 거래가" : "중위가", won(price), `${apt.stale ? "그 거래" : "대표"} ${apt.median_area_sqm}㎡`],
          ["전세 중위", main?.jeonse ? won(main.jeonse) : "—", main?.jeonse ? `${main.a}㎡ · 전세가율 ${main.jeonse_ratio}%` : "최근 전세 거래 없음"],
          ["가격 범위", `${won(apt.min_price_10k)}~${won(apt.max_price_10k)}`, "최근 6개월"]].map(([l, v, sub]) => (
          <div key={l} className="rounded-medium bg-default-100 px-2.5 py-2"><div className="text-tiny text-default-500">{l}</div><div className="text-small font-semibold num">{v}</div><div className="text-[10px] text-default-400 num">{sub}</div></div>
        ))}
      </div>}
      {!hi && basics && smallF && <p className="rounded-medium bg-default-50 px-3 py-2 text-tiny text-default-500">세대수·동수·시공사 같은 단지 정보가 없습니다. K-apt(공동주택관리정보)에 등록되지 않은 단지예요. 대개 의무관리 대상이 아닌 소규모 단지(약 150세대 미만)이거나, 실거래 단지명과 K-apt 이름이 달라 연결하지 못한 경우입니다.</p>}
      {hi && (
        <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-medium bg-default-50 px-3 py-2 text-tiny num">
          {[["세대수", hi.households && `${Number(hi.households).toLocaleString()}세대`], ["동수", hi.buildings && `${hi.buildings}개동`], ["사용승인", hi.approval], ["시공사", hi.builder], ["난방", hi.heating], ["주차", hi.parking && hi.households ? `${hi.parking.toLocaleString()}대 (세대당 ${(hi.parking / hi.households).toFixed(2)})` : hi.parking], ["복도", hi.hall], ["최고층", hi.floors_max && `${hi.floors_max}층`], ["평형 구성", [hi.units_le60 && `~60㎡ ${hi.units_le60}`, hi.units_60_85 && `60~85㎡ ${hi.units_60_85}`, hi.units_85_135 && `85㎡~ ${hi.units_85_135 + (hi.units_gt135 || 0)}`].filter(Boolean).join(" · ")]].filter(([, v]) => v).map(([l, v]) => (
            <div key={l} className={`min-w-0 ${l === "평형 구성" || l === "주차" ? "col-span-3" : ""}`}><span className="text-default-500">{l} </span><span className="font-medium">{v}</span></div>
          ))}
          {small && <div className="col-span-3 text-[10px] text-default-400">K-apt에 없는 단지라 건축물대장 기준입니다{small.name ? ` (대장 건물명: ${small.name})` : ""}. 여러 필지에 걸친 단지는 세대수가 적게 나올 수 있어요.</div>}
        </div>
      )}
      {cost && <Living cost={cost} />}
      {school?.apts?.[apt.id] && <Schools sc={school} row={school.apts[apt.id]} apt={apt} stats={sstats?.schools} />}
      {land && <LandUse land={land} apt={apt} bldg={bldg} hh={info?.households} />}
      <div>
        <div className="mb-1 flex items-baseline justify-between"><span className="text-small font-semibold">평형별 시세</span>{det?.high && <Chip size="sm" color="danger" variant="flat">최근 2년 최고가 경신</Chip>}</div>
        {!details ? <Skeleton className="h-20 rounded-medium" /> : det?.rent_only && !det.areas.length ? (
          <table className="w-full text-tiny num">
            <thead className="text-default-500"><tr><th className="py-1 text-left font-medium">전용</th><th className="text-right font-medium">전세 중위</th><th className="text-right font-medium">범위</th><th className="text-right font-medium">계약</th></tr></thead>
            <tbody>{det.rent_only.map((r) => <tr key={r.a} className="border-t border-default-100"><td className="py-1.5 font-medium">{r.a}㎡ <span className="text-[10px] font-normal text-default-400">{(r.a / 3.3058).toFixed(0)}평</span></td><td className="text-right font-semibold">{won(r.jeonse)}</td><td className="text-right">{r.min === r.max ? "—" : `${won(r.min)}~${won(r.max)}`}</td><td className="text-right">{r.n}건</td></tr>)}</tbody>
          </table>
        ) : !det ? <p className="text-tiny text-default-400">평형별 정보가 없습니다.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-tiny num">
              <thead className="text-default-500"><tr><th className="py-1 text-left font-medium">전용</th><th className="text-right font-medium">6개월 중위</th><th className="text-right font-medium">2년 최고</th><th className="text-right font-medium">전세 (전세가율)</th></tr></thead>
              <tbody>
                {det.areas.map((a) => (
                  <tr key={a.a} className="border-t border-default-100 align-top">
                    <td className="py-1.5 font-medium">{a.a}㎡<div className="text-[10px] font-normal text-default-400">{(a.a / 3.3058).toFixed(0)}평 · {a.n}건</div></td>
                    <td className="text-right">{a.med ? won(a.med) : "—"}<div className="text-[10px] text-default-400">최근 {won(a.last)} · {a.last_date.slice(2)} · {a.last_floor ?? "—"}층</div></td>
                    <td className="text-right" style={{ color: a.high ? "#E5484D" : undefined }}>{won(a.max)}{a.high && " ▲"}<div className="text-[10px] text-default-400">{a.max_date.slice(2)}</div></td>
                    <td className="text-right">{a.jeonse ? won(a.jeonse) : "—"}<div className="text-[10px] text-default-400">{a.jeonse_ratio ? `${a.jeonse_ratio}% · ${a.jeonse_n}건` : "전세 거래 없음"}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1 text-[10px] text-default-400">최근 2년 매매, 전세는 4~9월 계약 기준. 전세가율은 같은 평형 6개월 매매 중위가 대비.</p>
      </div>
      {price != null && <><Divider />
      <div>
        <div className="mb-1 text-small font-semibold">{b?.label || "내 조건으로"} 이 집을 사면{apt.stale ? " (마지막 거래가 기준)" : ""}</div>
        <BuyCosts plan={plan} price={price} cash={cash} rate={rate} cost={cost} sale={b?.sale} />
      </div></>}
      <Divider />
      <div>
        <div className="mb-1 flex items-baseline justify-between"><span className="text-small font-semibold">실거래 (최근 12개월)</span><span className="text-tiny text-default-500">{rows ? `${rows.length}건` : ""}</span></div>
        {!trades ? <Skeleton className="h-40 rounded-medium" /> : !rows?.length ? <p className="text-tiny text-default-400">거래 내역이 없습니다.</p> : (
          <>
            <div className="h-36">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={P.grid} />
                  <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} tickFormatter={(v) => new Date(v).toISOString().slice(2, 7).replace("-", ".")} tick={{ fill: P.text, fontSize: 10 }} tickCount={4} />
                  <YAxis type="number" dataKey="p" domain={["auto", "auto"]} tickFormatter={(v) => `${Number(v).toFixed(1)}억`} tick={{ fill: P.text, fontSize: 10 }} width={48} tickCount={4} />
                  <ZAxis range={[28, 28]} />
                  <Tooltip cursor={false} content={({ active, payload }) => active && payload?.[0] ? <div className="rounded-medium bg-content1 px-2 py-1 text-tiny shadow-medium num">{payload[0].payload.d} · {payload[0].payload.a}㎡ · {payload[0].payload.fl}층<br /><b>{won(payload[0].payload.p * 10000)}</b></div> : null} />
                  <Scatter data={pts} fill={P.primary} fillOpacity={0.75} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 max-h-48 overflow-auto text-tiny num">
              <table className="w-full">
                <thead className="sticky top-0 bg-content1 text-default-500"><tr><th className="py-1 text-left font-medium">계약일</th><th className="text-right font-medium">면적</th><th className="text-right font-medium">층</th><th className="text-right font-medium">가격</th></tr></thead>
                <tbody>{rows.slice(0, 60).map((r, i) => <tr key={i} className="border-t border-default-100"><td className="py-1">{r[0]}</td><td className="text-right">{r[1]}㎡</td><td className="text-right">{r[2]}</td><td className="text-right font-semibold">{won(r[3])}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
