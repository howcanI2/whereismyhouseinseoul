// /about/: who runs the site, what it is for, how the numbers are made, and how to get in touch.
import { SOURCES } from "../../src/sources.js";

export const metadata = {
  title: "사이트 소개 · 서울 내집마련 전략판",
  description: "서울 내집마련 전략판은 내 소득과 모은 돈으로 살 수 있는 서울 아파트를 공공 실거래가로 찾아보는 무료 도구입니다. 만든 목적, 계산 방법, 데이터 출처와 문의 방법을 소개합니다.",
  alternates: { canonical: "/about/" },
};

const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL || "";

const Section = ({ title, children }) => (
  <section className="flex flex-col gap-2">
    <h2 className="text-large font-semibold">{title}</h2>
    <div className="flex flex-col gap-2 leading-relaxed text-default-700">{children}</div>
  </section>
);

export default function About() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <nav className="text-small text-default-500"><a href="/" className="text-primary">서울 내집마련 전략판</a> › 사이트 소개</nav>
      <h1 className="text-2xl font-bold">서울 내집마련 전략판 소개</h1>

      <Section title="왜 만들었나요">
        <p>집을 알아볼 때 가장 먼저 드는 질문은 &ldquo;내 돈으로 어디까지 살 수 있지?&rdquo;입니다. 그런데 대부분의 부동산 서비스는 시세에서 출발해서, 내 소득·모은 돈·대출 규제를 직접 계산해 맞춰 봐야 합니다.</p>
        <p>서울 내집마련 전략판은 반대로 <b>내 예산에서 출발합니다.</b> 소득과 모은 돈을 넣으면 지금, 그리고 몇 년 뒤에 살 수 있는 최대 가격을 계산하고, 그 예산으로 닿는 서울의 동네와 단지를 실제 거래 가격으로 보여 줍니다.</p>
        <p>집을 처음 사려는 사람이 직접 쓰려고 만들기 시작한 도구이며, 개인이 만들고 운영하는 무료 서비스입니다.</p>
      </Section>

      <Section title="무엇을 볼 수 있나요">
        <ul className="list-disc pl-5">
          <li>내 소득·자산·대출 조건(LTV, 스트레스 DSR)으로 계산한 지금과 N년 뒤의 예산</li>
          <li>예산 안에 드는 동네와 단지를 지도와 <a href="/tiers/" className="text-primary underline">급지 순위</a>로</li>
          <li>구·동·단지별 실거래가, 신고가·급매 의심 거래, <a href="/gu/" className="text-primary underline">구별 시세</a></li>
          <li>취득세·중개보수·재산세·대출 이자, 갈아탈 때의 양도세 추정</li>
          <li>청약 일정, 신축 입주 예정, 재건축 진행 단계, 학교·출퇴근 거리</li>
        </ul>
      </Section>

      <Section title="숫자는 어떻게 만드나요">
        <p>모든 시세는 국토교통부 실거래가 신고 자료를 그대로 모아 계산합니다. 호가나 매물 가격은 쓰지 않습니다. 데이터는 매일 아침 자동으로 갱신되며, 계약 후 30일 안에 신고하는 구조라 최근 한 달의 거래는 시간이 지나며 늘어납니다.</p>
        <p>예산·세금·대출 계산은 공개된 제도(LTV, 스트레스 DSR, 취득세·양도세 세율)를 단순화한 추정입니다. 개인마다 조건이 달라 실제 금액과 다를 수 있으니, 계약이나 대출 전에는 금융기관과 세무 전문가에게 꼭 확인하세요. 이 사이트의 정보는 투자 권유가 아닙니다.</p>
        <p>&lsquo;내 조건&rsquo;에 입력한 정보는 이용자의 브라우저에만 저장되고, 운영자에게도 전송되지 않습니다. 자세한 내용은 <a href="/privacy/" className="text-primary underline">개인정보처리방침</a>을 보세요.</p>
      </Section>

      <Section title="데이터 출처">
        <ul className="list-disc pl-5 text-small">
          {SOURCES.map(([what, who]) => <li key={what}><span className="text-default-500">{what}</span> · {who}</li>)}
        </ul>
      </Section>

      <Section title="문의">
        <p>틀린 숫자, 불편한 점, 있었으면 하는 기능을 알려 주시면 확인해서 반영하겠습니다.</p>
        <ul className="list-disc pl-5">
          {FEEDBACK_URL && <li><a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">의견 보내기 (구글 폼)</a>: 로그인 없이 보낼 수 있어요.</li>}
        </ul>
      </Section>

      <a href="/" className="rounded-large bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">내 예산으로 살 수 있는 동네 찾아보기 →</a>
    </main>
  );
}
