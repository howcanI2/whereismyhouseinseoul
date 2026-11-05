// 404 page (GitHub Pages serves it as 404.html): says the page is missing and links back, so visitors and
// search crawlers are not stranded on an empty English page.
export const metadata = { title: "페이지를 찾을 수 없어요 · 서울 내집마련 전략판", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-16">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-default-600">주소가 바뀌었거나 없는 페이지예요.</p>
      <a href="/" className="text-primary underline">서울 내집마련 전략판 첫 화면으로 가기</a>
    </main>
  );
}
