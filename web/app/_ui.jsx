// Shared pieces for the static, server-rendered pages (구별 시세, 예산별 동네, 시장, 청약, 가이드 …): plain HTML that
// search crawlers read without running the app, laid out as cards, big numbers and bars so people skim instead of read.
// Numbers always come from public/data at build time. Long tables sit in <details>: folded for people, still in the HTML.

export const asOf = (d) => String(d || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, mo, dd) => `${y}년 ${+mo}월 ${+dd}일`);
export const ym = (m) => String(m || "").replace(/^(\d{4})-(\d{2})$/, (_, y, mo) => `${y}년 ${+mo}월`);

export const NAV = [
  ["/tiers/", "🏆", "급지 순위"], ["/budget/", "💰", "예산별 동네"], ["/gu/", "🗺", "구별 시세"], ["/market/", "📈", "이번 달 시장"],
  ["/cheongyak/", "📝", "청약 일정"], ["/newbuild/", "🏢", "입주 예정"], ["/redev/", "🏗", "재건축·재개발"], ["/guide/", "📖", "내집마련 가이드"],
];

// icon + title + one-line lead on a tinted band, then the page body
export const Page = ({ crumbs = [], icon, title, sub, lead, stats, children, wide }) => (
  <main className={`mx-auto flex ${wide ? "max-w-3xl" : "max-w-2xl"} flex-col gap-4 px-4 pb-10 pt-4`}>
    <nav className="flex flex-wrap items-center gap-x-1 text-small text-default-500">
      <a href="/" className="font-medium text-primary">서울 내집마련 전략판</a>
      {crumbs.map(([href, label]) => <span key={label}>› {href ? <a href={href} className="text-primary">{label}</a> : label}</span>)}
    </nav>
    <header className="flex flex-col gap-3 rounded-large bg-gradient-to-br from-primary-50 to-content1 p-5 shadow-small">
      <div className="flex items-start gap-3">
        {icon && <span className="text-3xl leading-none" aria-hidden="true">{icon}</span>}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="break-keep text-xl font-bold leading-snug md:text-2xl">{title}</h1>
          {sub && <p className="text-tiny text-default-500">{sub}</p>}
        </div>
      </div>
      {lead && <p className="break-keep leading-relaxed text-default-700">{lead}</p>}
      {stats && <Stats items={stats} />}
    </header>
    {children}
    <SiteFooter />
  </main>
);

