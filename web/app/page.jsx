"use client";
import dynamic from "next/dynamic";

// What the static HTML shows until the app loads: a real heading and summary, so search crawlers (Naver, Google)
// that do not run the app's JavaScript still read what the page is about. The app replaces it in the browser.
function Intro() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-10">
      <h1 className="text-2xl font-bold">서울 내집마련 전략판</h1>
      <p className="text-default-600">내 소득과 모은 돈으로 살 수 있는 서울 아파트를 실거래가 지도에서 찾아보세요.</p>
      <ul className="list-disc pl-5 text-small text-default-500">
        <li>국토교통부 실거래가로 본 동네별·단지별 매매·전세 시세와 신고가·급매</li>
        <li>소득·자산·대출 규제를 반영한 내 예산, 3년 뒤 예산</li>
        <li>취득세·중개보수·재산세·대출이자, 갈아타기 시 양도세 계산</li>
        <li>출퇴근 거리, 학교, 재건축 연한으로 단지 골라보기</li>
      </ul>
      <p className="text-small text-default-600"><a href="/gu/" className="text-primary underline">서울 구별 아파트 시세 보기</a></p>
      <p className="text-small text-default-500">자료: 국토교통부 실거래가 공개시스템, 공동주택관리정보시스템(K-apt), 건축HUB 등 공공데이터 · <a href="/privacy/" className="underline">개인정보처리방침</a></p>
      <p className="text-tiny text-default-400">불러오는 중…</p>
    </main>
  );
}

// The app reads window size, the URL hash and the Kakao SDK, so it renders in the browser only.
const App = dynamic(() => import("../src/App.jsx"), { ssr: false, loading: () => <Intro /> });

export default function Page() {
  return <App />;
}
