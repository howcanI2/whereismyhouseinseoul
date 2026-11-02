// 앱인토스 bundle: static export served from the bundle root, then `ait build` packs it into <appName>.ait.
//   npm run build:toss              (release)
//   npm run build:toss -- --debug   (shows the ad state on screen, for QR testing)
// The Toss WebView origin cannot be registered with Kakao, so the drawn map is used (no Kakao key in this build).
// NEXT_PUBLIC_TOSS_AD_GROUP_ID: the console's 배너 광고 group id; without it the 앱인토스 test id is used.
import { execSync } from "node:child_process";

const env = {
  ...process.env,
  PAGES_BASE_PATH: "/",          // static export at the root (see next.config.mjs)
  NEXT_PUBLIC_KAKAO_JS_KEY: "",  // overrides .env.local for this build
  NEXT_PUBLIC_TOSS: "1",
  // --debug: show why the banner is missing, for QR testing (never ship this)
  NEXT_PUBLIC_TOSS_AD_DEBUG: process.argv.includes("--debug") ? "1" : "",
};
const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
run("npx next build");
run("npx ait build");
