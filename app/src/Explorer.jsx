import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import "d3-transition";
import { Button, ButtonGroup, Chip, Divider, ScrollShadow, Skeleton, Slider, Switch } from "@heroui/react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { annuity, DSR, fmt, loanCap, LTV, palette, STRESS, useIsDark, won } from "./lib.js";

export const REF = [{ n: "광화문 (직장)", lon: 126.9769, lat: 37.5759 }, { n: "오류동 기숙사", lon: 126.8437, lat: 37.4945 }];
export const LINE_COLOR = { "1호선": "#0052A4", "2호선": "#00A84D", "3호선": "#EF7C1C", "4호선": "#00A5DE", "5호선": "#996CAC", "6호선": "#CD7C2F", "7호선": "#747F00", "8호선": "#E6186C", "9호선": "#BDB092", "신분당선": "#D4003B", "경의중앙선": "#77C4A3", "공항철도": "#0090D2", "수인분당선": "#F5A200", "우이신설선": "#B0CE18", "신림선": "#6789CA", "서해선": "#8FC31F", "GTX-A": "#9A6292", "경춘선": "#0C8E72" };
export const AREAS = [["all", "전체 면적"], ["s", "40~60㎡"], ["m", "60~85㎡"], ["l", "85㎡~"]];
export const STAGES = ["후보지·선정", "정비구역 지정", "추진위·조합설립", "사업시행인가", "관리처분인가", "이주·철거·착공", "준공"];
export const STAGE_COLOR = { "후보지·선정": "#F5B3D3", "정비구역 지정": "#EE84B8", "추진위·조합설립": "#E2569C", "사업시행인가": "#C93582", "관리처분인가": "#A21F68", "이주·철거·착공": "#6E1247", "준공": "#7C8582" };
export const STAGE_GROUPS = [["all", "전체 단계"], ["early", "초기 (후보~조합)"], ["late", "후기 (사업시행 이후)"]];
export const stageOk = (s, g) => g === "all" || (g === "early" ? STAGES.indexOf(s) <= 2 : STAGES.indexOf(s) >= 3);
export const AGES = [["all", "전체 연식"], ["new", "신축 10년 이내"], ["old", "30년+ 재건축 연한"]];
export const ageOk = (y, f) => f === "all" || (y && (f === "new" ? y >= 2016 : y <= 1996));
// studios under 40㎡ are left out: they are not a home for a couple and crowd the price tags
export const areaOk = (a, f) => a >= 40 && (f === "all" || (f === "s" ? a < 60 : f === "m" ? a >= 60 && a <= 85 : a > 85));
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
                <span className="inline-flex items-center gap-1.5"><span className="text-[10px]">◆</span>직장 · 기숙사</span>
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
        {link && <a className="text-primary underline" href={link} target="_blank" rel="noopener noreferrer">구역 정보 열기</a>}
      </div>
      <p className="text-tiny text-default-400">출처: 서울 열린데이터광장 정비사업 현황 (OA-23112·23113), 2026-10-27 내려받음</p>
    </div>
  );
}

export function AptDetail({ apt, trades, budget, scen, data, onClose, P, fitOf, fitText, fitColor }) {
  const rows = trades?.[apt.id];
  const b = data.budget?.find((x) => x.scenario === scen), rate = data.rates?.at(-1)?.mortgage_pct ?? 4.66;
  const f = fitOf(apt.median_price_10k);
  const near = useMemo(() => {
    if (!data.subway || apt.lon == null) return null;
    const ds = data.subway.map((s) => ({ ...s, d: dist(apt, s) })).sort((a, b) => a.d - b.d);
    const seen = new Set(), out = [];
    for (const s of ds) { if (seen.has(s.station)) { const o = out.find((x) => x.station === s.station); if (o && !o.lines.includes(s.line)) o.lines.push(s.line); continue; } seen.add(s.station); out.push({ station: s.station, lines: [s.line], d: s.d }); if (out.length >= 2) break; }
    return out;
  }, [apt, data.subway]);
  const price = apt.median_price_10k, cash = b?.cash_10k ?? 0, income = b?.income_10k ?? 0;
  const need = Math.max(0, price - cash);
  const lims = [["LTV 70%", price * LTV], ["주담대 상한", loanCap(price)], [`DSR 40%`, (income * DSR) / (annuity(rate + STRESS) * 12)]];
  const maxLoan = Math.min(...lims.map((l) => l[1])), ok = need <= maxLoan, bind = lims.find((l) => l[1] === maxLoan)[0];
  const mon = Math.min(need, maxLoan) * annuity(rate);
  const pts = (rows || []).map(([d, a, fl, p]) => ({ t: Date.parse(d), p: p / 10000, a, d, fl }));
  const dong = data.dong_summary?.find((r) => r.id === `${apt.gu} ${apt.dong}`);
  return (
    <div className="flex flex-col gap-3 rounded-large bg-content1 p-4 shadow-small">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-tiny text-default-500">{apt.gu} {apt.dong} · {apt.build_year || "—"}년 준공</div>
          <h3 className="text-large font-bold leading-snug">{apt.apt}</h3>
        </div>
        <Button size="sm" variant="light" onPress={onClose}>목록</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="flat" style={{ background: fitColor[f] + "33" }}>{fitText[f]}</Chip>
        {dong && <Chip size="sm" variant="flat">{dong.apt_zone}</Chip>}
        {apt.build_year && apt.build_year <= 1996 && <Chip size="sm" variant="flat" color="warning">재건축 연한 (30년+)</Chip>}
        {near?.[0] && <Chip size="sm" variant="flat">{near[0].station} {near[0].lines.join("·")} · 도보 약 {Math.max(1, Math.round(near[0].d / 75))}분</Chip>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[["중위가", won(price)], ["가격 범위", `${won(apt.min_price_10k)}~${won(apt.max_price_10k)}`], ["대표 면적", `${apt.median_area_sqm}㎡`]].map(([l, v]) => (
          <div key={l} className="rounded-medium bg-default-100 px-2.5 py-2"><div className="text-tiny text-default-500">{l}</div><div className="text-small font-semibold num">{v}</div></div>
        ))}
      </div>
      <Divider />
      <div>
        <div className="mb-1 text-small font-semibold">{scen === "later" ? "결혼 후 둘이" : "지금 혼자"} 이 집을 사면</div>
        <div className="flex flex-wrap items-center gap-2 text-small">
          <Chip color={ok ? "success" : "danger"} variant="flat" size="sm">{ok ? "대출 가능" : `대출 ${won(need - maxLoan)} 부족`}</Chip>
          <span className="text-default-500">필요 대출 {won(need)} · 최대 {won(maxLoan)} ({bind})</span>
        </div>
        <div className="mt-1 text-small">월 상환 약 <b className="num">{won(mon)}원</b> <span className="text-tiny text-default-400">(금리 {rate}%, 30년)</span></div>
      </div>
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
