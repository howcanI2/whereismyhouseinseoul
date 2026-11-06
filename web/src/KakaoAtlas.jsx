"use client";
import TossBanner from "./TossBanner.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonGroup, Chip, Divider, Skeleton, Slider, Switch } from "@heroui/react";
import { estCommute, kmTo, attachCommute, attachGrowth, attachRegions, regionFilesOf, CAP_SVG, dday, fitState, SCHOOL_COLOR, shortSchool, pendingFocus, futureState, palette, shareBelow, useIsDark, useLazyFile, won } from "./lib.js";
import SearchBox from "./Search.jsx";
import { AGES, ageOk, AptDetail, AREAS, areaOk, LINE_COLOR, refOf, STAGE_COLOR, STAGE_GROUPS, STAGES, stageOk, ZoneDetail } from "./Explorer.jsx";
import { AptVerdict, CommuteFilter, DOWN, GrowthPick, HIT, HitLegend, LEVEL_NAME, LEVELS, lum, MetricNote, METRICS, mixc, Overview, PERIOD_NOTE, PERIODS, RegionPanel, RoomAgePick, roomState, SchoolKindPick, SIG, UP, useAptJudge } from "./Atlas.jsx";

// Load the Kakao Maps SDK once; resolves with window.kakao or rejects (bad key, unregistered domain, offline).
let sdk;
function loadKakao(appKey) {
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    if (window.kakao?.maps) return window.kakao.maps.load(() => resolve(window.kakao));
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=services`;
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
const TONE = { amber: "#C77A12", rose: "#C2410C", indigo: "#4F63C9" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default function KakaoAtlas({ data: base, appKey, onFail, scope = "seoul", mine = false }) {
  const S = SCOPES[scope], metro = scope === "metro";
  const mIns = useLazyFile("metro_insights", metro), mApts = useLazyFile("metro_apts", metro), mHd = useLazyFile("metro_hdong_geo", metro), mSgg = useLazyFile("metro_sgg_geo", metro);
  // one data object per scope; the panels read insights/apts from it
  const data = useMemo(() => (metro ? { ...base, insights: attachRegions(attachGrowth(attachCommute(mIns, mApts, base.commute, base.work)), regionFilesOf(base)), apts: mApts, scope } : { ...base, insights: attachRegions(attachGrowth(attachCommute(base.insights, base.apts, base.commute, base.work)), regionFilesOf(base)), scope }), [metro, base, mIns, mApts, base.landuse_region, base.school_region, base.edu_region, base.apt_cost, base.work]);
  const [maxMin, setMaxMin] = useState(0);
  const [onlyHit, setOnlyHit] = useState(false);  // yes/no metrics: hide the complexes it does not count
  const [showQuiet, setShowQuiet] = useState(true);
  const dark = useIsDark(), P = palette(dark);
  const later = data.budget?.find((b) => b.scenario === "later"), now = data.budget?.find((b) => b.scenario === "now");
  const [scen, setScen] = useState("later");
  const [budget, setBudget] = useState(100000);
  const [level, setLevel] = useState("auto");
  const [period, setPeriod] = useState("p6");
  // once the viewer has entered their own 조건, the map opens on "내 예산 이하 거래" instead of 가격 변화 (until they pick another)
  const [metricId, setMetricIdRaw] = useState(mine ? "fit" : "chg");
  const picked = useRef(false), setMetricId = (id) => { picked.current = true; setMetricIdRaw(id); };
  useEffect(() => { if (mine && !picked.current) setMetricIdRaw("fit"); }, [mine]);
  const [growth, setGrowth] = useState("half");
  const [roomAge, setRoomAge] = useState(25);
  const [area, setArea] = useState("all");
  const [age, setAge] = useState("all");
  const [sel, setSel] = useState(null);
  const [selRegion, setSelRegion] = useState(null);
  const [selZone, setSelZone] = useState(null);
  const tS = useLazyFile("trades", !!sel), tG = useLazyFile("trades_gg", !!sel && metro);
  const trades = useMemo(() => (tS || tG ? { ...(tS || {}), ...(tG || {}) } : null), [tS, tG]);
  const [showLines, setShowLines] = useState(false);
  const [showRedev, setShowRedev] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [showSchools, setShowSchools] = useState(true);
  const [schoolKinds, setSchoolKinds] = useState({ e: true, m: true });  // 초등학교 / 중학교 each on or off
  const [focusApplyId, setFocusApplyId] = useState(null);
  const ah = useLazyFile("applyhome", showApply);
  const [stageGroup, setStageGroup] = useState("all");
  const [legendOpen, setLegendOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);  // folded on phones so the map shows
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ kz: 8, tick: 0 });
  const boxRef = useRef(null), mapRef = useRef(null), kRef = useRef(null);
  const layers = useRef({ polys: {}, outline: [], tags: [], pins: [], zones: [], lines: [], refs: [], apply: [], schools: [] });
  const handlers = useRef({});
  const m = METRICS.find((x) => x.id === metricId);
  roomState.age = roomAge;
  const judge = useAptJudge(m, roomAge);
  fitState.budget = budget;
  Object.assign(futureState, { growth, years: later?.years || 3, budget: later?.max_price_10k ?? budget, label: later?.label });
  const ins = data.insights;

  useEffect(() => { if (later && now) setBudget(scen === "later" ? later.max_price_10k : now.max_price_10k); }, [scen, later, now]);

  // ---- map instance ----
  useEffect(() => {
    let dead = false;
    loadKakao(appKey).then((kakao) => {
      if (dead || !boxRef.current) return;
      kRef.current = kakao;
      const map = new kakao.maps.Map(boxRef.current, { center: new kakao.maps.LatLng(S.center[1], S.center[0]), level: S.kz });
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
  const commute = base.commute || {}, work = base.work || {};
  // ODsay transit times exist only for 광화문; other workplaces use the distance estimate
  const odsay = work.name === "광화문" && Object.keys(commute).length > 0;
  const rideMin = (a) => (odsay ? commute[a.hcode]?.min : estCommute(kmTo(a, work)));
  const tooFar = (a) => maxMin > 0 && (rideMin(a) ?? 999) > maxMin;
  const regionTooFar = (r) => maxMin > 0 && (r?.commute == null || r.commute > maxMin);
  const showPins = eff === "apt" || (level !== "auto" && kz <= 4);
  const school = useLazyFile("school", showSchools && (showPins || !!sel));  // 1.2MB: only once zoomed to 단지 level or a complex is open
  const fitOf = (v) => (v == null ? "none" : v <= budget ? "ok" : v <= budget * 1.15 ? "near" : "over");
  const fitColor = { ok: P.primary, near: P.amber, over: "#9AA5A1", none: "#9AA5A1" };
  const fitText = { ok: "예산 안", near: "조금 넘음 (15% 이내)", over: "예산 초과" };
  const apts = useMemo(() => (data.apts || []).filter((a) => a.lon != null), [data.apts]);
  const okCount = useMemo(() => {
    const c = { gu: {}, bdong: {}, hdong: {}, sgg: {} };
    apts.forEach((a) => {
      if (!a.trades_6m || a.median_price_10k == null || a.median_price_10k > budget || !areaOk(a.median_area_sqm, area) || !ageOk(a.build_year, age)) return;
      const add = (lv, k) => { if (k) c[lv][k] = (c[lv][k] || 0) + 1; };
      add("gu", a.gu); add("bdong", a.gu && a.dong ? `${a.gu} ${a.dong}` : null); add("hdong", a.hcode); add("sgg", a.sgg || a.gu);
    });
    return c;
  }, [apts, budget, area, age]);
  const zones = useMemo(() => (data.redev || []).filter((r) => r.lon != null && r.stage !== "준공"), [data.redev]);

  const flyTo = (lon, lat, kzTarget) => {
    const k = kRef.current, map = mapRef.current; if (!map) return;
    const ll = new k.maps.LatLng(lat, lon);
    // zoom and centre in one step: an animated zoom with a pan on top can end without an idle event, leaving the map blank
    if (map.getLevel() > kzTarget) map.setLevel(kzTarget);
    map.setCenter(ll);
    setView((v) => ({ kz: map.getLevel(), tick: v.tick + 1 }));
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
    const base = TONE[m.tone] || "#0B7A64";
    return { lo, hi, color: (v) => { const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return mixc(base0, base, m.inv ? 1 - t : t); } };
  }, [ins, regionLevel, period, metricId, scen, budget, growth, roomAge]);
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
        const pt = proj.containerPointFromCoords(ll), bx = { x0: pt.x - 40, x1: pt.x + 40, y0: pt.y - 24, y1: pt.y + (mine ? 32 : 24) };
        if (!fits(bx)) return;
        placed.push(bx);
        const v = m.get(r, period, scen), fill = v == null || !scale ? "#ffffff" : scale.color(v), dk = lum(fill) < 0.55, c = r[period]?.chg, on = selRegion?.key === key;
        const big = m.id === "chg" || m.id === "vol" ? (v == null ? "—" : `${v > 0 ? "▲" : v < 0 ? "▼" : ""}${Math.abs(v).toFixed(1)}%`) : m.f(v);
        const sub = m.id === "chg" ? `평당 ${won(r[period]?.ppp)}` : c == null ? "" : `${c > 0 ? "▲" : "▼"}${Math.abs(c).toFixed(1)}%`;
        const nOk = mine ? okCount[regionLevel]?.[key] || 0 : 0;
        const badge = nOk ? `<div style="margin:3px auto 0;width:fit-content;background:#0B7A64;color:#fff;border-radius:999px;padding:0 6px;font-size:9.5px;font-weight:700">● 내 예산 ${nOk}곳</div>` : "";
        const node = el(`<div style="font-size:11px;font-weight:600">${esc(r.name.length > 6 ? r.name.slice(0, 6) : r.name)}</div><div style="font-size:13px;font-weight:800">${esc(big)}</div><div style="font-size:9.5px;opacity:.85">${esc(sub)}</div>${badge}`,
          { background: fill, color: dk ? "#fff" : "#16201D", borderRadius: "14px", padding: "4px 10px", textAlign: "center", lineHeight: "1.25", boxShadow: "0 1px 4px rgba(0,0,0,.18)", border: on ? "2.5px solid #16201D" : "1px solid rgba(0,0,0,.12)", cursor: "pointer", fontFamily: "Noto Sans KR, sans-serif", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
          () => handlers.current.pickRegion(regionLevel, key));
        L.tags.push(new k.maps.CustomOverlay({ map, position: ll, content: node, yAnchor: 0.5, xAnchor: 0.5, zIndex: 3 }));
      });
    }
    if (showPins) {
      // recent sales first, then older (stale) sales, then complexes with no sale in two years
      const hitOf = (a) => (judge ? !!judge(a)?.on : null);
      const rank = (a) => (hitOf(a) ? 3e6 : 0) + (a.trades_6m ? 2e6 + a.trades_6m : a.stale ? 1e6 + (a.trades_24m || 0) : 0);  // counted complexes get labels first
      const vis = apts.filter((a) => (showQuiet || a.trades_6m) && areaOk(a.median_area_sqm, area) && ageOk(a.build_year, age) && !tooFar(a) && !(onlyHit && hitOf(a) === false)).map((a) => ({ a, ll: new k.maps.LatLng(a.lat, a.lon) })).filter((x) => bounds.contain(x.ll)).sort((x, y) => rank(y.a) - rank(x.a)).slice(0, 700);
      let labels = 0;
      vis.forEach(({ a, ll }) => {
        const quiet = !a.trades_6m, none = a.median_price_10k == null, hit = hitOf(a);
        const f = fitOf(a.median_price_10k), txt = none ? "" : (hit ? "✓" : "") + (SIG[a.sig]?.[0] || "") + won(a.median_price_10k) + (a.stale && a.last_trade ? ` · ${a.last_trade.slice(2, 7).replace("-", ".")}` : ""), pt = proj.containerPointFromCoords(ll), w = txt.length * 7 + 16;
        const bx = { x0: pt.x - w / 2, x1: pt.x + w / 2, y0: pt.y - 30, y1: pt.y };
        const label = !none && labels < 150 && fits(bx), on = a.id === sel;
        if (label) { placed.push(bx); labels++; }
        const fill = quiet ? "#F1F3F2" : f === "over" ? "#ffffff" : fitColor[f];
        const node = label
          ? el(`<div style="padding:2px 8px;border-radius:8px;font-size:${quiet ? 11 : 12}px;font-weight:${quiet ? 500 : 700}">${esc(txt)}</div><div style="width:0;height:0;margin:0 auto;border:6px solid transparent;border-top-color:${quiet ? "#c3cbc8" : fill};border-bottom:0"></div>`,
            { color: quiet ? "#6b7773" : f === "over" ? "#16201D" : "#fff", cursor: "pointer", fontFamily: "Noto Sans KR, sans-serif", fontVariantNumeric: "tabular-nums", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.2))" }, () => handlers.current.pickApt(a))
          : el("", { width: hit ? "11px" : none ? "7px" : "9px", height: hit ? "11px" : none ? "7px" : "9px", borderRadius: "50%", background: none ? "#ffffff" : quiet ? "#c3cbc8" : fitColor[f], border: hit ? `2.5px solid ${HIT}` : none ? "1.5px solid #9aa5a1" : "1.5px solid #fff", cursor: "pointer", boxShadow: "0 0 2px rgba(0,0,0,.3)" }, () => handlers.current.pickApt(a));
        if (hit === false && !on) node.style.opacity = "0.35";
        if (label) { node.firstChild.style.background = fill; node.firstChild.style.border = on ? "3px solid #E5484D" : hit ? `2.5px solid ${HIT}` : quiet ? "1px dashed #b5c0bc" : f === "over" ? "1px solid #b5c0bc" : "none"; node.title = a.stale ? `${a.apt} · 최근 6개월 거래 없음 (마지막 ${a.last_trade})` : a.apt; }
        if (!label) node.title = none ? `${a.apt} · 최근 2년 실거래 없음` : a.apt;
        // the selected pin grows and gets a red outline; the other pins stay as they are
        if (on) { node.style.transform = "scale(1.3)"; node.style.transformOrigin = label ? "50% 100%" : "50% 50%"; }
        L.pins.push(new k.maps.CustomOverlay({ map, position: ll, content: node, yAnchor: label ? 1 : 0.5, xAnchor: 0.5, zIndex: on ? 10 : label ? 5 : 4 }));
      });
    }
  }, [ready, ins, view.tick, eff, regionLevel, period, metricId, scen, scale, showPins, budget, area, age, sel, selRegion, maxMin, apts, showQuiet, judge, onlyHit, mine, okCount]);

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

  // ---- subway lines, workplace marker ----
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current, L = layers.current;
    if (!L.lines.length && data.subway_lines) L.lines = data.subway_lines.map((s) => new k.maps.Polyline({ path: s.coords.map(([x, y]) => new k.maps.LatLng(y, x)), strokeWeight: 4, strokeColor: LINE_COLOR[s.line] || "#888", strokeOpacity: 0.85 }));
    L.lines.forEach((l) => l.setMap(showLines ? map : null));
  }, [ready, showLines, data.subway_lines]);
  // ---- the selected complex: a ring and its name, shown whatever the pin filters ----
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current, L = layers.current;
    L.selRing?.setMap(null); L.selRing = null;
    const a = sel ? apts.find((x) => x.id === sel) : null;
    if (!a) return;
    const node = el(`<div class="hb-pulse" style="width:22px;height:22px;margin:0 auto;border-radius:50%;border:3px solid #E5484D;background:rgba(229,72,77,.15)"></div><div style="margin-top:2px;display:inline-block;padding:2px 8px;border-radius:999px;background:#E5484D;font-size:12px;font-weight:800;color:#fff;white-space:nowrap">${esc(a.apt)}</div>`,
      { textAlign: "center", pointerEvents: "none", fontFamily: "Noto Sans KR, sans-serif" });
    L.selRing = new k.maps.CustomOverlay({ map, position: new k.maps.LatLng(a.lat, a.lon), content: node, yAnchor: 0.25, zIndex: 9 });
  }, [ready, sel, apts]);

  // ---- 학교 (초·중): icons from 동 level down; the selected complex's 배정 초등학교 is ringed and always named ----
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current, L = layers.current;
    L.schools.forEach((o) => o.setMap(null)); L.schools = [];
    if (!showSchools || !school?.schools || kz > 5) return;
    const bounds = map.getBounds(), mine = sel ? school.apts?.[sel]?.[0] : null;
    Object.entries(school.schools).forEach(([id, s]) => {
      if (!schoolKinds[s[1]] && id !== mine) return;  // the open complex's 배정 초등학교 stays
      const ll = new k.maps.LatLng(s[3], s[2]), on = id === mine;
      if (!on && !bounds.contain(ll)) return;
      const c = SCHOOL_COLOR[s[1]], d = on ? 26 : 20, label = on || kz <= 3;
      const node = el(`<div style="width:${d}px;height:${d}px;margin:0 auto;border-radius:6px;background:${c};display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 0 0 ${on ? 3 : 0}px ${c}66,0 1px 3px rgba(0,0,0,.35)">${CAP_SVG(on ? 15 : 12)}</div>`
        + (label ? `<div style="margin-top:2px;font-size:${on ? 12 : 10.5}px;font-weight:${on ? 800 : 600};color:${c};white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff">${esc(shortSchool(s[0]))}${on ? " · 배정" : ""}</div>` : ""),
        { textAlign: "center", fontFamily: "Noto Sans KR, sans-serif", pointerEvents: "none" });
      node.title = s[0];
      L.schools.push(new k.maps.CustomOverlay({ map, position: ll, content: node, yAnchor: label ? 0.3 : 0.5, zIndex: on ? 7 : 2 }));
    });
  }, [ready, view.tick, showSchools, school, sel, kz, schoolKinds]);

  useEffect(() => {
    const go = () => { const f = pendingFocus.region; if (!f || !ready || metro || !ins?.[f.lv]?.[f.key]) return; pendingFocus.region = null; setLegendOpen(false); handlers.current.pickRegion(f.lv, f.key); };
    go(); window.addEventListener("hb:focus-region", go); return () => window.removeEventListener("hb:focus-region", go);
  }, [ready, metro, ins]);
  // ---- 청약 접수 예정 단지 ----
  // opened from a 청약 row: turn the layer on, zoom to the site and label it
  useEffect(() => {
    const go = () => {
      const r = pendingFocus.apply; if (!r || !ready || (r.sido !== "11" && !metro)) return;
      pendingFocus.apply = null; setShowApply(true); setFocusApplyId(r.id); setLegendOpen(false);
      const k = kRef.current, map = mapRef.current, ll = new k.maps.LatLng(r.lat, r.lon); map.setLevel(4); map.setCenter(ll); setView((v) => ({ kz: map.getLevel(), tick: v.tick + 1 }));
    };
    go(); window.addEventListener("hb:focus-apply", go); return () => window.removeEventListener("hb:focus-apply", go);
  }, [ready, metro]);
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current, L = layers.current, td = new Date().toISOString().slice(0, 10);
    L.apply.forEach((o) => o.setMap(null)); L.apply = [];
    if (!showApply) return;
    (ah?.items || []).filter((r) => r.lon != null && (metro || r.sido === "11") && (r.receipt_end || r.notice) >= td).forEach((r) => {
      const on = r.id === focusApplyId, label = on ? `${r.name.replace(/\(.*/, "").trim()} · ${dday(r.special_from || r.receipt_start) || ""}${r.approx ? " · 대략 위치" : ""}` : dday(r.special_from || r.receipt_start) || "";
      const node = el(`<div style="font-size:${on ? 12.5 : 10.5}px;font-weight:700;color:#4F63C9;white-space:nowrap;${on ? "background:#fff;padding:2px 8px;border-radius:8px;border:2px solid #4F63C9;" : "text-shadow:0 0 3px #fff,0 0 3px #fff"}">${esc(label)}</div><div style="width:${on ? 16 : 12}px;height:${on ? 16 : 12}px;margin:2px auto 0;background:#4F63C9;border:2px solid #fff;border-radius:3px;box-shadow:0 0 2px rgba(0,0,0,.4)"></div>`,
        { textAlign: "center", cursor: "pointer", fontFamily: "Noto Sans KR, sans-serif" }, () => r.url && window.open(r.url, "_blank", "noopener"));
      node.title = `${r.name} · ${r.households}세대 · 특공 ${r.special_from || "—"} · 1순위 ${r.first_rank || r.receipt_start || "—"}${r.approx ? " · 위치는 동 중심(대략)" : ""}`;
      L.apply.push(new k.maps.CustomOverlay({ map, position: new k.maps.LatLng(r.lat, r.lon), content: node, yAnchor: 1, zIndex: on ? 8 : 6 }));
    });
  }, [ready, showApply, ah, metro, focusApplyId]);
  useEffect(() => {
    if (!ready) return;
    const k = kRef.current, map = mapRef.current;
    layers.current.refs.forEach((o) => o.setMap(null));
    layers.current.refs = refOf(work).map((r) => new k.maps.CustomOverlay({ map, position: new k.maps.LatLng(r.lat, r.lon), zIndex: 6, yAnchor: 0.5,
      content: el(`<div style="width:14px;height:14px;background:#16201D;transform:rotate(45deg);border:2px solid #fff;margin:0 auto"></div><div style="margin-top:4px;font-size:11px;font-weight:700;color:#16201D;text-shadow:0 0 3px #fff,0 0 3px #fff">${esc(r.n)}</div>`, { textAlign: "center", pointerEvents: "none", fontFamily: "Noto Sans KR, sans-serif" }) }));
  }, [ready, work.lon, work.lat, work.name]);

  const selApt = sel ? (data.apts || []).find((a) => a.id === sel) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
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
        <TossBanner />
        {selApt && <AptVerdict apt={selApt} m={m} judge={judge} />}
        {selApt ? <AptDetail apt={selApt} trades={trades} budget={budget} scen={scen} data={data} onClose={() => setSel(null)} P={P} fitOf={fitOf} fitText={fitText} fitColor={fitColor} />
          : selZone ? <ZoneDetail zone={zones.find((x) => x.id === selZone)} apts={apts} onClose={() => setSelZone(null)} P={P} budget={budget} />
          : selRegion && ins?.[selRegion.level]?.[selRegion.key] ? <RegionPanel lv={selRegion.level} rkey={selRegion.key} r={ins[selRegion.level][selRegion.key]} period={period} data={data} apts={apts} zones={zones} budget={budget} scen={scen} P={P} fitOf={fitOf} fitColor={fitColor} onClose={() => setSelRegion(null)} onApt={pickApt} m={m} judge={judge} />
          : <Overview data={data} ins={ins} period={period} level={regionLevel} m={m} scen={scen} onPick={(key) => pickRegion(regionLevel, key)} P={P} onApt={(id) => { const a = (data.apts || []).find((x) => x.id === id); if (a) pickApt(a); }} />}
      </aside>

      <section id="atlas-map" className="order-1 flex min-w-0 scroll-mt-2 flex-col gap-2 lg:order-2">
        <SearchBox ins={ins} apts={data.apts} onRegion={pickRegion} onApt={pickApt} />
        <div className="flex flex-wrap items-center gap-2 rounded-large bg-content1 px-3 py-2 shadow-small">
          <ButtonGroup size="sm" radius="full" variant="flat">{S.levels.map(([k, l]) => <Button key={k} color={level === k ? "primary" : "default"} variant={level === k ? "solid" : "flat"} onPress={() => setLevel(k)}>{l}</Button>)}</ButtonGroup>
          <Divider orientation="vertical" className="hidden h-6 sm:block" />
          <ButtonGroup size="sm" radius="full">{PERIODS.map(([k, l]) => <Button key={k} color={period === k ? "primary" : "default"} variant={period === k ? "solid" : "flat"} onPress={() => setPeriod(k)}>{l}</Button>)}</ButtonGroup>
          <Divider orientation="vertical" className="hidden h-6 sm:block" />
          <div className="-mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-0.5 lg:mx-0 lg:w-auto lg:flex-wrap lg:overflow-visible lg:px-0">{METRICS.map((x) => <Chip key={x.id} size="sm" variant={metricId === x.id ? "solid" : "flat"} color={metricId === x.id ? "primary" : "default"} className="shrink-0 cursor-pointer" onClick={() => setMetricId(x.id)}>{x.l}</Chip>)}</div>
          {m.id === "future" && <GrowthPick growth={growth} setGrowth={setGrowth} />}
          {m.id === "room" && <RoomAgePick roomAge={roomAge} setRoomAge={setRoomAge} />}
          <CommuteFilter name={work.name} odsay={odsay} maxMin={maxMin} setMaxMin={setMaxMin} />
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
              {mine && (
                <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-default-600">
                  {[[fitColor.ok, "", `내 예산(${won(budget)}) 내`], [fitColor.near, "", "15% 이내 초과"], ["#ffffff", "border border-default-400", "예산 초과"], ["#E3E8E6", "border border-default-300", "기간 내 거래 없음"]].map(([bg, cls, l]) => (
                    <li key={l} className="inline-flex items-center gap-1 whitespace-nowrap"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} style={{ background: bg }} />{l}</li>
                  ))}
                </ul>
              )}
              {legendOpen && (
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {scale && <div className="flex items-center gap-2 num"><span>{m.f(scale.lo)}</span><span className="h-2 flex-1 rounded-full" style={{ background: m.div ? `linear-gradient(90deg,${DOWN},#EEF2F1,${UP})` : `linear-gradient(90deg,#EEF2F1,${TONE[m.tone] || "#0B7A64"})` }} /><span>{m.f(scale.hi)}</span></div>}
                  {m.div && <span className="text-default-500">빨강 = 상승, 파랑 = 하락</span>}
                  <MetricNote m={m} />
                  {judge && <HitLegend m={m} onlyHit={onlyHit} setOnlyHit={setOnlyHit} pins={showPins} />}
                  {showPins && <span className="text-default-500">가격 앞 ▲ 최근 3개월 신고가 · ▼ 급매</span>}
                  {showPins && !mine && ["ok", "near", "over"].map((f) => <span key={f} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-default-300" style={{ background: fitColor[f] }} />{f === "ok" ? `내 예산(${won(budget)}) 안` : fitText[f]}</span>)}
                  {showPins && showQuiet && !mine && <><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#c3cbc8" }} />최근 6개월 거래 없음 (마지막 거래가)</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border-[1.5px] border-default-400 bg-white" />최근 2년 거래 없음</span></>}
                  <Switch size="sm" isSelected={showQuiet} onValueChange={setShowQuiet}>거래 없는 단지도 보기</Switch>
                  <Switch size="sm" isSelected={showLines} onValueChange={setShowLines}>지하철 노선 강조</Switch>
                  <Switch size="sm" isSelected={showRedev} onValueChange={setShowRedev}>재개발·정비구역</Switch>
                  <Switch size="sm" isSelected={showSchools} onValueChange={setShowSchools}>학교 (단지 단위로 확대하면)</Switch>
                  {showSchools && <SchoolKindPick kinds={schoolKinds} setKinds={setSchoolKinds} />}
                  <Switch size="sm" isSelected={showApply} onValueChange={setShowApply}>청약 접수 예정 단지</Switch>
                  {showApply && ah && !ah.items && <span className="text-[10px] text-default-400">청약 데이터가 아직 연결되지 않았습니다.</span>}
                  {showRedev && <div className="flex flex-wrap gap-1">{STAGE_GROUPS.map(([k, l]) => <Chip key={k} size="sm" variant={stageGroup === k ? "solid" : "flat"} className="cursor-pointer" onClick={() => setStageGroup(k)}>{l}</Chip>)}</div>}
                  {showRedev && STAGES.slice(0, 6).map((s) => <span key={s} className="inline-flex items-center gap-1.5 text-[10px]"><span className="h-2.5 w-2.5 rounded-full border" style={{ background: STAGE_COLOR[s] + "70", borderColor: STAGE_COLOR[s] }} />{s}</span>)}
                </div>
              )}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-content1/95 px-3 py-1 text-tiny text-default-600 shadow-small">
            {eff === "apt" ? "가격표를 누르면 실거래 내역이 열립니다" : mine ? "확대하면 내 예산 안 단지가 초록 핀으로 보입니다" : `${LEVEL_NAME[eff]}을 누르면 지역 분석이 열립니다 · 확대하면 단지 가격표가 보입니다`}
          </div>
        </div>
      </section>
    </div>
  );
}
