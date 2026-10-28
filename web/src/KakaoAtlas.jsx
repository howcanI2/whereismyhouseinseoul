"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonGroup, Chip, Divider, Skeleton, Slider, Switch } from "@heroui/react";
import { attachCommute, fitState, palette, shareBelow, useIsDark, useLazyFile, won } from "./lib.js";
import { AGES, ageOk, AptDetail, AREAS, areaOk, LINE_COLOR, REF, STAGE_COLOR, STAGE_GROUPS, STAGES, stageOk, ZoneDetail } from "./Explorer.jsx";
import { DOWN, LEVEL_NAME, LEVELS, lum, METRICS, mixc, Overview, PERIOD_NOTE, PERIODS, RegionPanel, UP } from "./Atlas.jsx";

// Load the Kakao Maps SDK once; resolves with window.kakao or rejects (bad key, unregistered domain, offline).
let sdk;
function loadKakao(appKey) {
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    if (window.kakao?.maps) return window.kakao.maps.load(() => resolve(window.kakao));
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    s.async = true;
    s.onload = () => (window.kakao?.maps ? window.kakao.maps.load(() => resolve(window.kakao)) : reject(new Error("Kakao SDK did not initialise")));
    s.onerror = () => reject(new Error("Kakao SDK failed to load"));
    document.head.appendChild(s);
  });
  sdk.catch(() => { sdk = null; });
  return sdk;
}

const polysOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []);
// Kakao zoom: 1 = street, 14 = country. Seoul fits around 8, Seoul + Gyeonggi around 10.
const SCOPES = {
  seoul: { levels: LEVELS, levelFor: (kz) => (kz >= 8 ? "gu" : kz >= 6 ? "bdong" : "apt"), fine: "bdong", center: [126.99, 37.5565], kz: 8 },
  metro: { levels: [["auto", "자동"], ["sgg", "시군구"], ["hdong", "행정동"]], levelFor: (kz) => (kz >= 9 ? "sgg" : kz >= 6 ? "hdong" : "apt"), fine: "hdong", center: [127.02, 37.47], kz: 10 },
};
const el = (html, style, onClick) => { const d = document.createElement("div"); d.innerHTML = html; Object.assign(d.style, style); if (onClick) d.addEventListener("click", (e) => { e.stopPropagation(); onClick(); }); return d; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default function KakaoAtlas({ data: base, appKey, onFail, scope = "seoul" }) {
  const S = SCOPES[scope], metro = scope === "metro";
  const mIns = useLazyFile("metro_insights", metro), mApts = useLazyFile("metro_apts", metro), mHd = useLazyFile("metro_hdong_geo", metro), mSgg = useLazyFile("metro_sgg_geo", metro);
  // one data object per scope; the panels read insights/apts from it
  const data = useMemo(() => (metro ? { ...base, insights: attachCommute(mIns, mApts, base.commute), apts: mApts, scope } : { ...base, insights: attachCommute(base.insights, base.apts, base.commute), scope }), [metro, base, mIns, mApts]);
  const [maxMin, setMaxMin] = useState(0);
  const [showQuiet, setShowQuiet] = useState(true);
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
  const tS = useLazyFile("trades", !!sel), tG = useLazyFile("trades_gg", !!sel && metro);
  const trades = useMemo(() => (tS || tG ? { ...(tS || {}), ...(tG || {}) } : null), [tS, tG]);
  const [showLines, setShowLines] = useState(false);
  const [showRedev, setShowRedev] = useState(false);
  const [showDistrict, setShowDistrict] = useState(false);
  const [stageGroup, setStageGroup] = useState("all");
  const [legendOpen, setLegendOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ kz: 8, tick: 0 });
  const boxRef = useRef(null), mapRef = useRef(null), kRef = useRef(null);
  const layers = useRef({ polys: {}, outline: [], tags: [], pins: [], zones: [], lines: [], refs: [] });
  const handlers = useRef({});
  const m = METRICS.find((x) => x.id === metricId);
  fitState.budget = budget;
  const ins = data.insights;

  useEffect(() => { if (later && now) setBudget(scen === "later" ? later.max_price_10k : now.max_price_10k); }, [scen, later, now]);

  // ---- map instance ----
  useEffect(() => {
    let dead = false;
    loadKakao(appKey).then((kakao) => {
      if (dead || !boxRef.current) return;
      kRef.current = kakao;
      const map = new kakao.maps.Map(boxRef.current, { center: new kakao.maps.LatLng(S.center[1], S.center[0]), level: S.kz });
      map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
      kakao.maps.event.addListener(map, "idle", () => setView((v) => ({ kz: map.getLevel(), tick: v.tick + 1 })));
      mapRef.current = map;
      setReady(true);
    }).catch((e) => { if (!dead) onFail?.(e); });
    return () => { dead = true; };
  }, [appKey]);

  // switching 서울 ↔ 서울+경기: reset the level, recentre, drop the other scope's layers
  useEffect(() => {
    setLevel("auto"); setSelRegion(null); setSel(null);
    const k = kRef.current, map = mapRef.current, L = layers.current; if (!map) return;
    Object.values(L.polys).forEach((list) => list.forEach(({ pg }) => pg.setMap(null))); L.polys = {};
    L.outline.forEach((o) => o.setMap(null)); L.outline = [];
    map.setLevel(S.kz); map.setCenter(new k.maps.LatLng(S.center[1], S.center[0]));
  }, [scope]);

  const kz = view.kz;
  const eff = level === "auto" ? S.levelFor(kz) : level;
  const regionLevel = eff === "apt" ? S.fine : eff;
  const commute = base.commute || {};
  const tooFar = (hcode) => maxMin > 0 && (commute[hcode]?.min ?? 999) > maxMin;
  const regionTooFar = (r) => maxMin > 0 && (r?.commute == null || r.commute > maxMin);
  const showPins = eff === "apt" || (level !== "auto" && kz <= 4);
  const fitOf = (v) => (v == null ? "none" : v <= budget ? "ok" : v <= budget * 1.15 ? "near" : "over");
  const fitColor = { ok: P.primary, near: P.amber, over: "#9AA5A1", none: "#9AA5A1" };
  const fitText = { ok: "예산 안", near: "조금 넘음 (15% 이내)", over: "예산 초과" };
  const apts = useMemo(() => (data.apts || []).filter((a) => a.lon != null), [data.apts]);
  const zones = useMemo(() => (data.redev || []).filter((r) => r.lon != null && r.stage !== "준공"), [data.redev]);

  const flyTo = (lon, lat, kzTarget) => {
    const k = kRef.current, map = mapRef.current; if (!map) return;
    const ll = new k.maps.LatLng(lat, lon);
    if (map.getLevel() > kzTarget) map.setLevel(kzTarget, { anchor: ll, animate: { duration: 350 } });
    map.panTo(ll);
  };
  const pickApt = (a) => { setSel(a.id); setSelZone(null); if (a.lon != null) flyTo(a.lon, a.lat, 3); };
  const pickRegion = (lv, key) => {
    setSelRegion({ level: lv, key }); setSel(null); setSelZone(null);
    const r = ins?.[lv]?.[key]; if (r?.center) flyTo(r.center[0], r.center[1], lv === "gu" ? 6 : 4);
  };
  handlers.current = { pickApt, pickRegion, setSelZone, setSel };

  // ---- colour scale (same rules as the drawn map) ----
  const scale = useMemo(() => {
    if (!ins) return null;
    const vals = Object.values(ins[regionLevel] || {}).filter((r) => (r[period]?.n || 0) >= 5).map((r) => m.get(r, period, scen)).filter((v) => v != null).sort((a, b) => a - b);
    if (!vals.length) return null;
    const q = (p) => vals[Math.floor(p * (vals.length - 1))];
    const lo = q(0.05), hi = q(0.95), base0 = "#EEF2F1";
    if (m.div) { const a = Math.max(Math.abs(lo), Math.abs(hi), 1); return { lo: -a, hi: a, color: (v) => (v >= 0 ? mixc(base0, UP, v / a) : mixc(base0, DOWN, -v / a)) }; }
    const base = m.id === "jeonse" ? "#C77A12" : "#0B7A64";
    return { lo, hi, color: (v) => { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return mixc(base0, base, m.inv ? 1 - t : t); } };
  }, [ins, regionLevel, period, metricId, scen, budget]);
  const valueOf = (lv, key) => { const r = ins?.[lv]?.[key]; return r && (r[period]?.n || 0) >= 5 ? m.get(r, period, scen) : null; };

  // ---- region polygons: built once per level, recoloured on demand ----
  useEffect(() => {
    if (!ready || !ins) return;
    const k = kRef.current, map = mapRef.current, L = layers.current;
    const src = metro
      ? { sgg: mSgg?.map((r) => [r.sgg, r.geometry]), hdong: mHd?.map((r) => [r.code, r.geometry]) }
      : { gu: data.seoul_geo?.map((r) => [r.gu, r.geometry]), bdong: data.dong_geo?.map((r) => [r.id, r.geometry]), hdong: data.hdong_geo?.map((r) => [r.code, r.geometry]) };
    const outlineSrc = metro ? mSgg : data.seoul_geo;
    if (!L.polys[regionLevel] && src[regionLevel]) {
      L.polys[regionLevel] = src[regionLevel].flatMap(([key, g]) => polysOf(g).map((poly) => {
        const pg = new k.maps.Polygon({ path: poly.map((ring) => ring.map(([x, y]) => new k.maps.LatLng(y, x))), strokeWeight: 1, strokeColor: "#ffffff", strokeOpacity: 0.9, fillColor: "#EEF2F1", fillOpacity: 0.5 });
        k.maps.event.addListener(pg, "click", () => handlers.current.pickRegion(regionLevel, key));
        k.maps.event.addListener(pg, "mouseover", () => pg.setOptions({ strokeWeight: 2.5, strokeColor: "#16201D" }));
        k.maps.event.addListener(pg, "mouseout", () => pg.setOptions({ strokeWeight: 1, strokeColor: "#ffffff" }));
        return { key, pg };
      }));
    }
    if (!L.outline.length && outlineSrc) {
      L.outline = outlineSrc.flatMap((r) => polysOf(r.geometry).map((poly) => new k.maps.Polyline({ map, path: poly[0].map(([x, y]) => new k.maps.LatLng(y, x)), strokeWeight: 2, strokeColor: "#16201D", strokeOpacity: 0.55 })));
    }
    Object.entries(L.polys).forEach(([lv, list]) => list.forEach(({ key, pg }) => {
      if (lv !== regionLevel) return pg.setMap(null);
      const v = valueOf(lv, key), far = regionTooFar(ins?.[lv]?.[key]);
      pg.setOptions({ fillColor: far ? "#C9D0CD" : v == null || !scale ? "#EEF2F1" : scale.color(v), fillOpacity: eff === "apt" ? 0.18 : far ? 0.45 : v == null ? 0.25 : 0.55 });
      pg.setMap(map);
    }));
  }, [ready, ins, regionLevel, scale, period, metricId, scen, eff, maxMin, scope, mSgg, mHd, data.seoul_geo, data.dong_geo, data.hdong_geo]);

  // ---- region tags and apartment pins: rebuilt after every move/zoom ----
  useEffect(() => {
    if (!ready || !ins) return;
    const k = kRef.current, map = mapRef.current, L = layers.current, proj = map.getProjection(), bounds = map.getBounds();
    L.tags.forEach((o) => o.setMap(null)); L.tags = [];
    L.pins.forEach((o) => o.setMap(null)); L.pins = [];
    const placed = [], fits = (bx) => placed.every((p) => bx.x1 < p.x0 || bx.x0 > p.x1 || bx.y1 < p.y0 || bx.y0 > p.y1);
    if (eff !== "apt") {
      Object.entries(ins[regionLevel] || {}).filter(([, r]) => r.center && (r[period]?.n || 0) >= 3 && !regionTooFar(r)).sort((a, b) => (b[1][period]?.n || 0) - (a[1][period]?.n || 0)).forEach(([key, r]) => {
        const ll = new k.maps.LatLng(r.center[1], r.center[0]);
        if (!bounds.contain(ll)) return;
        const pt = proj.containerPointFromCoords(ll), bx = { x0: pt.x - 40, x1: pt.x + 40, y0: pt.y - 24, y1: pt.y + 24 };
        if (!fits(bx)) return;
        placed.push(bx);
        const v = m.get(r, period, scen), fill = v == null || !scale ? "#ffffff" : scale.color(v), dk = lum(fill) < 0.55, c = r[period]?.chg, on = selRegion?.key === key;
        const big = m.id === "chg" || m.id === "vol" ? (v == null ? "—" : `${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(1)}%`) : m.f(v);
        const sub = m.id === "chg" ? `평당 ${won(r[period]?.ppp)}` : c == null ? "" : `${c > 0 ? "▲" : "▼"}${Math.abs(c).toFixed(1)}%`;
        const node = el(`<div style="font-size:11px;font-weight:600">${esc(r.name.length > 6 ? r.name.slice(0, 6) : r.name)}</div><div style="font-size:13px;font-weight:800">${esc(big)}</div><div style="font-size:9.5px;opacity:.85">${esc(sub)}</div>`,
          { background: fill, color: dk ? "#fff" : "#16201D", borderRadius: "14px", padding: "4px 10px", textAlign: "center", lineHeight: "1.25", boxShadow: "0 1px 4px rgba(0,0,0,.18)", border: on ? "2.5px solid #16201D" : "1px solid rgba(0,0,0,.12)", cursor: "pointer", fontFamily: "Noto Sans KR, sans-serif", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
          () => handlers.current.pickRegion(regionLevel, key));
        L.tags.push(new k.maps.CustomOverlay({ map, position: ll, content: node, yAnchor: 0.5, xAnchor: 0.5, zIndex: 3 }));
      });
    }
    if (showPins) {
      // recent sales first, then older (stale) sales, then complexes with no sale in two years
      const rank = (a) => (a.trades_6m ? 2e6 + a.trades_6m : a.stale ? 1e6 + (a.trades_24m || 0) : 0);
      const vis = apts.filter((a) => (showQuiet || a.trades_6m) && areaOk(a.median_area_sqm, area) && ageOk(a.build_year, age) && !tooFar(a.hcode)).map((a) => ({ a, ll: new k.maps.LatLng(a.lat, a.lon) })).filter((x) => bounds.contain(x.ll)).sort((x, y) => rank(y.a) - rank(x.a)).slice(0, 700);
      let labels = 0;
      vis.forEach(({ a, ll }) => {
        const quiet = !a.trades_6m, none = a.median_price_10k == null;
        const f = fitOf(a.median_price_10k), txt = none ? "" : won(a.median_price_10k) + (a.stale && a.last_trade ? ` · ${a.last_trade.slice(2, 7).replace("-", ".")}` : ""), pt = proj.containerPointFromCoords(ll), w = txt.length * 7 + 16;
        const bx = { x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y - 30, y1: pt.y };
        const label = !none && labels < 150 && fits(bx), on = a.id === sel;
        if (label) { placed.push(bx); labels++; }
        const fill = quiet ? "#F1F3F2" : f === "over" ? "#ffffff" : fitColor[f];
        const node = label
          ? el(`<div style="padding:2px 8px;border-radius:8px;font-size:${quiet ? 11 : 12}px;font-weight:${quiet ? 500 : 700}">${esc(txt)}</div><div style="width:0;height:0;margin:0 auto;border:6px solid transparent;border-top-color:${quiet ? "#c3cbc8" : fill};border-bottom:0"></div>`,
            { color: quiet ? "#6b7773" : f === "over" ? "#16201D" : "#fff", cursor: "pointer", fontFamily: "Noto Sans KR, sans-serif", fontVariantNumeric: "tabular-nums", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.2))" }, () => handlers.current.pickApt(a))
          : el("", { width: none ? "7px" : "9px", height: none ? "7px" : "9px", borderRadius: "50%", background: none ? "#ffffff" : quiet ? "#c3cbc8" : fitColor[f], border: none ? "1.5px solid #9aa5a1" : "1.5px solid #fff", cursor: "pointer", boxShadow: "0 0 2px rgba(0,0,0,.3)" }, () => handlers.current.pickApt(a));
        if (label) { node.firstChild.style.background = fill; node.firstChild.style.border = on ? "2px solid #16201D" : quiet ? "1px dashed #b5c0bc" : f === "over" ? "1px solid #b5c0bc" : "none"; node.title = a.stale ? `${a.apt} · 최근 6개월 거래 없음 (마지막 ${a.last_trade})` : a.apt; }
        if (!label) node.title = none ? `${a.apt} · 최근 2년 실거래 없음` : a.apt;
        L.pins.push(new k.maps.CustomOverlay({ map, position: ll, content: node, yAnchor: label ? 1 : 0.5, xAnchor: 0.5, zIndex: label ? 5 : 4 }));
      });
    }
  }, [ready, ins, view.tick, eff, regionLevel, period, metricId, scen, scale, showPins, budget, area, age, sel, selRegion, maxMin, apts, showQuiet]);

  // ---- redevelopment zones as circles at true size ----
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current, L = layers.current;
    if (!L.zones.length && zones.length) {
      L.zones = zones.map((z) => {
        const c = new k.maps.Circle({ center: new k.maps.LatLng(z.lat, z.lon), radius: Math.max(40, Math.sqrt((z.area_m2 || 20000) / Math.PI)), strokeWeight: 1.5, strokeColor: STAGE_COLOR[z.stage], strokeOpacity: 0.9, strokeStyle: z.geo === "dong" ? "dash" : "solid", fillColor: STAGE_COLOR[z.stage], fillOpacity: 0.3 });
        k.maps.event.addListener(c, "click", () => { handlers.current.setSelZone(z.id); handlers.current.setSel(null); });
        return { z, c };
      });
    }
    L.zones.forEach(({ z, c }) => c.setMap(showRedev && stageOk(z.stage, stageGroup) ? map : null));
  }, [ready, showRedev, stageGroup, zones]);

  // ---- subway lines, 지적편집도 overlay, 광화문 marker ----
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current, L = layers.current;
    if (!L.lines.length && data.subway_lines) L.lines = data.subway_lines.map((s) => new k.maps.Polyline({ path: s.coords.map(([x, y]) => new k.maps.LatLng(y, x)), strokeWeight: 4, strokeColor: LINE_COLOR[s.line] || "#888", strokeOpacity: 0.85 }));
    L.lines.forEach((l) => l.setMap(showLines ? map : null));
  }, [ready, showLines, data.subway_lines]);
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current;
    if (showDistrict) map.addOverlayMapTypeId(k.maps.MapTypeId.USE_DISTRICT); else map.removeOverlayMapTypeId(k.maps.MapTypeId.USE_DISTRICT);
  }, [ready, showDistrict]);
  useEffect(() => {
    if (!ready || layers.current.refs.length) return;
    const k = kRef.current, map = mapRef.current;
    layers.current.refs = REF.map((r) => new k.maps.CustomOverlay({ map, position: new k.maps.LatLng(r.lat, r.lon), zIndex: 6, yAnchor: 0.5,
      content: el(`<div style="width:14px;height:14px;background:#16201D;transform:rotate(45deg);border:2px solid #fff;margin:0 auto"></div><div style="margin-top:4px;font-size:11px;font-weight:700;color:#16201D;text-shadow:0 0 3px #fff,0 0 3px #fff">${esc(r.n)}</div>`, { textAlign: "center", pointerEvents: "none", fontFamily: "Noto Sans KR, sans-serif" }) }));
  }, [ready]);

  const selApt = sel ? (data.apts || []).find((a) => a.id === sel) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
        <div className="rounded-large bg-content1 p-4 shadow-small">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-small font-semibold">내 예산</span>
            <ButtonGroup size="sm" radius="full">
              <Button color={scen === "now" ? "primary" : "default"} variant={scen === "now" ? "solid" : "flat"} onPress={() => setScen("now")}>{now?.label || "지금"}</Button>
              <Button color={scen === "later" ? "primary" : "default"} variant={scen === "later" ? "solid" : "flat"} onPress={() => setScen("later")}>{later?.label || "나중에"}</Button>
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
          <ButtonGroup size="sm" radius="full" variant="flat">{S.levels.map(([k, l]) => <Button key={k} color={level === k ? "primary" : "default"} variant={level === k ? "solid" : "flat"} onPress={() => setLevel(k)}>{l}</Button>)}</ButtonGroup>
          <Divider orientation="vertical" className="h-6" />
          <ButtonGroup size="sm" radius="full">{PERIODS.map(([k, l]) => <Button key={k} color={period === k ? "primary" : "default"} variant={period === k ? "solid" : "flat"} onPress={() => setPeriod(k)}>{l}</Button>)}</ButtonGroup>
          <Divider orientation="vertical" className="h-6" />
          <div className="flex flex-wrap gap-1">{METRICS.filter((x) => x.id !== "commute" || Object.keys(data.commute || {}).length).map((x) => <Chip key={x.id} size="sm" variant={metricId === x.id ? "solid" : "flat"} color={metricId === x.id ? "primary" : "default"} className="cursor-pointer" onClick={() => setMetricId(x.id)}>{x.l}</Chip>)}</div>
          <span className="ml-auto text-tiny text-default-500">지금 보는 단위: <b>{LEVEL_NAME[eff]}</b> · {PERIOD_NOTE[period]}</span>
        </div>
        <div className="relative h-[62vh] min-h-[440px] overflow-hidden rounded-large shadow-small lg:h-[calc(100vh-230px)] lg:min-h-[560px]">
          <div ref={boxRef} className="absolute inset-0" />
          {!ready && <Skeleton className="absolute inset-0 rounded-large" />}
          <div className="pointer-events-none absolute left-3 top-3 z-10">
            <div className="pointer-events-auto max-w-[230px] rounded-medium bg-content1/95 px-3 py-2 text-tiny shadow-small backdrop-blur">
              <button type="button" className="flex w-full items-center justify-between gap-3 font-semibold" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen}>
                <span>{m.l} · {PERIODS.find((p) => p[0] === period)[1]}</span><span className="text-default-400">{legendOpen ? "접기 ▴" : "범례 ▾"}</span>
              </button>
              {legendOpen && (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {scale && <div className="flex items-center gap-2 num"><span>{m.f(scale.lo)}</span><span className="h-2 flex-1 rounded-full" style={{ background: m.div ? `linear-gradient(90deg,${DOWN},#EEF2F1,${UP})` : `linear-gradient(90deg,#EEF2F1,${m.id === "jeonse" ? "#C77A12" : "#0B7A64"})` }} /><span>{m.f(scale.hi)}</span></div>}
                  {m.div && <span className="text-default-500">빨강 = 상승, 파랑 = 하락</span>}
                  {showPins && ["ok", "near", "over"].map((f) => <span key={f} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-default-300" style={{ background: fitColor[f] }} />{fitText[f]}</span>)}
                  {showPins && showQuiet && <><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#c3cbc8" }} />최근 6개월 거래 없음 (마지막 거래가)</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-[1.5px] border-default-400 bg-white" />최근 2년 거래 없음</span></>}
                  <Switch size="sm" isSelected={showQuiet} onValueChange={setShowQuiet}>거래 없는 단지도 보기</Switch>
                  <Switch size="sm" isSelected={showLines} onValueChange={setShowLines}>지하철 노선 강조</Switch>
                  <Switch size="sm" isSelected={showRedev} onValueChange={setShowRedev}>재개발·정비구역</Switch>
                  {showRedev && <div className="flex flex-wrap gap-1">{STAGE_GROUPS.map(([k, l]) => <Chip key={k} size="sm" variant={stageGroup === k ? "solid" : "flat"} className="cursor-pointer" onClick={() => setStageGroup(k)}>{l}</Chip>)}</div>}
                  {showRedev && STAGES.slice(0, 6).map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-[10px]"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: STAGE_COLOR[s] + "70", borderColor: STAGE_COLOR[s] }} />{s}</span>)}
                  <Switch size="sm" isSelected={showDistrict} onValueChange={setShowDistrict}>지적편집도 (용도지역)</Switch>
                  <Divider className="my-0.5" />
                  <Switch size="sm" isSelected={maxMin > 0} onValueChange={(v) => setMaxMin(v ? 50 : 0)} isDisabled={!Object.keys(commute).length}>광화문 통근시간으로 거르기</Switch>
                  {maxMin > 0 && <Slider aria-label="최대 통근시간" size="sm" step={5} minValue={20} maxValue={120} value={maxMin} onChange={setMaxMin} label={`${maxMin}분 이내`} classNames={{ label: "text-tiny", value: "text-tiny" }} />}
                  {!Object.keys(commute).length && <span className="text-[10px] text-default-400">ODsay 키를 넣으면 대중교통 시간이 채워집니다</span>}
                </div>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-content1/95 px-3 py-1 text-tiny text-default-600 shadow-small">
            {eff === "apt" ? "가격표를 누르면 실거래 내역이 열립니다" : `${LEVEL_NAME[eff]}을 누르면 지역 분석이 열립니다 · 확대하면 단지 가격표가 보입니다`}
          </div>
        </div>
      </section>
    </div>
  );
}
