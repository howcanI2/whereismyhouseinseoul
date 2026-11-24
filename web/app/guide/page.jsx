// /guide/: index of the 내집마련 가이드 articles.
import { Cta, Page } from "../_ui.jsx";
import { GUIDES } from "./list.js";

export const metadata = {
  title: "내집마련 가이드 · 서울 내집마련 전략판",
  description: "생애최초 대출 한도, 스트레스 DSR, 취득세·중개보수, 갈아타기 양도세, 신고가·급매, 전세가율을 실거래가와 실제 계산식으로 설명합니다.",
  alternates: { canonical: "/guide/" },
};

const ICON = { "first-home": "🔑", "stress-dsr": "📉", "buy-costs": "🧾", "capital-gains": "🔄", "deal-signals": "🚀", "jeonse-ratio": "🏠" };

export default function GuideIndex() {
  return (
    <Page icon="📖" crumbs={[[null, "내집마련 가이드"]]} title="내집마련 가이드" sub="예시 숫자는 앱 계산기와 매일 갱신되는 실거래가로 만들어요."
      lead="집을 처음 살 때 막히는 대출 한도, 세금, 시세 읽는 법을 정리했어요.">
      <div className="grid gap-2 sm:grid-cols-2">
        {GUIDES.map(([slug, title, desc]) => (
          <a key={slug} href={`/guide/${slug}/`} className="flex items-start gap-3 rounded-large border border-default-200 bg-content1 p-4 hover:border-primary-300">
            <span className="text-2xl" aria-hidden="true">{ICON[slug]}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <b className="break-keep">{title}</b>
              <span className="break-keep text-small text-default-500">{desc}</span>
            </span>
          </a>
        ))}
      </div>
      <Cta>내 조건으로 바로 계산해 보기 →</Cta>
    </Page>
  );
}
