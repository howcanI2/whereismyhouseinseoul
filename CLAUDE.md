# CLAUDE.md

서울 내집마련 전략판 — https://whereismyhouse.kr (GitHub `howcanI2/whereismyhouseinseoul`, **public** 저장소).
오너는 Windows PC(회사)와 Mac(집) 양쪽에서 Claude Code로 작업합니다. 이 파일이 두 환경의 공통 기억입니다.

## 구조

- `web/` — 실제 사이트. Next.js 정적 export → GitHub Pages(`.github/workflows/pages.yml`, main push 시 배포). `npm run dev`(포트 3000).
  앱인토스용 빌드는 `npm run build:toss`. `app/`은 예전 Vite 버전이라 손대지 않습니다.
- `scripts/` — 데이터 수집·가공(Python). `scripts/refresh.py`가 `web/public/data/*.json`을 만들고, 사이트는 `/data/*.json`으로 읽습니다.
- `.github/workflows/refresh-data.yml` — 매일 데이터 갱신(Actions secrets 사용). 09:00 KST 예약이지만 GitHub 지연으로 보통 16시 전후에 돌고, 끝나면 `pages.yml`이 배포합니다. 일부는 Windows PC에서 로컬로 갱신해 "Refresh data (local)" 커밋으로 올립니다.
- 블로그 초안 자동화는 비공개 저장소 `howcanI2/whereismyhouse-blog` (아래).

## 지켜야 할 것

- **숫자를 지어내지 않습니다.** 사이트·블로그에 나오는 모든 수치는 수집한 데이터(JSON)에서 나와야 합니다. 추정치는 "추정"이라고 표시합니다.
- **API 키는 git에 넣지 않습니다.** 로컬은 환경변수/`.env`(gitignore됨), Actions는 secrets.
  쓰는 키: `DATA_GO_KR_API_KEY`, `VWORLD_API_KEY`, `ECOS_API_KEY`, `NEIS_API_KEY`, `SCHOOLINFO_API_KEY`, (선택) `NAVER_API_ID`/`NAVER_API_KEY`. 저장소 변수 `GA_ID`.
- **커밋 작성자**: `howcanI2 <nit.figma01@gmail.com>`, 메시지 끝에 `Co-Authored-By: Claude …` 줄.
- 사이트 출처 표기는 `web/src/sources.js`의 `SOURCES`(App.jsx 하단과 /about/에 표시)가 기준입니다. 새 데이터를 쓰면 여기에 출처를 추가합니다.
- 연락 창구는 사이트의 "의견 보내기"뿐입니다. 사이트에 GitHub Issues 링크를 걸지 않습니다.
- 블로그 작업과 사이트 기능 개발은 커밋·PR을 나눕니다.

## 블로그 초안

주간 블로그 초안 자동화는 **비공개 저장소 `howcanI2/whereismyhouse-blog`**에 있습니다(이 저장소가 public이라 발행 전 초안이 공개되지 않도록 분리).
그 저장소는 사이트가 공개한 `https://whereismyhouse.kr/data/*.json`만 읽습니다. 그래서 `web/public/data/`의 파일 이름이나 필드
(`deals`, `insights`, `gu_summary`, `dong_summary`, `market`)를 바꾸면 그쪽 `blog/make_draft.py`도 같이 고쳐야 합니다.
