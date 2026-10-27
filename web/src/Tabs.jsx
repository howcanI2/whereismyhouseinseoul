import { useMemo, useState } from "react";
import { Button, ButtonGroup, Card, CardBody, CardHeader, Chip, Input, Link, Select, SelectItem, Skeleton, Slider, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { annuity, DSR, fmt, loanCap, LTV, palette, STRESS, useIsDark, won, YEARS } from "./lib.js";

const Box = ({ title, sub, children, className = "", right }) => (
  <Card shadow="sm" className={className}>
    <CardHeader className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-medium font-semibold">{title}</h3>
        {sub && <p className="text-small text-default-500">{sub}</p>}
      </div>
      {right}
    </CardHeader>
    <CardBody className="pt-0">{children}</CardBody>
  </Card>
);
const Loading = ({ h = 200 }) => <Skeleton className="w-full rounded-large" style={{ height: h }} />;

function ChartTip({ active, payload, label, unit = "" , fmtV = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-medium bg-content1 px-3 py-2 text-tiny shadow-medium num">
      <div className="mb-1 text-default-500">{label}</div>
      {payload.map((p) => <div key={p.dataKey} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name} {fmtV(p.value)}{unit}</div>)}
    </div>
  );
}

/* ---------------- 내 전략 ---------------- */
export function PlanTab({ data, dv, part }) {
  const b = (s) => data.budget?.find((x) => x.scenario === s);
  const card = (s, title) => {
    const r = b(s);
    return (
      <Box title={title} sub="살 수 있는 최대 가격 (추정)">
        {!r ? <Loading h={160} /> : (
          <div className="flex flex-col gap-3">
            <div className="text-4xl font-bold tracking-tight num text-primary">{won(r.max_price_10k)}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small num">
              <dt className="text-default-500">쓸 수 있는 현금</dt><dd>{won(r.cash_10k)}</dd>
              <dt className="text-default-500">대출</dt><dd>{won(r.loan_10k)}</dd>
              <dt className="text-default-500">대출을 막는 조건</dt><dd><Chip size="sm" variant="flat" color="warning">{r.binding}</Chip></dd>
              <dt className="text-default-500">월 상환 (현재 금리)</dt><dd className="font-semibold">{dv.pay ? won(dv.pay[s].monthly) : "—"}</dd>
            </dl>
            <p className="text-tiny text-default-400">{r.note}</p>
          </div>
        )}
      </Box>
    );
  };
  const fitList = (rows, k, pk, color) => (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.gu} className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-3 text-small num">
          <span className="font-medium">{r.gu}</span>
          <span className="h-2 rounded-full bg-default-100"><span className="block h-2 rounded-full" style={{ width: `${Math.min(100, r[k] * 2.5)}%`, background: color }} /></span>
          <span className="text-right">{fmt.share(r[k])}</span>
          <span />
          <span className="col-span-2 -mt-1 text-tiny text-default-400">{pk === "median_84_10k" ? "84㎡" : "59㎡"} 중위가 {won(r[pk])}</span>
        </li>
      ))}
    </ul>
  );
  const P = palette(useIsDark());
  if (part === "budget") return <div className="grid gap-4 md:grid-cols-2">{card("now", "지금 혼자 사면")}{card("later", "결혼 후 둘이 사면")}</div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="hidden">
        <Box title="데이터로 본 후보 구" sub="광화문 45분 이내(추정) 구 중 최근 6개월 내 예산 거래 비중이 높은 곳" className="md:col-span-2 xl:col-span-1">
          {!dv.fitLater ? <Loading h={200} /> : (
            <div className="flex flex-col gap-4">
              <div><Chip size="sm" color="primary" variant="flat" className="mb-2">결혼 후 예산 8~10.5억</Chip>{fitList(dv.fitLater, "share_later_band_pct", "median_84_10k", P.primary)}</div>
              <div><Chip size="sm" color="secondary" variant="flat" className="mb-2">지금 예산 4억 이하</Chip>{fitList(dv.fitNow, "share_now_band_pct", "median_59_10k", P.amber)}</div>
            </div>
          )}
        </Box>
      </div>
      <Box title="내집마련 로드맵" sub="지금부터 매수 시점까지 할 일을 순서대로 정리했습니다.">
        {!data.strategy ? <Loading h={240} /> : (
          <ol className="relative flex flex-col gap-0 border-l-2 border-primary-200 pl-6">
            {data.strategy.map((s) => (
              <li key={s.id} className="relative pb-5 last:pb-0">
                <span className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-primary bg-content1" />
                <div className="flex flex-wrap items-center gap-2"><Chip size="sm" color="primary" variant="flat">{s.phase}</Chip><span className="text-tiny text-default-500">{s.period}</span></div>
                <div className="mt-1 text-medium font-semibold">{s.action}</div>
                <div className="text-small text-default-500">{s.why}</div>
                <div className="mt-1 text-tiny text-default-400">확인: {s.check}</div>
              </li>
            ))}
          </ol>
        )}
      </Box>
    </div>
  );
}

