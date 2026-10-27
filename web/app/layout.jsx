import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "서울 내집마련 전략판",
  description: "광화문 출퇴근 기준으로 예산에 맞는 서울 아파트를 지도에서 찾고 대출·로드맵을 보는 앱",
};

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the dark class before paint so the page does not flash light in dark mode.
const themeScript = `(function(){try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
