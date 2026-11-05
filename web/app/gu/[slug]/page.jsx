// One static page per 서울 구: 시세 요약, 동별·단지별 거래, 최근 신고가·급매. Plain server-rendered HTML (no app JS needed),
// so Naver/Google can index "마포구 아파트 실거래가" style searches; the app link takes visitors to the budget tools.
import { GU, guData, nameOf, slugOf, won, pct } from "../data";

export const dynamicParams = false;
export function generateStaticParams() {
  return GU.map(([, slug]) => ({ slug }));
}

const asOf = (m) => m.as_of.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, mo, d) => `${y}년 ${+mo}월 ${+d}일`);

export function generateMetadata({ params }) {
  const name = nameOf(params.slug);
  const { g, sum } = guData(name);
  const p = g.p12;
  return {
    title: `${name} 아파트 실거래가·시세 · 서울 내집마련 전략판`,
    description: `${name} 아파트 최근 6개월 실거래 기준 84㎡ 중위가 ${won(sum.median_84_10k ?? g.p6.p84)}, 59㎡ ${won(sum.median_59_10k)}, 최근 1년 거래 ${p.n.toLocaleString("ko-KR")}건. 동별·단지별 거래와 최근 신고가·급매를 국토교통부 실거래가로 정리했습니다.`,
    alternates: { canonical: `/gu/${params.slug}/` },
    openGraph: { title: `${name} 아파트 실거래가·시세`, url: `/gu/${params.slug}/`, type: "article" },
  };
}

