"use client";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { track, useBackToClose } from "./lib.js";
import { FEEDBACK_URL } from "./Feedback.jsx";

// 둘러보기: the site's own text pages (급지, 예산별 동네, 시장, 청약 …), opened from the header so they are not buried in the footer.
// Relative links, like the footer, so they follow whatever base path the site is served under.
const PAGES = [
  ["tiers/", "🏆", "급지 순위", "서울 동네를 실거래 평당가로 1~5급지로"],
  ["budget/", "💰", "예산별 동네", "6억~15억으로 살 수 있는 동네와 필요한 돈"],
  ["gu/", "🗺", "구별 시세", "25개 구의 84㎡ 시세와 1년 변화"],
  ["market/", "📈", "이번 달 시장", "거래량, 오른 구, 신고가·급매, 금리"],
  ["cheongyak/", "📝", "청약 일정", "서울·경기 접수 예정 단지와 분양가"],
  ["newbuild/", "🏢", "입주 예정", "앞으로 입주할 서울 신축 단지"],
  ["redev/", "🏗", "재건축·재개발", "진행 단계별·구별 정비사업 현황"],
  ["guide/", "📖", "내집마련 가이드", "대출 한도, 세금, 시세 읽는 법"],
];

export default function SiteMenu({ open, onClose }) {
  useBackToClose(open, onClose);
  return (
    <Modal isOpen={open} onClose={onClose} placement="bottom-center" scrollBehavior="inside" size="md">
      <ModalContent>
        <ModalHeader className="pb-1">둘러보기</ModalHeader>
        <ModalBody className="gap-1 pb-5">
          <ul className="flex flex-col">
            {PAGES.map(([href, icon, title, desc]) => (
              <li key={href}>
                <a href={href} onClick={() => track("menu_link", { page: href.replace("/", "") })}
                  className="flex items-center gap-3 rounded-medium px-2 py-2.5 hover:bg-default-100">
                  <span className="text-xl" aria-hidden="true">{icon}</span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{title}</span>
                    <span className="text-tiny text-default-500">{desc}</span>
                  </span>
                  <span className="ml-auto text-default-300" aria-hidden="true">›</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap gap-x-3 border-t border-default-100 pt-3 text-small text-default-500">
            <a href="about/">사이트 소개</a>
            <a href="privacy/">개인정보처리방침</a>
            {FEEDBACK_URL && <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">의견 보내기</a>}
          </p>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
