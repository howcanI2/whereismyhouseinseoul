// /gu/: all 25 구 with their 84㎡ median and 1-year change, linking to each 구 page.
import { GU, guData, won, pct } from "./data";
import Feedback from "../../src/Feedback.jsx";

export const metadata = {
  title: "서울 구별 아파트 실거래가·시세 · 서울 내집마련 전략판",
  description: "서울 25개 구의 아파트 84㎡·59㎡ 중위가와 1년 가격 변화, 거래량을 국토교통부 실거래가로 한눈에 비교합니다.",
  alternates: { canonical: "/gu/" },
};

export default function GuIndex() {
  const rows = GU.map(([name, slug]) => ({ slug, ...guData(name) }));
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
      <nav className="text-small text-default-500"><a href="/" className="text-primary">서울 내집마련 전략판</a> › 구별 시세</nav>
      <h1 className="text-2xl font-bold">서울 구별 아파트 실거래가·시세</h1>
      <p className="text-small text-default-500">{rows[0].meta.as_of} 기준 · 국토교통부 실거래가 신고분. 중위가는 최근 6개월, 가격 변화는 같은 단지·평형 기준 최근 1년입니다.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead><tr className="text-left text-default-500"><th className="py-1 pr-3 font-medium">구</th><th className="py-1 pr-3 font-medium">84㎡ 중위가</th><th className="py-1 pr-3 font-medium">59㎡ 중위가</th><th className="py-1 pr-3 font-medium">1년 변화</th><th className="py-1 pr-3 font-medium">1년 거래</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug} className="border-t border-default-100">
                <td className="py-1 pr-3"><a href={`/gu/${r.slug}/`} className="text-primary">{r.name}</a></td>
                <td className="py-1 pr-3">{won(r.sum.median_84_10k ?? r.g.p6.p84)}</td>
                <td className="py-1 pr-3">{won(r.sum.median_59_10k)}</td>
                <td className="py-1 pr-3">{pct(r.g.p12.chg)}</td>
                <td className="py-1 pr-3">{r.g.p12.n.toLocaleString("ko-KR")}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a href="/" className="rounded-large bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">내 예산으로 살 수 있는 동네 지도에서 보기 →</a>
      <Feedback />
      <footer className="text-tiny text-default-400">자료: 국토교통부 실거래가 공개시스템(공공데이터포털). 참고용 정보이며 투자 조언이 아닙니다.</footer>
    </main>
  );
}
