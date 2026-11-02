"use client";
import { useEffect, useState } from "react";
import { Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Slider, Switch, Textarea } from "@heroui/react";
import { interstitialPending, interstitialState, preloadInterstitial, showInterstitialOnce } from "./TossInterstitial.js";
import { budgetsFrom, DEFAULT_PROFILE, DEFAULT_WORK, HOUSEHOLDS, householdOf, useBackToClose, useWatch, WORKPLACES, won } from "./lib.js";

// 다른 기기로 옮길 때 쓰는 코드: 내 조건 + 관심 단지를 한 줄로. 서버나 링크에는 남지 않고 복사한 사람만 가집니다.
const encode = (obj) => "HB1:" + btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
function decode(code) {
  const t = (code || "").trim();
  if (!t.startsWith("HB1:")) throw new Error("형식이 맞지 않습니다");
  const o = JSON.parse(decodeURIComponent(escape(atob(t.slice(4)))));
  if (!o || typeof o.p !== "object") throw new Error("내용이 비어 있습니다");
  const p = Object.fromEntries(Object.keys(DEFAULT_PROFILE).filter((k) => k !== "example" && k !== "work" && k in o.p).map((k) => [k, k === "firstHome" ? !!o.p[k] : k === "household" ? (HOUSEHOLDS.some(([h]) => h === o.p[k]) ? o.p[k] : "plan") : o.p[k] == null ? null : Number(o.p[k])]));
  const w = o.w && typeof o.w === "object" ? o.w : {};
  const wk = o.p.work;
  if (wk && Number.isFinite(Number(wk.lon)) && Number.isFinite(Number(wk.lat))) p.work = { name: String(wk.name || "직장").slice(0, 40), lon: Number(wk.lon), lat: Number(wk.lat) };
  return { p, w };
}

// phones get a full-screen sheet: a centered dialog shrinks to a sliver once the keyboard opens
function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)"), on = () => setPhone(mq.matches);
    on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}
// height of the part of the screen the keyboard leaves visible, so the sheet's 저장 button stays above it
function useVisibleHeight(on) {
  const [h, setH] = useState(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" && window.visualViewport;
    if (!on || !vv) return setH(null);
    // iOS may also pan the page when the keyboard opens; offsetTop follows that so the sheet stays in view
    const upd = () => setH({ h: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    upd(); vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd);
    return () => { vv.removeEventListener("resize", upd); vv.removeEventListener("scroll", upd); };
  }, [on]);
  return h;
}
// keeps the field above the on-screen keyboard once it has opened
const keepVisible = (e) => { const el = e.target; setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 300); };

// one money field in 만원, with the amount spelled out in 억/만 as you type
function Money({ label, value, onChange, hint, isDisabled }) {
  return (
    <Input size="sm" type="number" inputMode="numeric" label={label} isDisabled={isDisabled} value={value == null ? "" : String(value)} onFocus={keepVisible}
      onValueChange={(v) => onChange(v === "" ? 0 : Number(v))} endContent={<span className="whitespace-nowrap text-tiny text-default-400">만원</span>}
      description={value ? `= ${won(value)}${hint ? ` · ${hint}` : ""}` : hint} />
  );
}
const Step = ({ n, title, sub, children, right }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between gap-2">
      <h4 className="flex items-baseline gap-2 text-small font-semibold"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-white">{n}</span>{title}</h4>{right}
    </div>
    {sub && <p className="-mt-1 text-tiny text-default-500">{sub}</p>}
    {children}
  </section>
);

