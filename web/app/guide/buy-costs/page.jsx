// Guide: 집값 말고 드는 돈. 취득세·중개보수·재산세 by price, computed with the app's acqTax / brokerFee / propTax.
import { won } from "../../gu/data";
import { acqTax, brokerFee, propTax, PUBLIC_RATIO } from "../../../src/money.js";
import { Cta, Note, Page, Section, Table } from "../../_ui.jsx";

export const metadata = {
  title: "아파트 살 때 집값 말고 드는 돈: 취득세·중개보수·재산세 · 서울 내집마련 전략판",
  description: "5억부터 15억까지 가격대별 1주택 취득세(지방교육세 포함), 생애최초 감면, 중개보수 상한, 1년 재산세를 계산해 표로 정리했습니다.",
  alternates: { canonical: "/guide/buy-costs/" },
};

const PRICES = [50000, 60000, 70000, 80000, 90000, 100000, 120000, 150000];

export default function BuyCosts() {
  const ex = 90000, a = acqTax(ex, { first: true }), f = brokerFee(ex);
  return (
    <Page crumbs={[["/guide/", "내집마련 가이드"], [null, "사는 데 드는 돈"]]} title="아파트 살 때 집값 말고 드는 돈" sub="1주택(무주택자가 한 채 사는 경우), 전용 84㎡ 기준">
      <p className="leading-relaxed text-default-700">
        예산을 세울 때 가장 자주 빠뜨리는 것이 세금과 수수료입니다. 9억 아파트를 생애최초로 사면 취득세 {won(a.total)}과 중개보수 상한 {won(f.total)}을 합쳐
        <b> 약 {won(a.total + f.total)}</b>이 집값과 별도로 필요하고, 이 돈은 대출로 충당할 수 없어 모은 돈에서 나가야 합니다.
      </p>
      <Section title="가격대별 한 번에 드는 돈">
        <Table head={["집값", "취득세율", "취득세 (생애최초)", "취득세 (일반)", "중개보수 상한", "합계 (생애최초)"]} rows={PRICES.map((P) => {
          const f1 = acqTax(P, { first: true }), f0 = acqTax(P), b = brokerFee(P);
          return [won(P), `${f0.rate}%`, won(f1.total), won(f0.total), `${won(b.total)} (${b.rate}%)`, won(f1.total + b.total)];
        })} note="취득세는 지방교육세(취득세의 10%) 포함, 85㎡ 초과면 농어촌특별세 0.2%가 더 붙습니다. 중개보수는 법정 상한이며 부가세는 별도, 실제로는 협의로 정합니다. 법무사 수수료·국민주택채권 할인 비용 등 등기 비용은 넣지 않았습니다." />
      </Section>
      <Section title="계산 규칙">
        <ul className="list-disc pl-5">
          <li><b>취득세율:</b> 6억 이하 1%, 9억 초과 3%이고, 6~9억 사이는 가격에 따라 1%에서 3%로 올라갑니다.</li>
          <li><b>생애최초 감면:</b> 12억 이하 주택이면 취득세를 200만 원까지 줄여 줍니다.</li>
          <li><b>중개보수 상한:</b> 2억~9억 0.4%, 9~12억 0.5%, 12~15억 0.6%, 15억 이상 0.7%입니다.</li>
        </ul>
      </Section>
      <Section title="가진 동안 매년 드는 돈: 재산세">
        <Table head={["집값", "공시가격(추정)", "1년 재산세"]} rows={PRICES.map((P) => { const t = propTax(P); return [won(P), won(t.pub), `${won(t.total)}${t.comp ? " + 종부세" : ""}`]; })}
          note={`공시가격은 시세의 ${Math.round(PUBLIC_RATIO * 100)}%로 가정한 추정입니다. 1주택 공정시장가액비율과 공시 9억 이하 1주택 특례세율, 도시지역분·지방교육세를 포함했습니다. 공시가 12억을 넘으면 종합부동산세가 따로 붙습니다(미포함).`} />
      </Section>
      <Note>앱에서 단지를 누르면 그 단지 가격으로 취득세·중개보수·대출 이자·재산세가 한 번에 계산됩니다.</Note>
      <Cta>관심 단지로 사는 데 드는 돈 계산하기 →</Cta>
    </Page>
  );
}
