"use client";
import { useEffect, useRef } from "react";

// Google AdSense display unit for the website (the 앱인토스 build uses TossBanner instead).
// NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…) loads the AdSense script in app/layout.jsx; NEXT_PUBLIC_ADSENSE_SLOT is the
// display unit made in the AdSense console. Without a slot this renders nothing, so only Auto ads (if turned on there) show.
export const ADSENSE_CLIENT = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADSENSE_CLIENT) || "";
const SLOT = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADSENSE_SLOT) || "";

export default function WebAd() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ADSENSE_CLIENT || !SLOT || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked by an ad blocker */ }
  }, []);
  if (!ADSENSE_CLIENT || !SLOT) return null;
  // one unit per screen, between content blocks and away from the map's buttons (AdSense: no accidental clicks)
  return (
    <div className="overflow-hidden rounded-large">
      <div className="px-1 pb-0.5 text-[10px] text-default-400">광고</div>
      <ins ref={ref} className="adsbygoogle" style={{ display: "block" }} data-ad-client={ADSENSE_CLIENT} data-ad-slot={SLOT} data-ad-format="auto" data-full-width-responsive="true" />
    </div>
  );
}
