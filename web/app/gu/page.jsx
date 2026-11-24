// /gu/: all 25 구 with their 84㎡ median and 1-year change, linking to each 구 page.
import { GU, guData, won, pct } from "./data";
import { asOf, Cta, Fold, Page, Section, Table } from "../_ui.jsx";

export const metadata = {
  title: "서울 구별 아파트 실거래가·시세 · 서울 내집마련 전략판",
  description: "서울 25개 구의 아파트 84㎡·59㎡ 중위가와 1년 가격 변화, 거래량을 국토교통부 실거래가로 한눈에 비교합니다.",
  alternates: { canonical: "/gu/" },
};

export default function GuIndex() {
  const rows = GU.map(([name, slug]) => ({ slug, ...guData(name), p84: guData(name).sum.median_84_10k ?? guData(name).g.p6.p84 })).sort((a, b) => (b.p84 || 0) - (a.p84 || 0));
  const max = rows[0].p84;
  return (
    <Page wide icon="🗺" crumbs={[[null, "구별 시세"]]} title="서울 구별 아파트 시세" sub={`${asOf(rows[0].meta.as_of)} 기준 · 국토교통부 실거래가`}
      lead="84㎡ 중위가가 높은 구부터. 구를 누르면 동별·단지별 시세와 최근 신고가·급매를 볼 수 있어요.">
      <Section icon="🏙" title="84㎡ 중위가 (최근 6개월)">
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.slug}>
              <a href={`/gu/${r.slug}/`} className="grid grid-cols-[5.5rem_1fr_auto_auto] items-center gap-2 rounded-small text-small hover:bg-default-50">
                <span className="text-primary">{r.name}</span>
                <span className="h-3 rounded-full bg-default-100"><span className="block h-3 rounded-full bg-primary-400" style={{ width: `${((r.p84 || 0) / max) * 100}%` }} /></span>
                <span className="w-14 text-right font-medium tabular-nums">{won(r.p84)}</span>
                <span className={`w-14 text-right text-tiny tabular-nums ${r.g.p12.chg > 0 ? "text-danger" : "text-primary"}`}>{pct(r.g.p12.chg)}</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="text-tiny text-default-400">오른쪽 %는 같은 단지·평형 기준 최근 1년 가격 변화예요.</p>
        <Fold label="59㎡·거래량까지 표로 보기">
          <Table head={["구", "84㎡", "59㎡", "1년 변화", "1년 거래"]} rows={rows.map((r) => [r.name, won(r.p84), won(r.sum.median_59_10k), pct(r.g.p12.chg), `${r.g.p12.n.toLocaleString("ko-KR")}건`])} />
        </Fold>
      </Section>
      <Cta>내 예산으로 살 수 있는 동네 지도에서 보기 →</Cta>
    </Page>
  );
}
