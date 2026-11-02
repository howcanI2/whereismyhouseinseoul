"use client";
import { useEffect, useRef, useState } from "react";

// 앱인토스 배너 광고 (WebView). Only the Toss build (NEXT_PUBLIC_TOSS=1) loads the SDK; on the website this renders nothing.
// One banner per screen, away from buttons, never before the content (토스 애즈 SSP 정책).
const IS_TOSS = typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS === "1";
const AD_GROUP_ID = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS_AD_GROUP_ID) || "ait-ad-test-banner-id";  // test id until the console issues one

let sdkReady = null;  // initialize once for the whole app
function initAds() {
  sdkReady ||= import("@apps-in-toss/web-framework").then(({ TossAds, isMinVersionSupported }) => new Promise((resolve) => {
    try {
      // banner API needs Toss app 5.241.0+; older versions can show a blank area
      if (!isMinVersionSupported({ android: "5.241.0", ios: "5.241.0" }) || !TossAds.initialize.isSupported()) return resolve(null);
      TossAds.initialize({ callbacks: { onInitialized: () => resolve(TossAds), onInitializationFailed: () => resolve(null) } });
    } catch (e) { resolve(null); }
  })).catch(() => null);
  return sdkReady;
}

export default function TossBanner() {
  const ref = useRef(null);
  const [shown, setShown] = useState(IS_TOSS);
  useEffect(() => {
    if (!IS_TOSS) return;
    let banner, gone = false;
    initAds().then((TossAds) => {
      if (gone || !ref.current) return;
      if (!TossAds || !TossAds.attachBanner.isSupported()) { setShown(false); return; }
      banner = TossAds.attachBanner(AD_GROUP_ID, ref.current, {
        theme: "auto", tone: "blackAndWhite", variant: "expanded",
        callbacks: { onNoFill: () => setShown(false), onAdFailedToRender: () => setShown(false) },
      });
    });
    return () => { gone = true; banner?.destroy(); };
  }, []);
  if (!shown) return null;
  // the container stays empty for the SDK; full width, 102px as the guide recommends (real height may vary)
  return <div className="-mx-4 md:mx-0"><div ref={ref} style={{ width: "100%", minHeight: 102 }} /></div>;
}
