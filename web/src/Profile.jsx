"use client";
import { useEffect, useState } from "react";
import { Button, Chip, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Slider, Switch } from "@heroui/react";
import { interstitialPending, interstitialState, preloadInterstitial, showInterstitialOnce } from "./TossInterstitial.js";
import { budgetsFrom, DEFAULT_PROFILE, DEFAULT_WORK, HOUSEHOLDS, householdOf, ownLoanAt, saleNet, useBackToClose, WORKPLACES, won } from "./lib.js";

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

// a plain number field (연도, 년, %)
function Num({ label, value, onChange, unit, hint }) {
  return (
    <Input size="sm" type="number" inputMode="decimal" label={label} value={value == null ? "" : String(value)} onFocus={keepVisible}
      onValueChange={(v) => onChange(v === "" ? 0 : Number(v))} endContent={<span className="whitespace-nowrap text-tiny text-default-400">{unit}</span>} description={hint} />
  );
}
// 지금 집을 팔면 손에 남는 돈, for the two buying moments
function SaleSummary({ draft, yrs }) {
  const rows = [[0, "지금 팔면"], ...(yrs ? [[yrs, `${yrs}년 뒤 팔면`]] : [])].map(([t, l]) => [l, saleNet(draft, t)]);
  return (
    <div className={`grid gap-2 ${rows.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {rows.map(([l, s]) => (
        <div key={l} className="rounded-medium bg-default-100 px-3 py-2 text-tiny num">
          <div className="font-semibold text-default-600">{l} (보유 {s.hold}년{s.lived ? ` · 거주 ${s.lived}년` : ""})</div>
          {[["파는 가격", won(s.value)], ["− 남은 대출", won(s.loan)], ...(s.deposit ? [["− 세입자 보증금", won(s.deposit)]] : []), ["− 양도세 (지방세 포함)", s.tax ? won(s.tax) : "0원"], ["− 중개보수", won(s.fee)]].map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-default-500">{k}</span><span>{v}</span></div>
          ))}
          <div className="mt-0.5 flex justify-between border-t border-default-200 pt-0.5 text-small"><span className="font-semibold">손에 남는 돈</span><b className="text-primary">{won(s.net)}</b></div>
          <div className="text-[10px] text-default-400">{s.taxNote}{s.gain > 0 ? ` · 차익 ${won(s.gain)}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

// one money field in 만원, with the amount spelled out in 억/만 as you type
export function Money({ label, value, onChange, hint, isDisabled }) {
  return (
    <Input size="sm" type="number" inputMode="numeric" label={label} isDisabled={isDisabled} value={value == null ? "" : String(value)} onFocus={keepVisible}
      onValueChange={(v) => onChange(v === "" ? 0 : Number(v))} endContent={<span className="whitespace-nowrap text-tiny text-default-400">만원</span>}
      description={value ? `= ${won(value)}${hint ? ` · ${hint}` : ""}` : hint} />
  );
}
// 지금 가진 집 찾기: the site's own complexes, so 시세 fills in from recent 실거래 (6개월 중위가) and the 오름세 from its 동
function OwnAptPicker({ apts, insights, draft, onPick }) {
  const [q, setQ] = useState("");
  const key = q.replace(/\s/g, "");
  const found = key.length < 2 || !apts ? [] : apts.filter((a) => (a.apt + a.dong).replace(/\s/g, "").includes(key) && a.median_price_10k)
    .sort((a, b) => (b.trades_6m || 0) - (a.trades_6m || 0)).slice(0, 6);
  const pick = (a) => {
    const r = insights?.hdong?.[a.hcode] || insights?.bdong?.[`${a.gu} ${a.dong}`], up = insights?.gu?.[a.gu];
    onPick({ ownApt: a.id, ownValue: a.median_price_10k, ownTrend: r?.p12?.chg ?? up?.p12?.chg ?? null }); setQ("");
  };
  const cur = draft.ownApt && apts?.find((a) => a.id === draft.ownApt);
  return (
    <div className="flex flex-col gap-1.5">
      <Input size="sm" aria-label="우리 집 단지 검색" placeholder="단지 이름 (예: 래미안, 목동신시가지)" value={q} onValueChange={setQ} onFocus={keepVisible} />
      {found.length > 0 && (
        <ul className="flex flex-col rounded-medium border border-default-200">
          {found.map((a) => (
            <li key={a.id}><button type="button" className="w-full px-2 py-1.5 text-left text-tiny hover:bg-default-100" onClick={() => pick(a)}>
              <b>{a.apt}</b> <span className="text-default-400">{a.gu} {a.dong} · 최근 중위 {won(a.median_price_10k)} ({a.median_area_sqm}㎡)</span>
            </button></li>
          ))}
        </ul>
      )}
      {key.length >= 2 && !found.length && <p className="text-tiny text-default-500">찾는 단지가 없으면 아래 시세를 직접 적어 주세요.</p>}
      {cur && <p className="text-tiny text-default-500">선택: <b>{cur.apt}</b> ({cur.gu} {cur.dong}) · 시세는 최근 6개월 중위가({cur.median_area_sqm}㎡ 기준)로 채웠어요. 평형이 다르면 고쳐 주세요.</p>}
    </div>
  );
}
// a row of 2~3 choices as big buttons
export function Choice({ value, onChange, options }) {
  return (
    <div className={`grid gap-1.5 ${options.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={`rounded-medium border-2 px-2 py-1.5 text-tiny font-medium transition-colors ${value === k ? "border-primary bg-primary-50 text-primary" : "border-default-200 hover:bg-default-100"}`}>{l}</button>
      ))}
    </div>
  );
}
const Q = ({ title, children }) => <div className="flex flex-col gap-1.5"><span className="text-tiny font-semibold text-default-600">{title}</span>{children}</div>;

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
export default function ProfileModal({ open, onClose, profile, onSave, onReset, rate, stations, apts, insights }) {
  const [draft, setDraft] = useState(profile);
  const phone = useIsPhone(), visH = useVisibleHeight(phone && open);
  useBackToClose(open, onClose);
  useEffect(() => { if (open) preloadInterstitial(); }, [open]);
  const [, setAdState] = useState("");  // re-render when the ad finishes loading, so the notice below appears
  useEffect(() => { interstitialState.listeners.add(setAdState); return () => interstitialState.listeners.delete(setAdState); }, []);  // 전면 광고 is ready before the viewer saves
  useEffect(() => { if (open) setDraft(profile); }, [open, profile]);
  const num = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const hh = householdOf(draft), solo = hh === "single", yrs = Number(draft.marry) || 0;
  const live = budgetsFrom(draft, rate);  // what these numbers buy, updated as you type
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

          <Step n="5" title="지금 가진 집" sub={draft.own ? "이 집을 팔고 새 집으로 옮긴다고 보고, 판 돈을 모은 돈에 더합니다." : "집이 있다면 켜 주세요. 팔 때 남는 돈과 세금을 계산해 예산에 더합니다."}
            right={<Switch size="sm" isSelected={!!draft.own} onValueChange={(v) => setDraft((d) => ({ ...d, own: v }))} aria-label="지금 가진 집 있음" />}>
            {draft.own && (() => {
              const set = (o) => setDraft((d) => ({ ...d, ...o })), ln = ownLoanAt(draft, 0), stay = draft.ownStay || "live";
              return (
                <div className="flex flex-col gap-4">
                  <Q title="① 어느 집이에요?">
                    <OwnAptPicker apts={apts} insights={insights} draft={draft} onPick={set} />
                    <Money label="지금 시세" value={draft.ownValue} onChange={num("ownValue")} hint={draft.ownApt ? "단지 실거래로 채움" : "모르면 비슷한 매물 가격"} />
                  </Q>
                  <Q title="② 언제, 얼마에 샀어요?">
                    <div className="grid grid-cols-2 gap-2">
                      <Num label="산 해" value={draft.ownYear} onChange={num("ownYear")} unit="년" />
                      <Money label="산 가격" value={draft.ownBought} onChange={num("ownBought")} hint="양도세 계산용" />
                    </div>
                    <span className="text-tiny text-default-500">지금 이 집에</span>
                    <Choice value={stay} onChange={(v) => set({ ownStay: v })} options={[["live", "직접 살고 있어요"], ["rent", "세를 줬어요"], ["mixed", "살다가 세를 줬어요"]]} />
                    {stay !== "live" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Money label="세입자 보증금" value={draft.ownDeposit} onChange={num("ownDeposit")} hint="팔 때 돌려줄 돈" />
                        {stay === "mixed" && <Num label="직접 산 기간" value={draft.ownLived} onChange={num("ownLived")} unit="년" hint="양도세 비과세는 2년부터" />}
                      </div>
                    )}
                  </Q>
                  <Q title="③ 대출이 남아 있어요? (은행 앱에 나와요)">
                    <div className="grid grid-cols-2 gap-2">
                      <Money label="남은 대출" value={draft.ownLoan} onChange={num("ownLoan")} hint={!draft.ownLoan && ln.estimated ? `추정 ${won(ln.now)}` : "없으면 0"} />
                      <Money label="매달 내는 돈" value={draft.ownPay} onChange={num("ownPay")} hint={!draft.ownPay && ln.pay ? `추정 ${won(ln.pay)}` : "원금+이자"} />
                      <Num label="대출 금리" value={draft.ownRate} onChange={(v) => set({ ownRate: v || null })} unit="%" hint="비우면 아래 대출 금리" />
                      {!draft.ownLoan && <Money label="처음 빌린 금액" value={draft.ownLoanOrig} onChange={num("ownLoanOrig")} hint="남은 대출을 모를 때만" />}
                    </div>
                    {ln.now > 0 && <p className="text-tiny text-default-500">매달 {won(ln.pay)} 중 이자 약 {won(ln.interest)}, 원금 약 {won(ln.principal)}을 갚고 있어요.{ln.estimated ? " (산 해부터 30년 원리금균등으로 갚았다고 보고 계산)" : ""}</p>}
                  </Q>
                  {yrs > 0 && (
                    <Q title={`${yrs}년 뒤 팔 때 가격은?`}>
                      <Choice value={draft.ownSell || "now"} onChange={(v) => set({ ownSell: v })}
                        options={[["now", "지금 시세 그대로"], ["trend", draft.ownTrend != null ? `최근 1년 오름세 (연 ${draft.ownTrend > 0 ? "+" : ""}${draft.ownTrend}%)` : "최근 1년 오름세"], ["custom", "직접 입력"]]} />
                      {draft.ownSell === "trend" && !draft.ownApt && <Num label="연 상승률" value={draft.ownTrend} onChange={(v) => set({ ownTrend: v })} unit="%" hint="단지를 고르면 그 동네 값으로 채워져요" />}
                      {draft.ownSell === "custom" && <Money label={`${yrs}년 뒤 팔 가격`} value={draft.ownSellPrice} onChange={num("ownSellPrice")} />}
                    </Q>
                  )}
                  <SaleSummary draft={draft} yrs={yrs} />
                  <p className="text-[10px] text-default-400">양도세는 1세대 1주택 기준 추정입니다 (2년 보유·거주면 12억까지 비과세, 넘는 부분은 장기보유특별공제 후 누진세율). 집이 2채 이상이거나 일시적 2주택 기한을 넘기면 달라집니다. 매달 내는 대출금이 위의 월 저축액과 따로라면 저축액에서 빼고 입력하세요.</p>
                </div>
              );
            })()}
          </Step>

          <Step n="6" title="대출 조건">
            <Switch size="sm" isSelected={draft.firstHome && !draft.own} isDisabled={!!draft.own} onValueChange={(v) => setDraft((d) => ({ ...d, firstHome: v }))}>
              <span className="text-small">생애최초 구입</span> <span className="text-tiny text-default-500">{draft.own ? "집이 있으면 해당 없음 · LTV 40%" : draft.firstHome ? "LTV 70%" : "LTV 40%"}{!draft.own && hh !== "single" ? " · 부부 모두 집을 가진 적이 없어야 해당" : ""}</span>
            </Switch>
            <Input size="sm" type="number" label="대출 금리 (비우면 최신 평균)" placeholder={rate ? `최신 평균 ${rate}%` : ""} className="max-w-xs"
              value={draft.rate == null ? "" : String(draft.rate)} onFocus={keepVisible} onValueChange={(v) => setDraft((d) => ({ ...d, rate: v === "" ? null : Number(v) }))}
              endContent={<span className="whitespace-nowrap text-tiny text-default-400">%</span>} description="스트레스 금리 3%p를 더해 DSR 40% 한도를 계산합니다." />
          </Step>

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
