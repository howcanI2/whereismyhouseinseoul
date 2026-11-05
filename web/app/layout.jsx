import "./globals.css";
import Providers from "./providers";

const SITE = "https://whereismyhouse.kr";
const TITLE = "서울 내집마련 전략판";
const DESC = "내 소득·모은 돈으로 살 수 있는 서울 아파트를 실거래가 지도에서 찾고, 대출·취득세·3년 뒤 예산까지 계산해 보는 무료 도구";
const NAVER_VERIFY = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION || "";  // 네이버 서치어드바이저 사이트 소유확인 (HTML 태그 방식)

// Naver Search Advisor / Google read these from the static HTML: title, description, canonical, robots, Open Graph
export const metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,  // Naver: the main page title is the brand name, short and stable
  description: DESC,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: TITLE, title: TITLE, description: DESC, url: "/", locale: "ko_KR",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: TITLE }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/og.png"] },
  other: { "twitter:domain": TITLE },
  ...(NAVER_VERIFY ? { verification: { other: { "naver-site-verification": NAVER_VERIFY } } } : {}),
};

// structured data: what the site is (Naver/Google site info)
const JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: TITLE,
  url: SITE + "/",
  description: DESC,
  inLanguage: "ko-KR",
};

// The 앱인토스 bundle is light-mode only and keeps the page from pinch-zooming (the map still zooms itself), per the
// mini-app checklist; the website follows the system theme and allows zoom.
const TOSS = process.env.NEXT_PUBLIC_TOSS === "1";
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";  // read here, not from WebAd.jsx: a client module's exports are references on the server
export const viewport = TOSS
  ? { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover" }
  : { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the dark class before paint so the page does not flash light in dark mode.
const themeScript = TOSS
  ? `document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';`
  : `(function(){try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {!TOSS && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />}
        {/* Google AdSense (website only): the site check and the ad units both need this script */}
        {!TOSS && ADSENSE_CLIENT && <meta name="google-adsense-account" content={ADSENSE_CLIENT} />}
        {!TOSS && ADSENSE_CLIENT && <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} crossOrigin="anonymous" />}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
