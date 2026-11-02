"use client";
import { useMemo, useState } from "react";
import { Input } from "@heroui/react";
import { won } from "./lib.js";

const LV = { gu: "구", sgg: "시군구", bdong: "법정동", hdong: "행정동" };
const norm = (s) => (s || "").replace(/\s|아파트|\(.*?\)/g, "").toLowerCase();

// 동네·아파트 검색: regions of the current map scope first, then complexes; picking one moves the map there.
export default function SearchBox({ ins, apts, onRegion, onApt }) {
  const [q, setQ] = useState(""), [open, setOpen] = useState(false);
  const index = useMemo(() => {
    const regions = [];
    Object.entries(LV).forEach(([lv, label]) => Object.entries(ins?.[lv] || {}).forEach(([key, r]) => {
      const name = lv === "gu" || lv === "sgg" ? r.name : `${(r.gu || "").replace(/구$/, "")} ${r.name}`;
      regions.push({ kind: "region", lv, key, name: r.name, full: name, label, n: r.p6?.n || 0, k: norm(r.name) });
    }));
    const complexes = (apts || []).filter((a) => a.lon != null).map((a) => ({ kind: "apt", a, k: norm(a.apt), d: norm(a.dong) }));
    return { regions, complexes };
  }, [ins, apts]);
  const hits = useMemo(() => {
    const t = norm(q);
    if (!t) return [];
    const rs = index.regions.filter((r) => r.k.includes(t)).sort((a, b) => (b.k.startsWith(t) - a.k.startsWith(t)) || b.n - a.n).slice(0, 4);
    const as = index.complexes.filter((c) => c.k.includes(t) || (t.length >= 2 && c.d === t))
      .sort((a, b) => (b.k.startsWith(t) - a.k.startsWith(t)) || (b.a.trades_6m || 0) - (a.a.trades_6m || 0)).slice(0, 8 - rs.length);
    return [...rs, ...as];
  }, [q, index]);
  const pick = (h) => {
    if (!h) return;
    if (h.kind === "region") onRegion(h.lv, h.key); else onApt(h.a);
    setQ(""); setOpen(false);
  };
  return (
    <div className="relative">
      <Input size="sm" aria-label="동네·아파트 검색" placeholder="동네·아파트 검색 (예: 목동, 은마, 중계동)" value={q} isClearable
        onValueChange={(v) => { setQ(v); setOpen(true); }} onClear={() => setQ("")} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Enter") pick(hits[0]); if (e.key === "Escape") setOpen(false); }}
        startContent={<span className="text-default-400" aria-hidden="true">⌕</span>} />
      {open && q.trim() && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-medium bg-content1 py-1 shadow-large">
          {hits.length === 0 ? <li className="px-3 py-2 text-tiny text-default-500">검색 결과가 없습니다. 지금 지도 범위(서울 / 서울+경기)에서 찾습니다.</li> : hits.map((h, i) => (
            <li key={h.kind === "region" ? `${h.lv}:${h.key}` : h.a.id}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-small hover:bg-default-100 ${i === 0 ? "bg-default-50" : ""}`}>
                {h.kind === "region"
                  ? <><span className="min-w-0 truncate"><b>{h.full}</b></span><span className="shrink-0 text-tiny text-default-400">{h.label}</span></>
                  : <><span className="min-w-0 truncate"><b>{h.a.apt}</b> <span className="text-tiny text-default-400">{h.a.gu} {h.a.dong}</span></span>
                      <span className="shrink-0 text-tiny text-default-500 num">{h.a.median_price_10k ? won(h.a.median_price_10k) : h.a.no_trade ? "거래 없음" : ""}</span></>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
