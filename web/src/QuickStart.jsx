"use client";
// First visit: the numbers on screen are an example, so ask for the few things that decide a budget right here,
// above the tabs, and show what they buy as they are typed. 직장·가진 집·대출 조건 stay in the full 내 조건 sheet.
import { useState } from "react";
import { Button, Card, CardBody } from "@heroui/react";
import { budgetsFrom, HOUSEHOLDS, won } from "./lib.js";
import { Choice, Money } from "./Profile.jsx";
import { buildTiers } from "./tiers.js";

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

// Right after the quick start is saved: answer "where can I buy?" in one card instead of leaving it to the map.
// Same rule as the 급지 순위 card: 동 whose 6-month 84㎡ (else 59㎡) median fits the budget, best 급지 first, busiest first.
export function FirstResult({ data, onMap, onRank, onClose }) {
  const yrs = Number(data.budget?.[1]?.years) || 0, b = data.budget?.[yrs ? 1 : 0];
  const t = buildTiers(data.insights, data.dong_summary, data.gu_summary);
  if (!b || !t) return null;
  const B = b.max_price_10k;
  const fit = (k) => t.dong.rows.filter((r) => r[k] && r[k] <= B && r.n6 >= 10).map((r) => ({ ...r, tier: t.dong.tier.get(r.key) })).sort((x, y) => x.tier - y.tier || y.n6 - x.n6);
  const d84 = fit("m84"), d59 = fit("m59"), list = d84.length ? d84 : d59, area = d84.length ? "84㎡" : "59㎡";
  const nApt = (data.apts || []).filter((a) => a.trades_6m && a.median_price_10k != null && a.median_price_10k <= B).length;
  const top = list.slice(0, 3);
  return (
    <Card shadow="sm" className="border-2 border-primary-200">
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-large font-bold">내 예산 {won(B)}{yrs ? ` (${b.short})` : ""}으로 살 수 있는 곳</h2>
            {list.length ? (
              <p className="text-small text-default-600">
                {area} 기준 <b>동 {list.length}곳</b>, 최근 6개월 거래가 있는 <b>단지 {nApt.toLocaleString("ko-KR")}곳</b>이 예산 안에 들어요.
                {!d84.length && " (84㎡는 아직 예산 밖이라 59㎡로 봤어요)"}
              </p>
            ) : (
              <p className="text-small text-default-600">
                지금 예산으로는 59㎡·84㎡ 중위가가 드는 동이 아직 없어요. 최근 거래 기준 예산 안 단지는 {nApt.toLocaleString("ko-KR")}곳이에요(주로 소형).
                &lsquo;내 조건&rsquo;에서 매수 시점을 늦추거나 저축액을 넣으면 달라져요.
              </p>
            )}
          </div>
          <button type="button" className="shrink-0 text-tiny text-default-400 underline" onClick={onClose}>닫기</button>
        </div>
        {top.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {top.map((r, i) => (
              <button key={r.key} type="button" onClick={() => onMap(r.key)}
                className="flex flex-col rounded-medium bg-default-100 px-3 py-2 text-left hover:bg-default-200">
                <span className="text-tiny text-default-500">{i + 1}순위 · {r.tier}급지</span>
                <span className="text-small font-semibold">{r.gu} {r.name}</span>
                <span className="text-tiny text-default-500 num">{area} {won(area === "84㎡" ? r.m84 : r.m59)} · 6개월 {r.n6}건</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {top.length > 0 && <Button color="primary" onPress={() => onMap(top[0].key)}>지도에서 보기</Button>}
          <Button variant="flat" onPress={onRank}>동네 순위 전체 보기</Button>
        </div>
      </CardBody>
    </Card>
  );
}
