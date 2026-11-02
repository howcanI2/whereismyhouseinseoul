import { defineConfig } from "@apps-in-toss/web-framework/config";

// 앱인토스 미니앱 설정. appName must match the app registered in the 앱인토스 console.
// The bundle is the static Next export built by scripts/build-toss.mjs (served from the bundle root, no Kakao map).
export default defineConfig({
  appName: "whereismyhouseinseoul",
  brand: {
    primaryColor: "#0B7A64",
  },
  navigationBar: {
    withBackButton: true,
    withHomeButton: true,
    withTitle: true,
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: "never",
  },
  permissions: [],
  webBundleDir: ".next-pages",
});
