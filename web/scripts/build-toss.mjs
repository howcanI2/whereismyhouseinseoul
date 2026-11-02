// 앱인토스 bundle: static export served from the bundle root, then `ait build` packs it into <appName>.ait.
//   npm run build:toss              (release)
//   npm run build:toss -- --debug   (shows the ad state on screen, for QR testing)
// Kakao map: the mini-app origin (https://tossminiapp.com) is registered in the Kakao console, so the build keeps
// NEXT_PUBLIC_KAKAO_JS_KEY from .env.local (a JavaScript key is public by design and works only on registered domains).
// --no-kakao builds with the drawn map instead; the app also falls back to it when Kakao refuses to load.
// NEXT_PUBLIC_TOSS_AD_GROUP_ID / NEXT_PUBLIC_TOSS_INTERSTITIAL_ID: the console's 배너 / 전면형 광고 group ids;
// without them the 앱인토스 test ids are used.
import { execSync } from "node:child_process";

const env = {
  ...process.env,
  PAGES_BASE_PATH: "/",          // static export at the root (see next.config.mjs)
  ...(process.argv.includes("--no-kakao") ? { NEXT_PUBLIC_KAKAO_JS_KEY: "" } : {}),  // "" overrides .env.local
  NEXT_PUBLIC_TOSS: "1",
  // --debug: show why the banner is missing, for QR testing (never ship this)
  NEXT_PUBLIC_TOSS_AD_DEBUG: process.argv.includes("--debug") ? "1" : "",
};
// 운영 광고 ID로 테스트하면 제재 대상: a --debug bundle always uses the test ids
if (env.NEXT_PUBLIC_TOSS_AD_DEBUG) { env.NEXT_PUBLIC_TOSS_AD_GROUP_ID = ""; env.NEXT_PUBLIC_TOSS_INTERSTITIAL_ID = ""; }
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
run("npx next build");
run("npx ait build");