const Card = ({ title, children }) => (
  <section className="flex flex-col gap-2 rounded-large border border-default-200 p-4">
    <h2 className="text-medium font-semibold">{title}</h2>
    {children}
  </section>
);
const Stat = ({ label, value, sub }) => (
  <div className="flex flex-col rounded-medium bg-default-100 px-3 py-2">
    <span className="text-tiny text-default-500">{label}</span>
    <span className="text-large font-semibold">{value}</span>
    {sub && <span className="text-tiny text-default-400">{sub}</span>}
  </div>
);
const T = ({ head, rows }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-small">
      <thead><tr className="text-left text-default-500">{head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-default-100">{r.map((c, j) => <td key={j} className={`py-1 pr-3 ${j ? "whitespace-nowrap" : ""}`}>{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);
const Deal = (d) => [`${d.dong} ${d.apt}`, `${d.area}㎡ · ${d.floor}층`, won(d.price), `${won(d.ref)} 대비 ${pct(d.gap_pct)}`, d.date.slice(5).replace("-", "/")];

export default function GuPage({ params }) {
  const name = nameOf(params.slug);
  const { g, sum, dongs, apts, highs, dips, meta } = guData(name);
  const [p3, p12] = [g.p3, g.p12];
  const idx = GU.findIndex(([n]) => n === name);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <nav className="text-small text-default-500"><a href="/" className="text-primary">서울 내집마련 전략판</a> › <a href="/gu/" className="text-primary">구별 시세</a> › {name}</nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{name} 아파트 실거래가·시세</h1>
        <p className="text-small text-default-500">{asOf(meta)} 기준 · 국토교통부 실거래가 신고분 ({meta.notes.p12})</p>
      </header>

      <p className="leading-relaxed text-default-700">
        {name}에서는 최근 1년 동안 아파트 매매 {p12.n.toLocaleString("ko-KR")}건이 신고됐습니다.
        최근 6개월 거래로 본 전용 84㎡ 중위가는 {won(sum.median_84_10k ?? g.p6.p84)}, 59㎡는 {won(sum.median_59_10k)}이고,
        같은 단지·같은 평형끼리 비교한 1년 가격 변화는 {pct(p12.chg)}입니다.
        {p3.n_prev && p3.vol_chg != null
          ? ` 최근 3개월 거래는 ${p3.n}건으로 그 전 3개월(${p3.n_prev}건)보다 ${Math.abs(p3.vol_chg).toFixed(1)}% ${p3.vol_chg < 0 ? "줄었습니다" : "늘었습니다"}(최근 달은 신고가 다 들어오지 않아 적게 잡힙니다).`
          : ""}
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="84㎡ 중위가" value={won(sum.median_84_10k ?? g.p6.p84)} sub="최근 6개월" />
        <Stat label="59㎡ 중위가" value={won(sum.median_59_10k)} sub="최근 6개월" />
        <Stat label="1년 가격 변화" value={pct(p12.chg)} sub="같은 단지·평형 기준" />
        <Stat label="전세가율" value={sum.jeonse_ratio_pct != null ? `${sum.jeonse_ratio_pct}%` : "–"} sub="매매 대비 전세" />
      </div>

      <Card title="거래 가격 분포 (최근 1년)">
        <p className="text-small text-default-600">
          모든 면적을 합친 거래가 기준으로 하위 25%는 {won(p12.q[5])} 이하, 중간값은 {won(p12.q[10])}, 상위 25%는 {won(p12.q[15])} 이상입니다.
          최근 3개월 거래 중 신고가(그 단지·평형의 최근 2년 최고가 경신) 비율은 {p3.high_share != null ? `${p3.high_share}%` : "–"}
          {p3.dip_n ? `, 직전 시세보다 10% 이상 싸게 팔린 거래는 ${p3.dip_n}건` : ""}입니다.
        </p>
      </Card>

      {dongs.length > 0 && (
        <Card title={`${name} 동별 시세`}>
          <T head={["동", "84㎡ 중위가(6개월)", "59㎡ 중위가(6개월)", "1년 거래"]}
            rows={dongs.map((d) => [d.dong, won(d.median_84_10k), won(d.median_59_10k), `${d.trades_12m}건`])} />
        </Card>
      )}

      {apts.length > 0 && (
        <Card title="최근 6개월 거래가 많은 단지">
          <T head={["단지", "준공", "거래", "중위가", "가격 범위"]}
            rows={apts.map((a) => [`${a.dong} ${a.apt}`, a.build_year ? `${a.build_year}년` : "–", `${a.trades_6m}건`,
              `${won(a.median_price_10k)} (${a.median_area_sqm}㎡)`, `${won(a.min_price_10k)}~${won(a.max_price_10k)}`])} />
        </Card>
      )}

      {highs.length > 0 && (
        <Card title="최근 신고가 거래">
          <T head={["단지", "면적·층", "거래가", "이전 최고가 대비", "날짜"]} rows={highs.map(Deal)} />
        </Card>
      )}
      {dips.length > 0 && (
        <Card title="최근 급매 의심 거래">
          <T head={["단지", "면적·층", "거래가", "직전 6개월 중위가 대비", "날짜"]} rows={dips.map(Deal)} />
          <p className="text-tiny text-default-400">시세보다 낮게 신고된 거래일 뿐, 특수한 사정이 있는 거래일 수 있습니다. 1~2층·직거래·가족 간 거래로 보이는 건은 뺐습니다.</p>
        </Card>
      )}

      <a href="/" className="rounded-large bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">
        내 소득·모은 돈으로 {name}에서 살 수 있는 단지 찾아보기 →
      </a>

      <nav className="flex flex-col gap-1 text-small">
        <span className="text-default-500">다른 구 시세</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {GU.map(([n, s]) => (n === name ? null : <a key={s} href={`/gu/${s}/`} className="text-primary">{n}</a>))}
        </div>
        <div className="flex gap-3 pt-1">
          {idx > 0 && <a href={`/gu/${GU[idx - 1][1]}/`} className="text-primary">← {GU[idx - 1][0]}</a>}
          {idx < GU.length - 1 && <a href={`/gu/${GU[idx + 1][1]}/`} className="text-primary">{GU[idx + 1][0]} →</a>}
        </div>
      </nav>

      <footer className="text-tiny text-default-400">
        자료: 국토교통부 실거래가 공개시스템(공공데이터포털), 공동주택관리정보시스템(K-apt). 신고 기한(계약 후 30일) 때문에 최근 달은 거래가 덜 잡힙니다.
        참고용 정보이며 투자 조언이 아닙니다. · <a href="/privacy/" className="underline">개인정보처리방침</a>
      </footer>
    </main>
  );
}