/* ---------------- 대출·금리 ---------------- */
export function LoanTab({ data }) {
  const P = palette(useIsDark());
  const last = data.rates?.at(-1);
  const [scen, setScen] = useState("later");
  const base = data.budget?.find((b) => b.scenario === scen);
  const [over, setOver] = useState({});
  const val = (k, d) => (over[scen]?.[k] ?? d);
  const set = (k) => (v) => setOver((o) => ({ ...o, [scen]: { ...o[scen], [k]: v } }));
  const price = val("price", base?.max_price_10k ?? 60000), cash = val("cash", base?.cash_10k ?? 0), income = val("income", base?.income_10k ?? 0), rate = val("rate", last?.mortgage_pct ?? 4.5);
  const need = Math.max(0, price - cash);
  const lims = [["LTV 70% (생애최초)", price * LTV], ["주담대 상한", loanCap(price)], [`DSR 40% (금리+${STRESS}%p)`, (income * DSR) / (annuity(rate + STRESS) * 12)]];
  const maxLoan = Math.min(...lims.map((l) => l[1])), bind = lims.find((l) => l[1] === maxLoan), ok = need <= maxLoan;
  const loan = Math.min(need, maxLoan), mon = loan * annuity(rate);
  const barMax = Math.max(need, ...lims.map((l) => l[1])) || 1;
  const rates = (data.rates || []).map((r) => ({ ...r, label: r.month.slice(2).replace("-", ".") }));
  const facts = (g) => (data.loan_market || []).filter((r) => r.group === g);

  return (
    <div className="flex flex-col gap-4">
      <Box title="내 대출 계산기" sub="집값을 움직이면 필요한 대출이 서울 규제 안에 드는지와 월 상환액이 바로 나옵니다."
        right={<ButtonGroup size="sm" radius="full">{[["now", "지금 혼자"], ["later", "결혼 후 둘이"]].map(([k, l]) => <Button key={k} color={scen === k ? "primary" : "default"} variant={scen === k ? "solid" : "flat"} onPress={() => setScen(k)}>{l}</Button>)}</ButtonGroup>}>
        {!base || !last ? <Loading h={260} /> : (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-5">
              <Slider label="집값" color="primary" step={1000} minValue={20000} maxValue={150000} value={price} onChange={set("price")} getValue={(v) => won(v)} classNames={{ value: "text-large font-semibold num" }} />
              <div className="grid grid-cols-2 gap-3">
                <Input size="sm" type="number" label="쓸 수 있는 현금" endContent={<span className="text-tiny text-default-400">만원</span>} value={String(cash)} onValueChange={(v) => set("cash")(Number(v))} />
                <Input size="sm" type="number" label="연소득 (세전)" endContent={<span className="text-tiny text-default-400">만원</span>} value={String(income)} onValueChange={(v) => set("income")(Number(v))} />
                <Input size="sm" type="number" step="0.05" label="대출 금리" endContent={<span className="text-tiny text-default-400">%</span>} value={String(rate)} onValueChange={(v) => set("rate")(Number(v))} />
              </div>
              <p className="text-tiny text-default-400">금리 기본값은 {last.month} 주담대 신규 평균 {fmt.rate(last.mortgage_pct)} (한국은행). 30년 원리금균등 기준.</p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Chip color={ok ? "success" : "danger"} variant="flat" size="lg">{ok ? "대출 가능" : `대출 부족 ${won(need - maxLoan)}`}</Chip>
                <span className="text-small text-default-500">최대 대출 {won(maxLoan)} · 막는 조건: {bind[0]}</span>
              </div>
              <div className="flex flex-col gap-2">
                {[["필요한 대출", need, true], ...lims].map(([l, v, isNeed]) => (
                  <div key={l} className={`grid grid-cols-[9rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-small num ${l === bind[0] ? "font-semibold" : ""}`}>
                    <span className={isNeed ? "font-semibold" : "text-default-600"}>{l}</span>
                    <span className="h-2.5 rounded-full bg-default-100"><span className="block h-2.5 rounded-full" style={{ width: `${Math.max(1, Math.min(100, (v / barMax) * 100))}%`, background: isNeed ? (ok ? P.primary : P.rose) : l === bind[0] ? P.amber : P.muted }} /></span>
                    <span className="text-right">{won(v)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[["월 상환", won(mon) + "원"], ["연소득 대비", income ? `${((mon * 12) / income * 100).toFixed(1)}%` : "—"], ["30년 총이자", won(mon * YEARS * 12 - loan) + "원"]].map(([l, v]) => (
                  <div key={l} className="rounded-medium bg-default-100 px-3 py-2"><div className="text-tiny text-default-500">{l}</div><div className="text-large font-semibold num">{v}</div></div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Box>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Box title="주담대 금리 흐름" sub="예금은행 신규취급액 가중평균 (한국은행). 기준금리가 7·8월 연속 올라 주담대도 2022년 말 이후 최고입니다.">
          {!data.rates ? <Loading h={280} /> : (
            <div className="h-[280px]">
              <ResponsiveContainer>
                <LineChart data={rates} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke={P.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: P.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: P.axis }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis domain={[2, 5.2]} tickFormatter={(v) => `${v}%`} tick={{ fill: P.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip unit="%" fmtV={(v) => Number(v).toFixed(2)} />} />
                  <Line type="linear" dataKey="mortgage_pct" name="주담대 평균" stroke={P.primary} strokeWidth={2.5} dot={false} />
                  <Line type="linear" dataKey="fixed_pct" name="고정형" stroke={P.amber} strokeWidth={1.5} dot={false} />
                  <Line type="linear" dataKey="variable_pct" name="변동형" stroke={P.indigo} strokeWidth={1.5} dot={false} />
                  <Line type="stepAfter" dataKey="base_pct" name="기준금리" stroke={P.text} strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-tiny text-default-500">
            {[["주담대 평균", P.primary], ["고정형", P.amber], ["변동형", P.indigo], ["기준금리", P.text]].map(([l, c]) => <span key={l} className="inline-flex items-center gap-1"><span className="h-0.5 w-4" style={{ background: c }} />{l}</span>)}
          </div>
        </Box>
        <Box title="지금 은행 금리">
          {!data.loan_market ? <Loading /> : (
            <div className="flex flex-col divide-y divide-default-100">
              {facts("금리").map((r) => (
                <div key={r.id} className="flex flex-col gap-0.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3"><span className="text-small text-default-600">{r.label}</span><span className="text-medium font-semibold num">{r.value}</span></div>
                  <div className="text-tiny text-default-400">{r.date} · {r.note} <Link isExternal href={r.source} size="sm" className="text-tiny">출처</Link></div>
                </div>
              ))}
            </div>
          )}
        </Box>
      </div>
      <Box title="사람들은 얼마나 빌리나" sub="집 살 때 대출을 얼마나 쓰는지, 누가 빌리는지입니다.">
        {!data.loan_market ? <Loading /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {facts("대출 규모").map((r) => (
              <div key={r.id} className="flex flex-col gap-1 rounded-large bg-default-50 p-4">
                <span className="text-small text-default-500">{r.label}</span>
                <span className="text-2xl font-bold num">{r.value}</span>
                <span className="text-tiny text-default-400">{r.date} · {r.note}</span>
                <Link isExternal href={r.source} size="sm" className="text-tiny">출처</Link>
              </div>
            ))}
          </div>
        )}
      </Box>
    </div>
  );
}

/* ---------------- 시장 흐름 ---------------- */
export function MarketTab({ data }) {
  const P = palette(useIsDark());
  const [ga, setGa] = useState("구로구"), [gb, setGb] = useState("성북구");
  const gus = (data.gu_summary || []).map((r) => r.gu).sort();
  const seoul = (data.monthly || []).filter((r) => r.gu === "서울 전체").map((r) => ({ ...r, label: r.month.slice(2).replace("-", ".") }));
  const priceRows = useMemo(() => {
    const by = (g) => Object.fromEntries((data.monthly || []).filter((r) => r.gu === g).map((r) => [r.month, r.median_price_per_sqm_10k]));
    const s = by("서울 전체"), a = by(ga), b = by(gb);
    return seoul.map((r) => ({ label: r.label + (r.partial ? "*" : ""), seoul: s[r.month], a: a[r.month], b: b[r.month] }));
  }, [data.monthly, ga, gb]);
  const pick = (v, set) => (keys) => { const k = [...keys][0]; if (k) set(k); };
  return (
    <div className="flex flex-col gap-4">
      <Box title="서울 아파트 월별 거래량" sub="신고 기준 매매 건수. 4~5월은 양도세 중과 재개 전 거래가 몰렸고, 10월은 신고 기한이 남아 일부만 집계됐습니다.">
        {!data.monthly ? <Loading h={260} /> : (
          <div className="h-[260px]">
            <ResponsiveContainer>
              <BarChart data={seoul} margin={{ top: 10, right: 8, bottom: 0, left: -6 }}>
                <CartesianGrid stroke={P.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: P.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: P.axis }} />
                <YAxis tickFormatter={(v) => v.toLocaleString()} tick={{ fill: P.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: P.grid }} content={<ChartTip unit="건" fmtV={(v) => v.toLocaleString()} />} />
                <Bar dataKey="trades" name="거래" radius={[6, 6, 0, 0]} maxBarSize={36}>
                  {seoul.map((r) => <Cell key={r.month} fill={P.primary} fillOpacity={r.partial ? 0.35 : 1} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Box>
      <Box title="㎡당 중위 매매가 비교" sub="서울 전체와 두 구를 비교합니다. 단위 만원/㎡ (84㎡면 × 84). * 표시 달은 집계 중."
        right={<div className="flex w-full max-w-xs gap-2">
          <Select size="sm" aria-label="구 1" selectedKeys={[ga]} onSelectionChange={pick(ga, setGa)}>{gus.map((g) => <SelectItem key={g}>{g}</SelectItem>)}</Select>
          <Select size="sm" aria-label="구 2" selectedKeys={[gb]} onSelectionChange={pick(gb, setGb)}>{gus.map((g) => <SelectItem key={g}>{g}</SelectItem>)}</Select>
        </div>}>
        {!data.monthly ? <Loading h={280} /> : (
          <>
            <div className="h-[280px]">
              <ResponsiveContainer>
                <LineChart data={priceRows} margin={{ top: 10, right: 16, bottom: 0, left: -6 }}>
                  <CartesianGrid stroke={P.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: P.text, fontSize: 11 }} tickLine={false} axisLine={{ stroke: P.axis }} />
                  <YAxis domain={["auto", "auto"]} tickFormatter={(v) => v.toLocaleString()} tick={{ fill: P.text, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip unit="만/㎡" fmtV={(v) => Number(v).toLocaleString()} />} />
                  <Line type="linear" dataKey="seoul" name="서울 전체" stroke={P.text} strokeWidth={1.5} dot={false} />
                  <Line type="linear" dataKey="a" name={ga} stroke={P.primary} strokeWidth={2.5} dot={false} />
                  <Line type="linear" dataKey="b" name={gb} stroke={P.amber} strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-tiny text-default-500">
              {[["서울 전체", P.text], [ga, P.primary], [gb, P.amber]].map(([l, c]) => <span key={l} className="inline-flex items-center gap-1"><span className="h-0.5 w-4" style={{ background: c }} />{l}</span>)}
            </div>
          </>
        )}
      </Box>
    </div>
  );
}

/* ---------------- 예산 안 단지 ---------------- */
const COLS = [["apt", "단지"], ["gu", "구"], ["dong", "동"], ["area_sqm", "면적"], ["build_year", "준공"], ["median_price_10k", "중위가"], ["trades_6m", "6개월 거래"], ["last_trade", "최근 거래"], ["commute_min_est", "통근"]];
export function HomesTab({ data }) {
  const [band, setBand] = useState("결혼 후 (8~10.5억)");
  const [gu, setGu] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ column: "commute_min_est", direction: "ascending" });
  const gus = [...new Set((data.complexes || []).map((r) => r.gu))].sort();
  const rows = useMemo(() => {
    const k = sort.column, dir = sort.direction === "ascending" ? 1 : -1;
    return (data.complexes || []).filter((r) => r.band === band && (gu === "all" || r.gu === gu) && (!q || `${r.apt} ${r.dong}`.includes(q.trim())))
      .sort((a, b) => { const A = a[k], B = b[k]; const c = typeof A === "number" ? A - B : String(A).localeCompare(String(B), "ko"); return c * dir || b.trades_6m - a.trades_6m; });
  }, [data.complexes, band, gu, q, sort]);
  const cell = (r, k) => (k === "median_price_10k" ? won(r[k]) : k === "area_sqm" ? `${r[k]}㎡` : k === "commute_min_est" ? `${r[k]}분` : r[k] ?? "—");
  return (
    <Box title="예산 안 단지" sub="최근 6개월 2건 이상 거래된 40㎡ 이상 단지·평형 중 중위가가 예산에 드는 곳 (광화문 50분 이내 추정 구).">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ButtonGroup size="sm" radius="full">
          {["결혼 후 (8~10.5억)", "지금 (4억 이하)"].map((b) => <Button key={b} color={band === b ? "primary" : "default"} variant={band === b ? "solid" : "flat"} onPress={() => setBand(b)}>{b}</Button>)}
        </ButtonGroup>
        <Select size="sm" aria-label="구" className="max-w-[160px]" selectedKeys={[gu]} onSelectionChange={(k) => setGu([...k][0] || "all")}>
          {[<SelectItem key="all">전체 구</SelectItem>, ...gus.map((g) => <SelectItem key={g}>{g}</SelectItem>)]}
        </Select>
        <Input size="sm" isClearable className="max-w-[220px]" placeholder="단지·동 검색" value={q} onValueChange={setQ} />
        <span className="text-small text-default-500 num">{rows.length.toLocaleString()}곳</span>
      </div>
      {!data.complexes ? <Loading h={400} /> : (
        <Table aria-label="예산 안 단지" removeWrapper isHeaderSticky sortDescriptor={sort} onSortChange={setSort} classNames={{ base: "max-h-[600px] overflow-auto" }}>
          <TableHeader>{COLS.map(([k, l]) => <TableColumn key={k} allowsSorting align={["area_sqm", "build_year", "median_price_10k", "trades_6m", "commute_min_est"].includes(k) ? "end" : "start"}>{l}</TableColumn>)}</TableHeader>
          <TableBody items={rows} emptyContent="조건에 맞는 단지가 없습니다.">
            {(r) => <TableRow key={r.id}>{(k) => <TableCell className={`num ${k === "apt" ? "font-medium" : ""}`}>{cell(r, k)}</TableCell>}</TableRow>}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}

/* ---------------- 정책 ---------------- */
export function PolicyTab({ data }) {
  const groups = [...new Set((data.policy || []).map((r) => r.category))];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-default-500">2026-10-27 웹 조사 기준. "미확인"은 출처끼리 수치가 엇갈리거나 원문을 못 찾은 항목이라 계약 전 은행·청약홈에서 꼭 확인하세요.</p>
      {!data.policy ? <Loading h={400} /> : groups.map((g) => (
        <Box key={g} title={g}>
          <div className="flex flex-col divide-y divide-default-100">
            {data.policy.filter((r) => r.category === g).map((r) => (
              <div key={r.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r.item}</span><Chip size="sm" variant="flat" color={r.status === "확인" ? "success" : "warning"}>{r.status}</Chip></div>
                  <span className="text-small num">{r.value}</span>
                  <span className="text-tiny text-default-400">{r.date} · <Link isExternal href={r.source} size="sm" className="text-tiny">원문</Link></span>
                </div>
                <div className="rounded-medium bg-primary-50 px-3 py-2 text-small text-primary-700 dark:text-primary-700"><span className="font-semibold">나에게: </span>{r.impact}</div>
              </div>
            ))}
          </div>
        </Box>
      ))}
    </div>
  );
}
