# 서울 내집마련 전략판

https://whereismyhouse.kr — 내 예산과 직장을 넣으면 살 수 있는 서울·수도권 아파트를 지도에서 찾고, 대출과 할 일을 정리해 주는 사이트입니다. 앱인토스 미니앱으로도 나갑니다.

- **지도**: 구 → 법정동 → 행정동 → 단지 단위로 가격 변화, 평당가, 내 예산 비중, 거래량, 전세가율, 통근 시간을 봅니다. 지하철 노선과 재개발·정비구역 레이어가 있습니다.
- **내 돈**: 예산 시나리오, 대출 계산기, 주담대 금리 흐름, 대출 시장 현황.
- **신축**: 청약·분양 예정 단지.
- **할 일**: 로드맵과 알아둘 정책.

## 구성

| 경로 | 내용 |
|---|---|
| `web/` | 사이트 본체 (Next.js 정적 export + 카카오맵). 실행법은 [web/README.md](web/README.md) |
| `scripts/` | 데이터 수집·가공 (Python). `refresh.py`가 `web/public/data/*.json`을 만듭니다 |
| `data/` | 수집 원본 캐시 |
| `app/` | 예전 Vite 단일 HTML 빌드 (유지보수하지 않음) |

## 실행

```bash
cd web
cp .env.example .env.local   # NEXT_PUBLIC_KAKAO_JS_KEY (없으면 직접 그린 지도로 뜹니다)
npm install
npm run dev                  # http://localhost:3000
```

## 데이터 갱신과 배포

- `.github/workflows/refresh-data.yml`이 매일 데이터를 다시 받아 `web/public/data/`에 커밋합니다 (09:00 KST 예약, GitHub 지연으로 보통 16시 전후 실행).
- 커밋이 끝나면 `.github/workflows/pages.yml`이 GitHub Pages(whereismyhouse.kr)로 배포합니다.
- 앱인토스 번들은 `cd web && npm run build:toss`.

## 데이터 출처

국토교통부 실거래가·K-apt·건축HUB·브이월드, 한국부동산원 청약홈, 서울 열린데이터광장, 한국은행 ECOS, 행정안전부 인구통계, 교육부 학교 데이터, 통계청 SGIS, OpenStreetMap, 카카오맵 등. 전체 목록과 표기 문구는 [web/src/sources.js](web/src/sources.js)가 기준입니다.

예산과 통근 시간은 추정치이며 투자 조언이 아닙니다.

## 라이선스

All rights reserved. 코드는 열람용으로만 공개되어 있으며, 허락 없이 복제·수정·배포하거나 이를 이용한 서비스를 운영할 수 없습니다. 자세한 내용은 [LICENSE](LICENSE)를 보세요.
