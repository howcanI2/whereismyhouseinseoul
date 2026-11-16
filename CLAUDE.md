# CLAUDE.md

서울 내집마련 전략판 — https://whereismyhouse.kr (GitHub `howcanI2/whereismyhouseinseoul`, **public** 저장소).
오너는 Windows PC(회사)와 Mac(집) 양쪽에서 Claude Code로 작업합니다. 이 파일이 두 환경의 공통 기억입니다.

## 구조

- `web/` — 실제 사이트. Next.js 정적 export → GitHub Pages(`.github/workflows/pages.yml`, main push 시 배포). `npm run dev`(포트 3000).
  앱인토스용 빌드는 `npm run build:toss`. `app/`은 예전 Vite 버전이라 손대지 않습니다.
- `scripts/` — 데이터 수집·가공(Python). `scripts/refresh.py`가 `web/public/data/*.json`을 만들고, 사이트는 `/data/*.json`으로 읽습니다.
- `.github/workflows/refresh-data.yml` — 매일 06:30 KST 데이터 갱신(Actions secrets 사용). 일부는 Windows PC에서 로컬로 갱신해 "Refresh data (local)" 커밋으로 올립니다.
- `blog/` — 주간 블로그 초안 자동화 (아래).

## 지켜야 할 것

- **숫자를 지어내지 않습니다.** 사이트·블로그에 나오는 모든 수치는 수집한 데이터(JSON)에서 나와야 합니다. 추정치는 "추정"이라고 표시합니다.
- **API 키는 git에 넣지 않습니다.** 로컬은 환경변수/`.env`(gitignore됨), Actions는 secrets.
  쓰는 키: `DATA_GO_KR_API_KEY`, `VWORLD_API_KEY`, `ECOS_API_KEY`, `NEIS_API_KEY`, `SCHOOLINFO_API_KEY`, (선택) `NAVER_API_ID`/`NAVER_API_KEY`. 저장소 변수 `GA_ID`.
- **커밋 작성자**: `howcanI2 <nit.figma01@gmail.com>`, 메시지 끝에 `Co-Authored-By: Claude …` 줄.
- 사이트 출처 표기는 `web/src/App.jsx`의 `SOURCES`가 기준입니다. 새 데이터를 쓰면 여기에 출처를 추가합니다.
- 연락 창구는 사이트의 "의견 보내기"뿐입니다. 사이트에 GitHub Issues 링크를 걸지 않습니다.
- 블로그 작업과 사이트 기능 개발은 커밋·PR을 나눕니다.

## 블로그 초안 (`blog/`, 2026-11 시작)

목적: 블로그 글로 검색 유입을 만들어 사이트(AdSense, GA4)로 보냅니다. 티스토리 Open API는 종료됐고 네이버 블로그는 글쓰기 API가 없어서 **발행은 오너가 손으로** 합니다. 자동화는 초안까지만.

- `blog/make_draft.py` — `https://whereismyhouse.kr/data/`(deals, insights, gu_summary, dong_summary, market)를 받아 마크다운 초안을 만듭니다. 표준 라이브러리만, 키 없음.
  - 1·2번: 최근 21일 계약 서울 신고가(같은 단지·평형 2년 최고가 대비)·급매(직전 6개월 중위가 대비) TOP10
  - 3번: ISO 주차로 돌아가며 `gu`(구별 가격 변화) / `budget`(예산별 84㎡ 동네) / `jeonse`(구별 전세가율). `--topic`으로 고정 가능.
  - 틀: 검색어를 앞에 둔 제목 → 숫자 대비 도입 2줄 → 3줄 요약 → `✍️ [여기에 내 의견 한두 줄]` → 질문형 소제목+표 → 사이트 링크(utm_source=blog) → 출처 → 태그.
  - 구 이름 같은 한국어 조사는 `josa()`로 붙입니다. insights의 `chg`는 같은 단지·평형끼리 비교한 값이라 `ppp`/`ppp_prev` 비율과 다릅니다(섞어서 보여주지 않기).
- `.github/workflows/blog-draft.yml` — 매주 월 08:00 KST(+수동 실행). 초안을 `blog-draft` 라벨 Issue로 올리고, 제목 후보·체크리스트(+네이버 리포트)는 댓글로 답니다.
- `blog/naver_research.py` — NAVER API HUB로 네이버 블로그 상위 글 제목·검색어 트렌드를 모아 리포트. **오너 결정으로 보류 중**: 키 없이 몇 주 올려 보고 블로그 통계(유입 검색어)를 본 뒤 필요하면 켭니다. 키가 없으면 자동으로 건너뜁니다.
- `blog/GUIDE.md` — 관심 키워드(뉴스 근거, 네이버 데이터로 검증 전), 제목 공식, 글 틀. `blog/README.md` — 올리는 법.
- Claude의 도구로는 naver.com이 열리지 않습니다(브라우저 확장·웹검색 모두 차단). 네이버 데이터가 필요하면 오너가 직접 보거나 API 키를 씁니다.

현황 (2026-11-16): 위 내용은 PR #1(`claude/reverent-franklin-93b493`)에 있고 아직 main에 merge 전입니다. 워크플로 수동 실행(Run workflow)은 merge 후에 가능합니다.
