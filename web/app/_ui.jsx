// Shared pieces for the static, server-rendered pages (구별 시세, 예산별 동네, 시장, 청약, 가이드 …): plain HTML that
// search crawlers read without running the app. Numbers always come from public/data at build time.

export const asOf = (d) => String(d || "").replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, mo, dd) => `${y}년 ${+mo}월 ${+dd}일`);
export const ym = (m) => String(m || "").replace(/^(\d{4})-(\d{2})$/, (_, y, mo) => `${y}년 ${+mo}월`);

export const NAV = [
  ["/tiers/", "급지 순위"], ["/gu/", "구별 시세"], ["/budget/", "예산별 동네"], ["/market/", "이번 달 시장"],
  ["/cheongyak/", "청약 일정"], ["/newbuild/", "입주 예정"], ["/redev/", "재건축·재개발"], ["/guide/", "내집마련 가이드"],
];

export const Page = ({ crumbs = [], title, sub, children, wide }) => (
  <main className={`mx-auto flex ${wide ? "max-w-3xl" : "max-w-2xl"} flex-col gap-5 px-4 py-8`}>
    <nav className="text-small text-default-500">
      <a href="/" className="text-primary">서울 내집마련 전략판</a>
      {crumbs.map(([href, label]) => <span key={label}> › {href ? <a href={href} className="text-primary">{label}</a> : label}</span>)}
    </nav>
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold">{title}</h1>
      {sub && <p className="text-small text-default-500">{sub}</p>}
    </header>
    {children}
    <SiteFooter />
  </main>
);

export const Section = ({ title, id, children }) => (
  <section id={id} className="flex scroll-mt-4 flex-col gap-2">
    {title && <h2 className="text-large font-semibold">{title}</h2>}
    <div className="flex flex-col gap-2 leading-relaxed text-default-700">{children}</div>
  </section>
);

// wrap: let every column wrap (key–value tables with long text); otherwise numbers stay on one line
export const Table = ({ head, rows, note, wrap }) => (
  <div className="flex flex-col gap-1">
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <thead><tr className="text-left text-default-500">{head.map((h) => <th key={h} className="whitespace-nowrap py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-default-100">{r.map((c, j) => <td key={j} className={`break-keep py-1 pr-3 ${j ? (wrap ? "min-w-[9rem]" : "whitespace-nowrap") : "min-w-[4.5rem]"}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
    {note && <p className="text-tiny text-default-400">{note}</p>}
  </div>
);

export const Cta = ({ href = "/", children }) => (
  <a href={href} className="rounded-large bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">{children}</a>
);

export const Note = ({ children }) => <p className="rounded-medium bg-default-100 px-3 py-2 text-small text-default-600">{children}</p>;

export function SiteFooter() {
  return (
    <footer className="flex flex-col gap-2 border-t border-default-200 pt-4 text-tiny leading-relaxed text-default-400">
      <nav className="flex flex-wrap gap-x-3 gap-y-1 text-small">
        {NAV.map(([href, label]) => <a key={href} href={href} className="text-primary">{label}</a>)}
      </nav>
      <p>
        자료: 국토교통부 실거래가 공개시스템(공공데이터포털), 공동주택관리정보시스템(K-apt), 한국부동산원 청약홈, 서울 열린데이터광장, 한국은행 ECOS 등 공공데이터.
        신고 기한(계약 후 30일) 때문에 최근 달은 거래가 덜 잡힙니다. 계산은 단순화한 추정이며 투자·대출 조언이 아닙니다.
        · <a href="/about/" className="underline">사이트 소개</a> · <a href="/privacy/" className="underline">개인정보처리방침</a>
      </p>
    </footer>
  );
}
