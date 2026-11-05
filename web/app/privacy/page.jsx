// 개인정보처리방침: what the site keeps (nothing on a server), and what the ads and the map load from Google and Kakao.
export const metadata = { title: "개인정보처리방침 · 서울 내집마련 전략판", description: "서울 내집마련 전략판의 개인정보처리방침: 수집하는 정보, 광고 쿠키, 지도와 외부 서비스", alternates: { canonical: "/privacy/" } };

const Section = ({ title, children }) => (
  <section className="flex flex-col gap-1.5">
    <h2 className="text-medium font-semibold">{title}</h2>
    <div className="flex flex-col gap-1.5 text-small leading-relaxed text-default-600">{children}</div>
  </section>
);

export default function Privacy() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <a href="../" className="text-small text-primary">← 서울 내집마련 전략판으로</a>
        <h1 className="mt-2 text-2xl font-bold">개인정보처리방침</h1>
        <p className="mt-1 text-tiny text-default-400">시행일 2026년 11월 5일</p>
      </div>
      <Section title="1. 수집하는 정보">
        <p>이 사이트는 회원가입이 없고, 이용자의 개인정보를 서버에 수집·저장하지 않습니다.</p>
        <p>‘내 조건’(소득, 모은 돈, 직장 위치 등)과 ‘관심 단지’는 이용자의 브라우저(localStorage)에만 저장되며, 운영자를 포함해 누구에게도 전송되지 않습니다. 브라우저의 사이트 데이터를 지우면 함께 삭제됩니다.</p>
      </Section>
      <Section title="2. 광고와 쿠키 (Google AdSense)">
        <p>이 사이트는 Google AdSense 광고를 게재합니다. Google을 포함한 제3자 공급업체는 쿠키를 사용하여 이용자가 이 사이트나 다른 웹사이트를 방문한 기록을 바탕으로 광고를 게재합니다.</p>
        <p>Google은 광고 쿠키를 사용하여 이용자의 방문 기록에 따라 맞춤 광고를 보여줄 수 있습니다. 맞춤 광고는 <a className="text-primary underline" href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google 광고 설정</a>에서 끌 수 있고, 제3자 공급업체의 쿠키는 <a className="text-primary underline" href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">aboutads.info</a>에서 거부할 수 있습니다.</p>
        <p>Google이 데이터를 사용하는 방식: <a className="text-primary underline" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">Google 파트너 사이트 정책</a></p>
      </Section>
      <Section title="3. 지도와 외부 서비스">
        <p>지도는 카카오맵을 불러와 표시하며, 이 과정에서 카카오가 접속 정보(IP 주소, 브라우저 정보 등)를 처리할 수 있습니다. 직장 검색은 입력한 검색어가 카카오 장소 검색으로 전달됩니다. 자세한 내용은 카카오 개인정보처리방침을 따릅니다.</p>
        <p>글꼴은 Google Fonts에서 불러옵니다.</p>
      </Section>
      <Section title="4. 의견 보내기 (Google Forms)">
        <p>‘의견 보내기’는 Google Forms로 연결되며, 이용자가 직접 적어 제출한 내용만 운영자에게 전달됩니다. 이메일 주소는 자동으로 수집하지 않습니다.</p>
        <p>연락처(이메일 등)는 답변을 원하시는 경우에만 개인정보 수집·이용에 동의한 뒤 적을 수 있습니다. 수집 목적은 남겨 주신 의견에 대한 답변이며, 답변을 마치면 바로 삭제합니다(최대 1년 보관). 동의하지 않아도 의견은 보낼 수 있습니다.</p>
        <p>의견 내용은 서비스 개선에 사용하며, 요청하면 삭제합니다. 입력 과정에서 Google이 처리하는 정보는 <a className="text-primary underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>을 따릅니다.</p>
      </Section>
      <Section title="5. 정보의 정확성">
        <p>실거래가·대출·세금 등은 공공데이터를 가공한 참고 정보이며 실제와 다를 수 있습니다. 투자·대출 결정에 대한 조언이 아닙니다.</p>
      </Section>
      <Section title="6. 문의">
        <p>개인정보 관련 문의는 사이트 운영자에게 <a className="text-primary underline" href="https://github.com/howcanI2/whereismyhouseinseoul/issues" target="_blank" rel="noopener noreferrer">GitHub 이슈</a>로 남겨 주세요.</p>
      </Section>
    </main>
  );
}
