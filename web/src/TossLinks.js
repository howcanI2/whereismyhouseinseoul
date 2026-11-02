// 앱인토스: links to outside pages (청약 공고문, 청약홈) open through the Toss app's own browser.
// A plain <a target="_blank"> may do nothing inside the mini-app WebView (출시 체크리스트: 외부 링크가 정상적으로 열려요).
// On the website this does nothing.
const IS_TOSS = typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS === "1";

// In the mini-app only the 청약 공고문 / 청약홈 links stay (needed to check dates and eligibility in the original);
// article sources, 토지이음 and 정비구역 pages show as plain text. The website keeps every link.
export const SOURCE_LINKS = !IS_TOSS;

let installed = false;
export function installExternalLinks() {
  if (!IS_TOSS || installed || typeof document === "undefined") return;
  installed = true;
  const sdk = import("@apps-in-toss/web-framework").catch(() => null);
  document.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a[href]");
    if (!a || !/^https?:\/\//.test(a.href) || a.origin === location.origin) return;
    e.preventDefault();
    sdk.then((m) => {
      const open = m?.Device?.openURL || m?.openURL;
      if (open) open(a.href).catch(() => window.open(a.href, "_blank"));
      else window.open(a.href, "_blank");
    });
  }, true);
}