// 직장: a preset business district, or any place found with the Kakao map's place search (when the Kakao map is loaded)
function WorkPicker({ work, onPick, stations }) {
  const [q, setQ] = useState(""), [found, setFound] = useState(null), [busy, setBusy] = useState(false);
  const kakao = typeof window !== "undefined" && !!window.kakao?.maps?.services;
  const canSearch = kakao || !!stations?.length;
  // without Kakao: match subway station names (the commute estimate is by distance, so the nearest station is close enough)
  const searchStations = (text) => {
    const key = text.trim().replace(/역$/, "").replace(/\s/g, ""), seen = new Map();
    stations.filter((s) => s.station.replace(/\s/g, "").includes(key)).forEach((s) => {
      const r = seen.get(s.station) || { name: s.station, addr: [], lon: s.lon, lat: s.lat };
      if (!r.addr.includes(s.line)) r.addr.push(s.line); seen.set(s.station, r);
    });
    setFound([...seen.values()].sort((a, b) => a.name.length - b.name.length).slice(0, 8).map((r) => ({ ...r, addr: r.addr.join(" · ") })));
  };
  const search = () => {
    if (!q.trim() || !canSearch) return;
    if (!kakao) return searchStations(q);
    setBusy(true);
    new window.kakao.maps.services.Places().keywordSearch(q.trim(), (rows, status) => {
      setBusy(false);
      setFound(status === window.kakao.maps.services.Status.OK ? rows.slice(0, 6).map((r) => ({ name: r.place_name, addr: r.road_address_name || r.address_name, lon: Number(r.x), lat: Number(r.y) })) : []);
    }, { size: 6 });
  };
  const same = (w) => Math.abs(w.lon - work.lon) < 1e-5 && Math.abs(w.lat - work.lat) < 1e-5;
  return (
    <div className="rounded-medium border border-default-200 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-small font-medium">직장 위치</span><span className="text-tiny text-default-500">지금: <b>{work.name}</b></span></div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {WORKPLACES.map((w) => <Chip key={w.name} size="sm" variant={same(w) ? "solid" : "flat"} color={same(w) ? "primary" : "default"} className="cursor-pointer" onClick={() => onPick(w)}>{w.name}</Chip>)}
      </div>
      {canSearch ? (
        <div className="mt-2 flex gap-2">
          <Input size="sm" aria-label="회사 검색" placeholder={kakao ? "회사 이름이나 주소 (예: 삼성전자 서초사옥)" : "회사 근처 지하철역 (예: 삼성, 가산디지털단지)"} value={q} onValueChange={(v) => { setQ(v); if (!kakao) v.trim() ? searchStations(v) : setFound(null); }} onKeyDown={(e) => e.key === "Enter" && search()} />
          <Button size="sm" variant="flat" isLoading={busy} onPress={search}>검색</Button>
        </div>
      ) : <p className="mt-1.5 text-[10px] text-default-400">회사 검색은 카카오 지도가 켜진 화면(웹 사이트)에서 됩니다. 여기서는 위 업무지구 중에서 고를 수 있습니다.</p>}
      {found && (found.length === 0 ? <p className="mt-1 text-tiny text-default-500">검색 결과가 없습니다.</p> : (
        <ul className="mt-1 flex flex-col">
          {found.map((r) => (
            <li key={`${r.lon},${r.lat}`}><button type="button" className="w-full rounded-small px-1.5 py-1 text-left text-tiny hover:bg-default-100" onClick={() => { onPick({ name: r.name, lon: r.lon, lat: r.lat }); setFound(null); setQ(""); }}>
              <b>{r.name}</b> <span className="text-default-400">{r.addr}</span>
            </button></li>
          ))}
        </ul>
      ))}
      <p className="mt-1 text-[10px] text-default-400">통근 시간, 지도의 ◆ 표시, '통근시간으로 거르기'가 이 위치를 기준으로 바뀝니다. 이 브라우저에만 저장됩니다.</p>
    </div>
  );
}

