// "의견 보내기": a link to the operator's Google Form (repo variable FEEDBACK_URL → NEXT_PUBLIC_FEEDBACK_URL).
// No server: answers land in the form's Google Sheet. Renders nothing until the link is set, and never in the 앱인토스 build.
export const FEEDBACK_URL = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_FEEDBACK_URL) || "";
const TOSS = typeof process !== "undefined" && process.env.NEXT_PUBLIC_TOSS === "1";

export default function Feedback({ compact = false }) {
  if (!FEEDBACK_URL || TOSS) return null;
  if (compact) return <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="underline">의견 보내기</a>;
  return (
    <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-large border border-default-200 px-4 py-3 hover:bg-default-100">
      <span className="flex flex-col">
        <span className="text-small font-semibold">💬 의견 보내기</span>
        <span className="text-tiny text-default-500">불편한 점, 틀린 숫자, 있었으면 하는 기능을 알려 주세요. 로그인 없이 1분이면 돼요.</span>
      </span>
      <span className="text-default-400">→</span>
    </a>
  );
}
