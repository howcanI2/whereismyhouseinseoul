"use client";
import { useEffect, useState } from "react";
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Switch } from "@heroui/react";
import { won } from "./lib.js";

const FIELDS = [
  ["income", "내 연소득 (세전)", "만원"],
  ["cash", "지금 모은 돈", "만원"],
  ["saving", "월 저축액", "만원"],
  ["marry", "결혼·합가 계획 (몇 년 뒤)", "년", "0이면 혼자 기준만 계산"],
  ["partnerIncome", "배우자 연소득", "만원"],
  ["partnerCash", "배우자 모은 돈", "만원"],
  ["partnerSaving", "배우자 월 저축액", "만원"],
  ["rate", "대출 금리 (비우면 최신 평균)", "%"],
];

// "내 조건" editor. Values stay in this browser (localStorage); nothing is sent anywhere or shared with the link.
export default function ProfileModal({ open, onClose, profile, onSave, onReset, budgets }) {
  const [draft, setDraft] = useState(profile);
  useEffect(() => { if (open) setDraft(profile); }, [open, profile]);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v === "" ? (k === "rate" ? null : 0) : Number(v) }));
  const solo = !Number(draft.marry);
  return (
    <Modal isOpen={open} onOpenChange={(o) => !o && onClose()} size="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          내 조건
          <span className="text-tiny font-normal text-default-500">이 브라우저에만 저장됩니다. 링크를 공유해도 다른 사람에게 보이지 않습니다.</span>
        </ModalHeader>
        <ModalBody>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FIELDS.map(([k, label, unit, hint]) => (
              <Input key={k} id={`profile-${k}`} size="sm" type="number" label={label} description={hint}
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
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={() => { onReset(); onClose(); }}>예시값으로 되돌리기</Button>
          <Button color="primary" onPress={() => { onSave(draft); onClose(); }}>저장</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
