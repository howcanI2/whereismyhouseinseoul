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

## 직접 돌리기

```bash
python blog/make_draft.py                  # blog/out/draft.md
python blog/make_draft.py --topic budget   # gu | budget | jeonse
```

Actions 탭 → Blog draft → Run workflow 로 아무 때나 한 번 더 만들 수 있습니다.
