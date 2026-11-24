"use client";
import dynamic from "next/dynamic";
import { NAV } from "./_ui.jsx";

// What the static HTML shows until the app loads: a real heading and summary, so search crawlers (Naver, Google)
// that do not run the app's JavaScript still read what the page is about. The app replaces it in the browser.
function Intro() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold">서울 내집마련 전략판</h1>
      <p className="text-default-600">내 소득과 모은 돈으로 살 수 있는 서울 아파트를 실거래가 지도에서 찾아보세요. 시세에서 출발하는 대신 <b>내 예산에서 출발해</b>, 지금과 몇 년 뒤에 닿는 동네와 단지를 보여 줍니다.</p>
      <ul className="list-disc pl-5 text-small text-default-500">
        <li>국토교통부 실거래가로 본 동네별·단지별 매매·전세 시세와 신고가·급매</li>
        <li>소득·자산·대출 규제(LTV, 스트레스 DSR, 주담대 한도)를 반영한 내 예산, 3년 뒤 예산</li>
        <li>취득세·중개보수·재산세·대출이자, 갈아타기 시 양도세 계산</li>
        <li>출퇴근 거리, 학교, 재건축 진행 단계, 청약·입주 예정 단지로 골라보기</li>
      </ul>
      <section className="flex flex-col gap-1 text-small text-default-600">
        <h2 className="text-medium font-semibold text-default-700">이렇게 쓰세요</h2>
        <ol className="list-decimal pl-5">
          <li><b>내 조건</b>에 소득, 모은 돈, 매달 저축, 결혼 계획, 직장을 넣습니다. 입력값은 이 브라우저에만 저장됩니다.</li>
          <li><b>지도</b>에서 내 예산 이하로 거래된 동네가 초록색으로 표시됩니다. 동네를 누르면 단지별 실거래가가 나옵니다.</li>
          <li><b>내 돈·할 일</b> 탭에서 대출 한도, 사는 데 드는 돈, 청약 일정과 해야 할 일을 확인합니다.</li>
        </ol>
      </section>
      <section className="flex flex-col gap-1 text-small text-default-600">
        <h2 className="text-medium font-semibold text-default-700">자주 묻는 질문</h2>
        <p><b>예산은 어떻게 계산하나요?</b> 모은 돈에서 취득세·중개보수를 빼고, LTV·주담대 한도·스트레스 DSR 40% 중 가장 작은 대출을 더해 살 수 있는 최고 가격을 찾습니다. <a href="/guide/first-home/" className="text-primary underline">계산 예시</a></p>
        <p><b>시세는 호가인가요?</b> 아니요. 국토교통부에 신고된 실제 거래 가격만 씁니다. 데이터는 매일 갱신됩니다.</p>
        <p><b>급지는 누가 정하나요?</b> 최근 1년 실거래 평당가로 서울 법정동을 다섯 등분한 이 사이트의 자체 기준입니다. <a href="/tiers/" className="text-primary underline">급지 순위</a></p>
      </section>
      <nav className="flex flex-wrap gap-x-3 gap-y-1 text-small">
        {NAV.map(([href, label]) => <a key={href} href={href} className="text-primary underline">{label}</a>)}
      </nav>
      <p className="text-small text-default-500">자료: 국토교통부 실거래가 공개시스템, 공동주택관리정보시스템(K-apt), 건축HUB 등 공공데이터 · <a href="/about/" className="underline">사이트 소개</a> · <a href="/privacy/" className="underline">개인정보처리방침</a></p>
      <p className="text-tiny text-default-400">지도를 불러오는 중…</p>
    </main>
  );
}

// The app reads window size, the URL hash and the Kakao SDK, so it renders in the browser only.
const App = dynamic(() => import("../src/App.jsx"), { ssr: false, loading: () => <Intro /> });

export default function Page() {
  return <App />;
}