// "내 조건" editor. Values stay in this browser (localStorage); nothing is sent anywhere or shared with the link.
export default function ProfileModal({ open, onClose, profile, onSave, onReset, rate, stations }) {
  const [draft, setDraft] = useState(profile);
  const phone = useIsPhone(), visH = useVisibleHeight(phone && open);
  useBackToClose(open, onClose);
  useEffect(() => { if (open) preloadInterstitial(); }, [open]);
  const [, setAdState] = useState("");  // re-render when the ad finishes loading, so the notice below appears
  useEffect(() => { interstitialState.listeners.add(setAdState); return () => interstitialState.listeners.delete(setAdState); }, []);  // 전면 광고 is ready before the viewer saves
  const [watch, , setWatch] = useWatch();
  const [move, setMove] = useState(null); // null | "out" | "in"
  const [code, setCode] = useState(""), [msg, setMsg] = useState("");
  useEffect(() => { if (open) { setMove(null); setCode(""); setMsg(""); } }, [open]);
  const exportCode = () => {
    const { example, ...p } = profile;
    const c = encode({ p, w: watch }); setCode(c); setMove("out");
    navigator.clipboard?.writeText(c).then(() => setMsg("복사했습니다. 다른 기기의 '가져오기'에 붙여 넣으세요."), () => setMsg("아래 코드를 직접 복사하세요."));
  };
  const importCode = () => {
    try { const { p, w } = decode(code); onSave(p); setWatch({ ...watch, ...w }); setMsg(`가져왔습니다: 내 조건, 관심 단지 ${Object.keys(w).length}곳`); setDraft((d) => ({ ...d, ...p })); }
    catch (e) { setMsg("코드를 읽지 못했습니다. 처음부터 끝까지 그대로 붙여 넣었는지 확인하세요."); }
  };
  useEffect(() => { if (open) setDraft(profile); }, [open, profile]);
  const num = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const hh = householdOf(draft), solo = hh === "single", yrs = Number(draft.marry) || 0;
  const live = budgetsFrom(draft, rate);  // what these numbers buy, updated as you type
  const [moveOpen, setMoveOpen] = useState(false);
  const HH_TEXT = { single: "내 소득·저축만으로", plan: "지금은 혼자, 결혼하면 둘이 합쳐서", married: "지금부터 부부 합산으로" };
  return (
    <Modal isOpen={open} onOpenChange={(o) => !o && onClose()} size={phone ? "full" : "2xl"} scrollBehavior="inside">
      <ModalContent style={phone && visH ? { height: visH.h, maxHeight: visH.h, minHeight: 0, marginTop: visH.top } : undefined}>
        <ModalHeader className="flex flex-col gap-2 pb-2">
          <div className="flex items-baseline justify-between gap-2 pr-6">내 조건<span className="hidden text-tiny font-normal text-default-500 sm:inline">이 브라우저에만 저장 · 링크를 공유해도 안 보입니다</span></div>
          <div className="grid grid-cols-2 gap-2">
            {live.map((b) => (
              <div key={b.scenario} className={`rounded-medium px-3 py-1.5 sm:py-2 ${b.scenario === "later" ? "bg-primary-50" : "bg-default-100"}`}>
                <div className="text-tiny font-normal text-default-500">{b.label} 최대</div>
                <div className={`text-lg font-bold num sm:text-xl ${b.scenario === "later" ? "text-primary" : ""}`}>{won(b.max_price_10k)}</div>
                <div className="hidden text-[10px] font-normal text-default-400 num sm:block">대출 {won(b.loan_10k)} · {b.binding}</div>
              </div>
            ))}
          </div>
        </ModalHeader>
        <ModalBody className="gap-5">
          <Step n="1" title="직장">
            <WorkPicker work={draft.work || DEFAULT_WORK} stations={stations} onPick={(w) => setDraft((d) => ({ ...d, work: w }))} />
          </Step>

          <Step n="2" title="가구 형태" sub={`${HH_TEXT[hh]} 예산을 계산합니다.`}>
            <div className="grid grid-cols-3 gap-2">
              {HOUSEHOLDS.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setDraft((d) => ({ ...d, household: k }))}
                  className={`rounded-medium border-2 px-2 py-2 text-small font-medium transition-colors ${hh === k ? "border-primary bg-primary-50 text-primary" : "border-default-200 hover:bg-default-100"}`}>
                  {l}
                </button>
              ))}
            </div>
          </Step>

          <Step n="3" title="소득과 모은 돈" sub="세전 연소득, 지금 바로 쓸 수 있는 현금, 매달 저축하는 금액 (만원 단위)">
            <div className={`grid gap-4 ${solo ? "grid-cols-1" : "sm:grid-cols-2"}`}>
              <div className="flex flex-col gap-2">
                <span className="text-tiny font-semibold text-default-600">나</span>
                <Money label="연소득 (세전)" value={draft.income} onChange={num("income")} />
                <Money label="지금 모은 돈" value={draft.cash} onChange={num("cash")} />
                <Money label="월 저축액" value={draft.saving} onChange={num("saving")} />
              </div>
              {!solo && (
                <div className="flex flex-col gap-2">
                  <span className="text-tiny font-semibold text-default-600">{hh === "plan" ? "배우자 (예정)" : "배우자"}</span>
                  <Money label="연소득 (세전)" value={draft.partnerIncome} onChange={num("partnerIncome")} />
                  <Money label="지금 모은 돈" value={draft.partnerCash} onChange={num("partnerCash")} />
                  <Money label="월 저축액" value={draft.partnerSaving} onChange={num("partnerSaving")} />
                </div>
              )}
            </div>
          </Step>

          <Step n="4" title={hh === "plan" ? "결혼·합가하고 살 시점" : "언제 살 계획인가요"} right={<span className="text-small font-bold text-primary num">{yrs ? `${yrs}년 뒤` : "지금"}</span>}
            sub={yrs ? `그때까지 월 저축 ${won((draft.saving || 0) + (solo ? 0 : draft.partnerSaving || 0))}을 모은다고 보고 "${live[1].label}" 예산을 계산합니다.` : "지금 산다고 보고 계산합니다."}>
            <Slider aria-label="매수 시점" size="sm" step={1} minValue={0} maxValue={10} value={yrs} onChange={(v) => setDraft((d) => ({ ...d, marry: Number(v) }))}
              marks={[0, 2, 4, 6, 8, 10].map((v) => ({ value: v, label: v ? `${v}년` : "지금" }))} />
          </Step>

          <Step n="5" title="대출 조건">
            <Switch size="sm" isSelected={draft.firstHome} onValueChange={(v) => setDraft((d) => ({ ...d, firstHome: v }))}>
              <span className="text-small">생애최초 구입</span> <span className="text-tiny text-default-500">{draft.firstHome ? "LTV 70%" : "LTV 40%"}{hh !== "single" ? " · 부부 모두 집을 가진 적이 없어야 해당" : ""}</span>
            </Switch>
            <Input size="sm" type="number" label="대출 금리 (비우면 최신 평균)" placeholder={rate ? `최신 평균 ${rate}%` : ""} className="max-w-xs"
              value={draft.rate == null ? "" : String(draft.rate)} onFocus={keepVisible} onValueChange={(v) => setDraft((d) => ({ ...d, rate: v === "" ? null : Number(v) }))}
              endContent={<span className="whitespace-nowrap text-tiny text-default-400">%</span>} description="스트레스 금리 3%p를 더해 DSR 40% 한도를 계산합니다." />
          </Step>

          <div className="rounded-medium border border-default-200 px-3 py-2">
            <button type="button" className="flex w-full items-center justify-between text-small font-medium" onClick={() => setMoveOpen((v) => !v)} aria-expanded={moveOpen}>
              다른 기기로 옮기기 <span className="text-tiny text-default-400">{moveOpen ? "접기 ▴" : "열기 ▾"}</span>
            </button>
            {moveOpen && (
              <>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="flat" isDisabled={profile.example} onPress={exportCode}>내보내기 (코드 복사)</Button>
                  <Button size="sm" variant="flat" onPress={() => { setMove("in"); setCode(""); setMsg(""); }}>가져오기</Button>
                </div>
                <p className="mt-1 text-[10px] text-default-400">내 조건과 관심 단지를 코드 한 줄로 옮깁니다. 코드는 어디에도 저장·전송되지 않으니, 남에게 보내지만 않으면 아무도 볼 수 없습니다.{profile.example ? " 먼저 내 조건을 저장해야 내보낼 수 있습니다." : ""}</p>
                {move && <Textarea className="mt-2" size="sm" minRows={2} maxRows={4} aria-label="옮기기 코드" placeholder="HB1:로 시작하는 코드를 붙여 넣으세요" value={code} onValueChange={setCode} isReadOnly={move === "out"} />}
                {move === "in" && <Button className="mt-2" size="sm" color="primary" isDisabled={!code.trim()} onPress={importCode}>이 코드로 불러오기</Button>}
                {msg && <p className="mt-1 text-tiny text-default-600">{msg}</p>}
              </>
            )}
          </div>
          <p className="text-[10px] text-default-400 sm:hidden">이 브라우저에만 저장 · 링크를 공유해도 안 보입니다</p>
        </ModalBody>
        <ModalFooter className="flex-wrap items-center">
          {interstitialPending() && <span className="w-full text-right text-[10px] text-default-400 sm:mr-auto sm:w-auto">저장하면 광고가 한 번 나온 뒤 결과로 돌아갑니다</span>}
          <Button variant="light" onPress={() => { onReset(); onClose(); }}>예시값으로 되돌리기</Button>
          <Button color="primary" onPress={() => { onSave(draft); onClose(); setTimeout(showInterstitialOnce, 400); }}>저장</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
