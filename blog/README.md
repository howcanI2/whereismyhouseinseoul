# 주간 블로그 초안

매주 월요일 08:00(KST)에 GitHub Actions(`.github/workflows/blog-draft.yml`)가 `make_draft.py`를 돌려
`https://whereismyhouse.kr/data/`의 공개 데이터로 초안을 만들고, `blog-draft` 라벨을 단 Issue로 올립니다.

- 1·2번: 최근 21일 계약 중 서울 신고가·급매(`deals.json`)
- 3번: 주마다 바뀌는 주제 — 구별 가격 변화 / 예산별 살 수 있는 동네 / 구별 전세가율
- 숫자는 모두 사이트 JSON 값 그대로입니다. 직접 계산하거나 추정한 숫자는 없습니다.

## 올리는 법

1. Issue의 `✍️ [여기에 내 의견 한두 줄]`을 내 말로 바꿉니다.
2. GitHub에서 **렌더링된 Issue 본문**을 드래그해 복사하고 네이버 블로그·티스토리 편집기에 붙여 넣으면 표가 표로 들어갑니다.
   (티스토리 마크다운 모드라면 Issue 편집 화면의 원문을 그대로 붙여도 됩니다.)

제목·후킹·글 틀은 [GUIDE.md](GUIDE.md)에 정리했습니다. 제목 후보와 체크리스트는 Issue 댓글로 붙습니다.

## 키워드 리포트 켜기

`naver_research.py`는 네이버 블로그 검색 상위 글 제목과 검색어 트렌드를 모아 같은 Issue에 댓글로 붙입니다.
네이버 공식 API(NAVER API HUB)를 써서 키가 필요합니다.

1. [네이버 클라우드 플랫폼](https://www.ncloud.com) 콘솔 → NAVER API HUB에서 **검색**과 **검색어 트렌드**를 신청하고 Client ID/Secret을 받습니다.
2. GitHub 저장소 → Settings → Secrets and variables → Actions에 `NAVER_API_ID`(Client ID), `NAVER_API_KEY`(Client Secret)를 넣습니다.

키가 없으면 이 단계만 건너뛰고 초안은 그대로 올라갑니다.

## 직접 돌리기

```bash
python blog/make_draft.py                  # blog/out/draft.md
python blog/make_draft.py --topic budget   # gu | budget | jeonse
```

Actions 탭 → Blog draft → Run workflow 로 아무 때나 한 번 더 만들 수 있습니다.
