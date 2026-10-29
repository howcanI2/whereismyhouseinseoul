"use client";
import { useEffect, useState } from "react";
import { Button, ButtonGroup, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Switch, Textarea } from "@heroui/react";
import { DEFAULT_PROFILE, HOUSEHOLDS, householdOf, useWatch, won } from "./lib.js";

// 다른 기기로 옮길 때 쓰는 코드: 내 조건 + 관심 단지를 한 줄로. 서버나 링크에는 남지 않고 복사한 사람만 가집니다.
const encode = (obj) => "HB1:" + btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
function decode(code) {
  const t = (code || "").trim();
  if (!t.startsWith("HB1:")) throw new Error("형식이 맞지 않습니다");
  const o = JSON.parse(decodeURIComponent(escape(atob(t.slice(4)))));
  if (!o || typeof o.p !== "object") throw new Error("내용이 비어 있습니다");
  const p = Object.fromEntries(Object.keys(DEFAULT_PROFILE).filter((k) => k !== "example" && k in o.p).map((k) => [k, k === "firstHome" ? !!o.p[k] : k === "household" ? (HOUSEHOLDS.some(([h]) => h === o.p[k]) ? o.p[k] : "plan") : o.p[k] == null ? null : Number(o.p[k])]));
  const w = o.w && typeof o.w === "object" ? o.w : {};
  return { p, w };
}

const FIELDS = [
  ["income", "내 연소득 (세전)", "만원"],
  ["cash", "지금 모은 돈", "만원"],
  ["saving", "월 저축액", "만원"],
  ["marry", "몇 년 뒤에 살 계획인지", "년", "그때까지 저축을 반영해 '나중에' 예산을 계산"],
  ["partnerIncome", "배우자 연소득", "만원"],
  ["partnerCash", "배우자 모은 돈", "만원"],
  ["partnerSaving", "배우자 월 저축액", "만원"],
  ["rate", "대출 금리 (비우면 최신 평균)", "%"],
];

// "내 조건" editor. Values stay in this browser (localStorage); nothing is sent anywhere or shared with the link.
export default function ProfileModal({ open, onClose, profile, onSave, onReset, budgets }) {
  const [draft, setDraft] = useState(profile);
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
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v === "" ? (k === "rate" ? null : 0) : Number(v) }));
  const hh = householdOf(draft), solo = hh === "single";
  const marryLabel = hh === "plan" ? "결혼·합가하고 살 시점 (몇 년 뒤)" : "몇 년 뒤에 살 계획인지";
  return (
    <Modal isOpen={open} onOpenChange={(o) => !o && onClose()} size="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          내 조건
          <span className="text-tiny font-normal text-default-500">이 브라우저에만 저장됩니다. 링크를 공유해도 다른 사람에게 보이지 않습니다.</span>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small font-medium">가구 형태</span>
            <ButtonGroup size="sm" radius="full">{HOUSEHOLDS.map(([k, l]) => <Button key={k} color={hh === k ? "primary" : "default"} variant={hh === k ? "solid" : "flat"} onPress={() => setDraft((d) => ({ ...d, household: k }))}>{l}</Button>)}</ButtonGroup>
          </div>
          <p className="-mt-1 text-tiny text-default-500">{hh === "married" ? "지금 예산부터 부부 합산으로 계산합니다. 생애최초는 부부 모두 집을 가진 적이 없을 때만 해당됩니다." : hh === "plan" ? "지금은 혼자, 결혼·합가 시점부터 둘의 소득과 모은 돈을 합쳐 계산합니다." : "배우자 없이 내 소득과 저축만으로 계산합니다."}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map(([k, label, unit, hint]) => (
              <Input key={k} id={`profile-${k}`} size="sm" type="number" label={k === "marry" ? marryLabel : label} description={hint}
                isDisabled={solo && k.startsWith("partner")}
                value={draft[k] == null ? "" : String(draft[k])} onValueChange={set(k)}
                endContent={<span className="text-tiny text-default-400">{unit}</span>} />
            ))}
          </div>
          <Switch size="sm" isSelected={draft.firstHome} onValueChange={(v) => setDraft((d) => ({ ...d, firstHome: v }))}>생애최초 주택 구입 (LTV 70%, 아니면 40%)</Switch>
          {budgets && (
            <div className="rounded-medium bg-default-100 px-3 py-2 text-small num">
              저장된 조건 기준: 지금 최대 <b>{won(budgets[0].max_price_10k)}</b> · {budgets[1].label} 최대 <b>{won(budgets[1].max_price_10k)}</b>
            </div>
          )}
          <div className="rounded-medium border border-default-200 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-small font-medium">다른 기기로 옮기기</span>
              <Button size="sm" variant="flat" isDisabled={profile.example} onPress={exportCode}>내보내기 (코드 복사)</Button>
              <Button size="sm" variant="flat" onPress={() => { setMove("in"); setCode(""); setMsg(""); }}>가져오기</Button>
            </div>
            <p className="mt-1 text-[10px] text-default-400">내 조건과 관심 단지를 코드 한 줄로 옮깁니다. 코드는 어디에도 저장·전송되지 않으니, 남에게 보내지만 않으면 아무도 볼 수 없습니다.</p>
            {move && <Textarea className="mt-2" size="sm" minRows={2} maxRows={4} aria-label="옮기기 코드" placeholder="HB1:로 시작하는 코드를 붙여 넣으세요" value={code} onValueChange={setCode} isReadOnly={move === "out"} />}
            {move === "in" && <Button className="mt-2" size="sm" color="primary" isDisabled={!code.trim()} onPress={importCode}>이 코드로 불러오기</Button>}
            {msg && <p className="mt-1 text-tiny text-default-600">{msg}</p>}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={() => { onReset(); onClose(); }}>예시값으로 되돌리기</Button>
          <Button color="primary" onPress={() => { onSave(draft); onClose(); }}>저장</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
