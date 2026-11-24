// /guide/: index of the 내집마련 가이드 articles.
import { Cta, Page } from "../_ui.jsx";
import { GUIDES } from "./list.js";

export const metadata = {
  title: "내집마련 가이드 · 서울 내집마련 전략판",
  description: "생애최초 대출 한도, 스트레스 DSR, 취득세·중개보수, 갈아타기 양도세, 신고가·급매, 전세가율을 실거래가와 실제 계산식으로 설명합니다.",
  alternates: { canonical: "/guide/" },
};

export default function GuideIndex() {
  return (
    <Page crumbs={[[null, "내집마련 가이드"]]} title="내집마련 가이드" sub="예시 숫자는 이 사이트의 계산기와 매일 갱신되는 실거래가 데이터로 만듭니다.">
      <p className="leading-relaxed text-default-700">
        집을 처음 사려고 할 때 막히는 대출 한도, 세금, 시세 읽는 법을 정리했습니다. 글에 나오는 예시는 앱과 같은 계산식으로 다시 계산되고,
        시세는 배포할 때마다 최신 실거래가로 바뀝니다.
      </p>
      <ul className="flex flex-col gap-3">
        {GUIDES.map(([slug, title, desc]) => (
          <li key={slug} className="rounded-large border border-default-200 p-4">
            <a href={`/guide/${slug}/`} className="font-semibold text-primary">{title}</a>
            <p className="text-small text-default-500">{desc}</p>
          </li>
        ))}
      </ul>
      <Cta>내 조건으로 바로 계산해 보기 →</Cta>
    </Page>
  );
}
