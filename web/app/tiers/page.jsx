// /tiers/: 서울 아파트 급지 순위, the same grades as the app's 급지 기준 tab, as plain HTML for search crawlers.
// Rebuilt on every deploy, so the cut-offs and lists follow the daily data refresh.
import { GU, readJson, slugOf, won } from "../gu/data";
import { buildTiers, man, median, MIN_YEAR, tierRange } from "../../src/tiers.js";

function load() {
  const ins = readJson("insights.json");
  const t = buildTiers(ins, readJson("dong_summary.json"), readJson("gu_summary.json"));
  const tiers = t.dong.cut.map((c) => {
    const ds = t.dong.rows.filter((r) => t.dong.tier.get(r.key) === c.k).sort((a, b) => b.ppp - a.ppp);
    return { ...c, ds, m84: median(ds.map((r) => r.m84)), m59: median(ds.map((r) => r.m59)),
      gus: t.gu.rows.filter((g) => t.gu.tier.get(g.key) === c.k).sort((a, b) => b.ppp - a.ppp) };
  });
  return { t, tiers, meta: ins.meta };
}
const asOf = (m) => m.as_of.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, mo, d) => `${y}년 ${+mo}월 ${+d}일`);

export function generateMetadata() {
  const { tiers, meta } = load();
  const top = tiers[0].gus.map((g) => g.name).join("·");
  return {
    title: "서울 아파트 급지 순위 (실거래가 기준) · 서울 내집마련 전략판",
    description: `${asOf(meta)} 기준 서울 법정동을 최근 1년 실거래 평당가로 1~5급지로 나눴습니다. 1급지 평당 ${man(tiers[0].lo)} 이상(${top}), 급지별 84㎡ 가격과 동네 목록.`,
    alternates: { canonical: "/tiers/" },
    openGraph: { title: "서울 아파트 급지 순위 (실거래가 기준)", url: "/tiers/", type: "article" },
  };
}

const Th = ({ children }) => <th className="whitespace-nowrap py-1 pr-3 text-left font-medium">{children}</th>;
const Td = ({ children, wrap }) => <td className={`py-1 pr-3 ${wrap ? "" : "whitespace-nowrap"}`}>{children}</td>;

export default function TiersPage() {
  const { t, tiers, meta } = load();
  const guLink = (name) => <a href={`/gu/${slugOf(name)}/`} className="text-primary">{name}</a>;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <nav className="text-small text-default-500"><a href="/" className="text-primary">서울 내집마련 전략판</a> › 급지 순위</nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">서울 아파트 급지 순위 (실거래가 기준)</h1>
        <p className="text-small text-default-500">{asOf(meta)} 기준 · 국토교통부 실거래가 신고분 ({meta.notes.p12})</p>
      </header>

      <p className="leading-relaxed text-default-700">
        흔히 말하는 &lsquo;급지&rsquo;를 실제 거래 가격으로 다시 매겨 봤습니다. 최근 1년 아파트 매매가 {MIN_YEAR}건 이상인 서울 법정동 {t.dong.rows.length}곳을
        3.3㎡당 실거래가(평당가) 순으로 줄 세워 똑같이 다섯 등분했고, 구는 같은 기준선에 구 전체 평균을 대어 급지를 정했습니다.
        같은 구 안에서도 동마다 급지가 크게 다를 수 있어, 동 단위로 보는 것이 더 정확합니다.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-large font-semibold">급지별 기준</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead><tr className="text-default-500"><Th>급지</Th><Th>평당가</Th><Th>84㎡ 대략</Th><Th>59㎡ 대략</Th><Th>구 평균이 이 급지인 곳</Th></tr></thead>
            <tbody>
              {tiers.map((c) => (
                <tr key={c.k} className="border-t border-default-100">
                  <Td><a href={`#tier-${c.k}`} className="font-semibold text-primary">{c.k}급지</a></Td>
                  <Td>{tierRange(c)}</Td><Td>{won(c.m84)}</Td><Td>{won(c.m59)}</Td>
                  <Td wrap>{c.gus.length ? c.gus.map((g, i) => <span key={g.key}>{i ? ", " : ""}{guLink(g.name)}</span>) : "–"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-tiny text-default-400">84㎡·59㎡ 대략 가격은 그 급지에 속한 동들의 최근 6개월 중위가를 다시 중간값으로 낸 값입니다.</p>
      </section>

      <a href="/#money" className="rounded-large bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">내 소득·모은 돈으로 몇 급지까지 닿는지 계산해 보기 →</a>

      {tiers.map((c) => (
        <section key={c.k} id={`tier-${c.k}`} className="flex flex-col gap-2 scroll-mt-4">
          <h2 className="text-large font-semibold">{c.k}급지 동네 <span className="text-small font-normal text-default-500">평당 {tierRange(c)} · {c.ds.length}곳</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead><tr className="text-default-500"><Th>동</Th><Th>구</Th><Th>평당가</Th><Th>84㎡ 중위가</Th><Th>59㎡ 중위가</Th><Th>1년 거래</Th></tr></thead>
              <tbody>
                {c.ds.map((r) => (
                  <tr key={r.key} className="border-t border-default-100">
                    <Td>{r.name}</Td><Td>{guLink(r.gu)}</Td><Td>{man(r.ppp)}</Td><Td>{won(r.m84)}</Td><Td>{won(r.m59)}</Td><Td>{r.n12}건</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-large font-semibold">구별 급지</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead><tr className="text-default-500"><Th>구</Th><Th>급지</Th><Th>평당가</Th><Th>84㎡ 중위가</Th><Th>1년 거래</Th></tr></thead>
            <tbody>
              {[...t.gu.rows].sort((a, b) => b.ppp - a.ppp).map((g) => (
                <tr key={g.key} className="border-t border-default-100">
                  <Td>{guLink(g.name)}</Td><Td>{t.gu.tier.get(g.key)}급지</Td><Td>{man(g.ppp)}</Td><Td>{won(g.m84)}</Td><Td>{g.n12.toLocaleString("ko-KR")}건</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-tiny leading-relaxed text-default-400">
        급지는 이 사이트가 실거래가로 매긴 자체 분류이며, 부동산 커뮤니티 등에서 흔히 말하는 급지와 다를 수 있습니다. 평당가는 면적·연식이 섞인 거래 전체 기준이라
        재건축을 앞둔 오래된 단지가 많은 동은 높게 나올 수 있고, 학군·교통·신축 여부는 반영하지 않습니다. 신고 기한(계약 후 30일) 때문에 최근 달은 거래가 덜 잡힙니다.
        자료: 국토교통부 실거래가 공개시스템(공공데이터포털), 공동주택관리정보시스템(K-apt). 참고용 정보이며 투자 조언이 아닙니다. · <a href="/privacy/" className="underline">개인정보처리방침</a>
      </footer>
    </main>
  );
}