// big numbers: [[label, value, sub?, tone?]]
export const Stats = ({ items }) => (
  <div className={`grid gap-2 ${items.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
    {items.map(([label, value, sub, tone]) => (
      <div key={label} className="flex flex-col rounded-medium bg-content1 px-3 py-2 shadow-small">
        <span className="text-tiny text-default-500">{label}</span>
        <span className={`text-xl font-bold leading-tight ${tone === "up" ? "text-danger" : tone === "down" ? "text-primary" : tone === "accent" ? "text-primary" : ""}`}>{value}</span>
        {sub && <span className="text-tiny text-default-400">{sub}</span>}
      </div>
    ))}
  </div>
);

export const Section = ({ title, icon, id, desc, children }) => (
  <section id={id} className="flex scroll-mt-4 flex-col gap-3 rounded-large border border-default-200 bg-content1 p-4">
    {title && (
      <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-medium font-semibold">{icon && <span aria-hidden="true">{icon}</span>}{title}</h2>
        {desc && <p className="break-keep text-small text-default-500">{desc}</p>}
      </div>
    )}
    <div className="flex flex-col gap-3 break-keep leading-relaxed text-default-700">{children}</div>
  </section>
);

// horizontal bars: [{ label, value, text?, href?, tone? }]; signed values draw from a centre line
export function Bars({ rows, max, signed, unit = "" }) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value || 0)), 1);
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => {
        const w = `${Math.max(2, (Math.abs(r.value || 0) / m) * (signed ? 50 : 100))}%`, neg = (r.value || 0) < 0;
        const color = r.tone === "muted" ? "bg-default-300" : neg ? "bg-primary-300" : r.tone === "warm" ? "bg-warning-400" : "bg-primary-400";
        const label = r.href ? <a href={r.href} className="text-primary">{r.label}</a> : r.label;
        return (
          <li key={r.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-small">
            <span className="truncate">{label}</span>
            <span className="relative h-3 rounded-full bg-default-100">
              {signed && <span className="absolute inset-y-0 left-1/2 w-px bg-default-300" />}
              <span className={`absolute inset-y-0 rounded-full ${color}`} style={signed ? (neg ? { right: "50%", width: w } : { left: "50%", width: w }) : { left: 0, width: w }} />
            </span>
            <span className="min-w-[3.5rem] text-right font-medium tabular-nums">{r.text ?? `${r.value}${unit}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

// vertical bars for a short time series: [{ label, value, faded? }]
export function Columns({ rows, fmt = (v) => v }) {
  const m = Math.max(...rows.map((r) => r.value || 0), 1);
  return (
    <div className="flex h-36 items-end gap-1">
      {rows.map((r) => (
        <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums text-default-500">{fmt(r.value)}</span>
          <span className={`w-full rounded-t-small ${r.faded ? "bg-primary-100" : "bg-primary-400"}`} style={{ height: `${Math.max(3, (r.value / m) * 100)}px` }} />
          <span className="text-[10px] text-default-500">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

const TIER = { 1: "bg-primary-600 text-white", 2: "bg-primary-400 text-white", 3: "bg-primary-100 text-primary-700", 4: "bg-warning-100 text-warning-700", 5: "bg-default-100 text-default-600" };
export const TierBadge = ({ k }) => (k ? <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-tiny font-semibold ${TIER[k]}`}>{k}급지</span> : "–");

// small cards in a grid: [{ title, sub, value, badge, href }]
export const Cards = ({ items }) => (
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {items.map((c) => {
      const body = (
        <>
          <span className="flex items-center justify-between gap-1">
            <span className="truncate font-semibold">{c.title}</span>{c.badge}
          </span>
          {c.sub && <span className="truncate text-tiny text-default-500">{c.sub}</span>}
          {c.value && <span className="text-medium font-bold text-primary">{c.value}</span>}
        </>
      );
      const cls = "flex min-w-0 flex-col gap-0.5 rounded-medium border border-default-200 bg-content1 px-3 py-2";
      return c.href ? <a key={c.title + c.sub} href={c.href} className={`${cls} hover:border-primary-300`}>{body}</a> : <div key={c.title + c.sub} className={cls}>{body}</div>;
    })}
  </div>
);

// wrap: let every column wrap (key–value tables with long text); otherwise numbers stay on one line
export const Table = ({ head, rows, note, wrap }) => (
  <div className="flex flex-col gap-1">
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead><tr className="text-left text-default-500">{head.map((h) => <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-default-100">{r.map((c, j) => <td key={j} className={`break-keep py-1.5 pr-3 ${j ? (wrap ? "min-w-[9rem]" : "whitespace-nowrap") : "min-w-[4.5rem]"}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {note && <p className="text-tiny text-default-400">{note}</p>}
  </div>
);

// a long table folded behind one line; the rows stay in the HTML for search crawlers
export const Fold = ({ label, children }) => (
  <details className="group rounded-medium bg-default-50 px-3 py-2">
    <summary className="flex cursor-pointer list-none items-center justify-between text-small font-medium text-primary">
      {label}<span className="text-default-400 transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
    </summary>
    <div className="pt-2">{children}</div>
  </details>
);

export const Cta = ({ href = "/", children }) => (
  <a href={href} className="rounded-large bg-primary px-4 py-3 text-center font-semibold text-primary-foreground shadow-small">{children}</a>
);

export const Note = ({ children, icon = "💡" }) => (
  <p className="flex gap-2 break-keep rounded-medium bg-primary-50 px-3 py-2 text-small text-default-700"><span aria-hidden="true">{icon}</span><span>{children}</span></p>
);

export function SiteFooter() {
  return (
    <footer className="flex flex-col gap-3 pt-2 text-tiny leading-relaxed text-default-400">
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NAV.map(([href, icon, label]) => (
          <a key={href} href={href} className="flex items-center gap-1.5 rounded-medium border border-default-200 bg-content1 px-2.5 py-2 text-small text-default-700 hover:border-primary-300">
            <span aria-hidden="true">{icon}</span>{label}
          </a>
        ))}
      </nav>
      <p className="break-keep">
        자료: 국토교통부 실거래가 공개시스템(공공데이터포털), 공동주택관리정보시스템(K-apt), 한국부동산원 청약홈, 서울 열린데이터광장, 한국은행 ECOS 등 공공데이터.
        신고 기한(계약 후 30일) 때문에 최근 달은 거래가 덜 잡힙니다. 계산은 단순화한 추정이며 투자·대출 조언이 아닙니다.
        · <a href="/about/" className="underline">사이트 소개</a> · <a href="/privacy/" className="underline">개인정보처리방침</a>
      </p>
    </footer>
  );
}
