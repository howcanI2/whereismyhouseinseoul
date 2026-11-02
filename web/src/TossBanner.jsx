"use client";
import { useEffect, useRef, useState } from "react";
import { interstitialState } from "./TossInterstitial.js";

// 앱인토스 배너 광고 (WebView). Only the Toss build (NEXT_PUBLIC_TOSS=1) loads the SDK; on the website this renders nothing.
// One banner per screen, away from buttons, never before the content (토스 애즈 SSP 정책).
// NEXT_PUBLIC_TOSS_AD_DEBUG=1 (npm run build:toss -- --debug) prints the ad state in place of a missing banner, for QR testing.
const IS_TOSS = typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS === "1";
const DEBUG = typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS_AD_DEBUG === "1";
// set by scripts/build-toss.mjs: the live id for release, the 앱인토스 test id for --debug. No fallback here, so a
// release bundle never carries a test id (검토에서 번들 안의 테스트 ID 문자열만으로도 반려됨).
const AD_GROUP_ID = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS_AD_GROUP_ID) || "";

let sdkReady = null;  // initialize once for the whole app; resolves to { ads } or { why }
function initAds() {
  sdkReady ||= import("@apps-in-toss/web-framework").then(({ TossAds, isMinVersionSupported, getTossAppVersion }) => new Promise((resolve) => {
    let ver = "";
    try { ver = getTossAppVersion?.() || ""; } catch (e) { /* not in Toss */ }
    try {
      // banner API needs Toss app 5.241.0+; older versions can show a blank area
      if (!isMinVersionSupported({ android: "5.241.0", ios: "5.241.0" })) return resolve({ why: `토스 앱 버전이 낮음 (${ver || "알 수 없음"}, 5.241.0 이상 필요)` });
      if (!TossAds.initialize.isSupported()) return resolve({ why: `이 환경에서 광고 미지원 (토스 앱 ${ver || "?"}; 샌드박스 앱은 광고 불가)` });
      TossAds.initialize({ callbacks: {
        onInitialized: () => resolve({ ads: TossAds }),
        onInitializationFailed: (e) => resolve({ why: `광고 초기화 실패: ${e?.message || e}` }),
      } });
    } catch (e) { resolve({ why: `광고 SDK 오류: ${e?.message || e}` }); }
  })).catch((e) => ({ why: `광고 SDK를 불러오지 못함: ${e?.message || e}` }));
  return sdkReady;
}

export default function TossBanner() {
  const ref = useRef(null);
  const [state, setState] = useState(IS_TOSS && AD_GROUP_ID ? "loading" : "off");  // loading | shown | <reason it is not shown>
  const [inter, setInter] = useState(interstitialState.text);
  useEffect(() => { if (!DEBUG) return; interstitialState.listeners.add(setInter); return () => interstitialState.listeners.delete(setInter); }, []);
  useEffect(() => {
    if (!IS_TOSS || !AD_GROUP_ID) return;
    let banner, gone = false;
    initAds().then(({ ads, why }) => {
      if (gone || !ref.current) return;
      if (!ads) return setState(why);
      if (!ads.attachBanner.isSupported()) return setState("배너 광고 미지원 환경");
      banner = ads.attachBanner(AD_GROUP_ID, ref.current, {
        theme: "auto", tone: "blackAndWhite", variant: "expanded",
        callbacks: {
          onAdRendered: () => setState("shown"),
          onNoFill: () => setState(`표시할 광고 없음 (no fill, 광고 ID ${AD_GROUP_ID})`),
          onAdFailedToRender: (p) => setState(`광고 렌더링 실패: ${p?.error?.message || p?.message || JSON.stringify(p || {}).slice(0, 120)}`),
        },
      });
    });
    return () => { gone = true; banner?.destroy(); };
  }, []);
  if (state === "off") return null;
  const failed = state !== "loading" && state !== "shown";
  if (failed && !DEBUG) return null;
  const interLine = DEBUG && <p className="px-4 pb-2 text-tiny text-warning-700">[전면 광고 테스트] {inter} · 내 조건을 열었다가 저장하면 한 번 뜹니다</p>;
  // the container stays empty for the SDK; full width, 102px as the guide recommends (real height may vary)
  return (
    <div className="-mx-4 md:mx-0">
      <div ref={ref} style={{ width: "100%", minHeight: failed ? 0 : 102 }} />
      {DEBUG && state !== "shown" && <p className="px-4 py-2 text-tiny text-warning-700">[광고 테스트] {state === "loading" ? "불러오는 중…" : state}</p>}
      {interLine}
    </div>
  );
}
