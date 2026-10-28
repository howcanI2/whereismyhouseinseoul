"use client";
import { useMemo, useState } from "react";
import { Button, Checkbox, Chip, Modal, ModalBody, ModalContent, ModalHeader, Skeleton } from "@heroui/react";
import { attachGrowth, fmt, growthMult, useLazyFile, useWatch, won } from "./lib.js";

const PY = 3.3058;

// 관심 단지: what each saved complex did since it was saved, and up to three side by side.
export default function WatchModal({ open, onClose, data }) {
  const [watch, , setWatch] = useWatch();
  const ids = Object.keys(watch);
  const gg = ids.some((id) => watch[id].sido === "41");
  const dS = useLazyFile("apt_detail", open), iS = useLazyFile("apt_info", open);
  const dG = useLazyFile("apt_detail_gg", open && gg), iG = useLazyFile("apt_info_gg", open && gg);
  const mApts = useLazyFile("metro_apts", open && gg), mIns = useLazyFile("metro_insights", open && gg);
  const [pick, setPick] = useState([]);
  const later = data.budget?.find((x) => x.scenario === "later"), yrs = later?.years || 3;
  const commuteEst = useMemo(() => Object.fromEntries((data.gu_summary || []).map((g) => [g.gu, g.commute_min_est])), [data.gu_summary]);

  const rows = useMemo(() => {
    if (!dS || !iS || (gg && (!dG || !iG || !mApts))) return null;
    const ins = attachGrowth(data.insights), mi = attachGrowth(mIns);
    const aptBy = Object.fromEntries([...(mApts || []), ...(data.apts || [])].map((a) => [a.id, a]));
    return ids.map((id) => {
      const w = watch[id], a = aptBy[id] || {}, isGG = w.sido === "41";
      const det = (isGG ? dG : dS)?.[id], info = (isGG ? iG : iS)?.[id];
      const ar = det?.areas?.length ? [...det.areas].sort((x, y) => Math.abs(x.a - w.area) - Math.abs(y.a - w.area))[0] : null;
      const now = ar ? ar.med ?? ar.last : w.price;
      const by = a.build_year || (info?.approval ? Number(info.approval.slice(0, 4)) : null);
      const reg = (isGG ? mi?.hdong : ins?.hdong)?.[a.hcode] || ins?.gu?.[w.gu] || mi?.sgg?.[a.sgg];
      const fut = now && reg?.g12 != null ? Math.round(now * growthMult(reg.g12, "half", yrs)) : null;
      const ride = data.commute?.[a.hcode]?.min;
      return { id, w, a, ar, info, now, by, fut, g12: reg?.g12, chg: now && w.price ? (now / w.price - 1) * 100 : null,
        ride: ride ?? commuteEst[w.gu] ?? null, rideEst: ride == null };
    });
  }, [watch, yrs, dS, iS, dG, iG, mApts, mIns, data.insights, data.apts, data.commute, commuteEst]);

  const remove = (id) => { const n = { ...watch }; delete n[id]; setWatch(n); setPick((p) => p.filter((x) => x !== id)); };
  const toggle = (id) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));
  const cmp = (rows || []).filter((r) => pick.includes(r.id));
  const B = later?.max_price_10k;
  const verdict = (f) => (f == null || !B ? null : B >= f ? ["살 수 있음", "success"] : B >= f * 0.9 ? ["빠듯", "warning"] : ["부족", "danger"]);
  const LINES = [
    ["저장 평형", (r) => `${r.ar?.a ?? r.w.area}㎡ (${Math.round((r.ar?.a ?? r.w.area) / PY)}평)`],
    ["지금 시세", (r) => <b>{won(r.now)}</b>],
    ["저장 후 변화", (r) => <span style={{ color: r.chg > 0 ? "#E5484D" : r.chg < 0 ? "#3E7BFA" : undefined }}>{fmt.pct(r.chg)}</span>],
    ["평당가", (r) => (r.now && r.ar ? won(Math.round((r.now / r.ar.a) * PY)) : "—")],
    ["최근 거래", (r) => (r.ar ? `${r.ar.last_date.slice(2)} · ${won(r.ar.last)}` : "—")],
    ["2년 최고가", (r) => (r.ar ? <>{won(r.ar.max)}{r.ar.high && <span style={{ color: "#E5484D" }}> ▲경신</span>}</> : "—")],
    ["전세가율", (r) => (r.ar?.jeonse_ratio ? `${r.ar.jeonse_ratio}%` : "—")],
    ["준공 · 재건축 연한", (r) => (r.by ? `${r.by}년 · ${r.by + 30 <= new Date().getFullYear() ? "도래" : `${r.by + 30}년`}` : "—")],
    ["세대수", (r) => (r.info?.households ? `${Number(r.info.households).toLocaleString()}세대` : "—")],
    ["광화문 통근", (r) => (r.ride == null ? "—" : `${r.ride}분${r.rideEst ? " (구 추정)" : ""}`)],
    [`${yrs}년 뒤 (절반 속도)`, (r) => { const v = verdict(r.fut); return r.fut ? <span>{won(r.fut)} {v && <Chip size="sm" variant="flat" color={v[1]} className="h-5 text-[10px]">{v[0]}</Chip>}</span> : "—"; }],
  ];

  return (
    <Modal isOpen={open} onOpenChange={(o) => !o && onClose()} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          관심 단지 {ids.length ? ids.length : ""}
          <span className="text-tiny font-normal text-default-500">이 브라우저에만 저장됩니다. 지도에서 단지를 열고 '☆ 관심'을 누르면 추가됩니다. 2~3곳을 체크하면 나란히 비교합니다.</span>
        </ModalHeader>
        <ModalBody className="pb-6">
          {ids.length === 0 ? <p className="text-small text-default-500">아직 저장한 단지가 없습니다.</p> : !rows ? <Skeleton className="h-40 rounded-large" /> : (
            <>
              <ul className="flex flex-col">
                {rows.map((r) => (
                  <li key={r.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-default-100 py-2 text-small num">
                    <Checkbox size="sm" isSelected={pick.includes(r.id)} onValueChange={() => toggle(r.id)} aria-label={`${r.w.name} 비교`} />
                    <span className="min-w-0"><span className="block truncate font-medium">{r.w.name}</span><span className="block text-tiny text-default-500">{r.w.gu} {r.w.dong} · {r.ar?.a ?? r.w.area}㎡ · {r.w.savedAt} 저장 {won(r.w.price)}</span></span>
                    <span className="text-right"><b>{won(r.now)}</b><span className="block text-tiny" style={{ color: r.chg > 0 ? "#E5484D" : r.chg < 0 ? "#3E7BFA" : undefined }}>{r.chg == null || Math.abs(r.chg) < 0.05 ? "변화 없음" : fmt.pct(r.chg)}</span></span>
                    <Button size="sm" variant="light" onPress={() => remove(r.id)}>삭제</Button>
                  </li>
                ))}
              </ul>
              {cmp.length >= 2 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-tiny num">
                    <thead><tr><th className="w-28" />{cmp.map((r) => <th key={r.id} className="px-2 py-1 text-left text-small font-semibold">{r.w.name}<div className="text-[10px] font-normal text-default-500">{r.w.gu} {r.w.dong}</div></th>)}</tr></thead>
                    <tbody>
                      {LINES.map(([l, f]) => (
                        <tr key={l} className="border-t border-default-100">
                          <td className="py-1.5 pr-2 text-default-500">{l}</td>
                          {cmp.map((r) => <td key={r.id} className="px-2 py-1.5">{f(r)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[10px] text-default-400">지금 시세 = 저장한 평형의 최근 6개월 중위가(없으면 마지막 거래). {yrs}년 뒤 = 그 동네 최근 1년 상승률의 절반 속도로 키운 값, 예산은 내 조건의 '{later?.label}' {won(B)}.</p>
                </div>
              )}
              {cmp.length === 1 && <p className="text-tiny text-default-500">한 곳 더 체크하면 비교표가 나옵니다.</p>}
            </>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
