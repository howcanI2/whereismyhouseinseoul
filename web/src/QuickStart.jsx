"use client";
// First visit: the numbers on screen are an example, so ask for the few things that decide a budget right here,
// above the tabs, and show what they buy as they are typed. 직장·가진 집·대출 조건 stay in the full 내 조건 sheet.
import { useState } from "react";
import { Button, Card, CardBody } from "@heroui/react";
import { budgetsFrom, HOUSEHOLDS, won } from "./lib.js";
import { Choice, Money } from "./Profile.jsx";

const WHEN = [[0, "지금"], [1, "1년 뒤"], [2, "2년 뒤"], [3, "3년 뒤"], [5, "5년 뒤"]];

export default function QuickStart({ profile, onSave, onMore, rate }) {
  const [d, setD] = useState({ household: "single", income: 0, cash: 0, saving: 0, partnerIncome: 0, partnerCash: 0, partnerSaving: 0, marry: 3 });
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v })), solo = d.household === "single";
  const mine = { ...profile, ...d, ...(solo ? { partnerIncome: 0, partnerCash: 0, partnerSaving: 0 } : {}) };
  const ready = d.income > 0 || d.cash > 0;
  const [now, later] = budgetsFrom(mine, rate);
  return (
    <Card shadow="sm" className="border-2 border-primary-200">
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-large font-bold">30초 만에 내 예산 보기</h2>
            <p className="text-small text-default-500">지금 화면의 숫자는 <b>예시</b>예요. 아래만 넣으면 지도와 순위가 전부 내 예산으로 바뀌어요. 이 브라우저에만 저장돼요.</p>
          </div>
          <button type="button" className="shrink-0 text-tiny text-default-400 underline" onClick={() => setHidden(true)}>예시로 먼저 둘러볼게요</button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-tiny font-semibold text-default-600">누구 돈으로 사나요?</span>
          <Choice value={d.household} onChange={set("household")} options={HOUSEHOLDS} />
        </div>

        <div className={`grid gap-4 ${solo ? "" : "sm:grid-cols-2"}`}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {!solo && <span className="text-tiny font-semibold text-default-600 sm:col-span-3">나</span>}
            <Money label="연소득 (세전)" value={d.income || null} onChange={set("income")} />
            <Money label="지금 모은 돈" value={d.cash || null} onChange={set("cash")} />
            <Money label="월 저축액" value={d.saving || null} onChange={set("saving")} />
          </div>
          {!solo && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <span className="text-tiny font-semibold text-default-600 sm:col-span-3">{d.household === "plan" ? "배우자 (예정)" : "배우자"}</span>
              <Money label="연소득 (세전)" value={d.partnerIncome || null} onChange={set("partnerIncome")} />
              <Money label="지금 모은 돈" value={d.partnerCash || null} onChange={set("partnerCash")} />
              <Money label="월 저축액" value={d.partnerSaving || null} onChange={set("partnerSaving")} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-tiny font-semibold text-default-600">{d.household === "plan" ? "결혼해서 집을 살 시점" : "언제 살 계획인가요?"}</span>
          <div className="flex flex-wrap gap-1.5">
            {WHEN.map(([y, l]) => (
              <button key={y} type="button" onClick={() => set("marry")(y)}
                className={`rounded-full border-2 px-3 py-1 text-tiny font-medium ${d.marry === y ? "border-primary bg-primary-50 text-primary" : "border-default-200 hover:bg-default-100"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-large bg-default-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          {ready ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1 num">
              <div><div className="text-tiny text-default-500">{now.label} 최대</div><div className="text-xl font-bold">{won(now.max_price_10k)}</div></div>
              {d.marry > 0 && <div><div className="text-tiny text-default-500">{later.label} 최대</div><div className="text-xl font-bold text-primary">{won(later.max_price_10k)}</div></div>}
            </div>
          ) : <p className="text-small text-default-500">연소득이나 모은 돈을 넣으면 여기에 살 수 있는 최대 가격이 나와요.</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="flat" onPress={() => { onSave(mine); onMore(); }}>직장·가진 집까지 자세히</Button>
            <Button color="primary" isDisabled={!ready} onPress={() => onSave(mine)}>내 예산으로 보기</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
