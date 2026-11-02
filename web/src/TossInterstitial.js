// 앱인토스 전면형 광고: shown once per app session, right after the viewer saves 내 조건 (a natural stopping point, never
// on entry). The ad is loaded while the dialog is open, so nothing is fetched at the moment it shows (출시 체크리스트).
// Only the Toss build loads the SDK; on the website every call is a no-op.
const IS_TOSS = typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS === "1";
const AD_GROUP_ID = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS_INTERSTITIAL_ID) || "ait-ad-test-interstitial-id";  // test id until the console issues one

// state for the --debug line (read by TossBanner)
export const interstitialState = { text: "대기", listeners: new Set() };
const report = (text) => { interstitialState.text = text; interstitialState.listeners.forEach((f) => f(text)); };

// true while a 전면 광고 is ready and has not been shown yet: the 내 조건 dialog then says one will follow 저장
export const interstitialPending = () => IS_TOSS && loaded && !shownThisSession;

let sdk = null, loaded = false, loading = false, shownThisSession = false;
const getSdk = () => (sdk ||= import("@apps-in-toss/web-framework").catch(() => null));

// call when the 내 조건 dialog opens
export function preloadInterstitial() {
  if (!IS_TOSS || shownThisSession || loaded || loading) return;
  loading = true; report("불러오는 중…");
  getSdk().then((m) => {
    try {
      if (!m || !m.loadFullScreenAd?.isSupported?.()) { loading = false; return report("이 환경에서 전면 광고 미지원"); }
      m.loadFullScreenAd({
        options: { adGroupId: AD_GROUP_ID },
        onEvent: (e) => { if (e.type === "loaded") { loaded = true; loading = false; report("준비됨 (저장하면 표시)"); } },
        onError: (err) => { loading = false; report(`불러오기 실패: ${err?.message || err}`); },
      });
    } catch (err) { loading = false; report(`SDK 오류: ${err?.message || err}`); }
  });
}

// call after 내 조건 is saved; shows only if an ad finished loading, at most once per session
export function showInterstitialOnce() {
  if (!IS_TOSS || shownThisSession || !loaded) return;
  shownThisSession = true; loaded = false;
  getSdk().then((m) => {
    try {
      if (!m?.showFullScreenAd?.isSupported?.()) return report("표시 미지원");
      m.showFullScreenAd({
        options: { adGroupId: AD_GROUP_ID },
        onEvent: (e) => { if (e.type === "show") report("표시됨"); if (e.type === "dismissed") report("닫힘 (이번 실행에서는 다시 안 뜸)"); if (e.type === "failedToShow") report("표시 실패"); },
        onError: (err) => report(`표시 실패: ${err?.message || err}`),
      });
    } catch (err) { report(`SDK 오류: ${err?.message || err}`); }
  });
}
