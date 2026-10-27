# web — Next.js + 카카오맵 버전

```bash
cd web
cp .env.example .env.local   # NEXT_PUBLIC_KAKAO_JS_KEY 입력
npm install
npm run dev                  # http://localhost:3000
```

- 카카오 개발자 콘솔 > 내 애플리케이션 > 플랫폼 > Web > 사이트 도메인에 `http://localhost:3000`(그리고 배포 주소)을 등록해야 지도가 뜹니다. 키가 없거나 도메인이 등록되지 않았으면 직접 그린 지도로 자동 전환됩니다.
- 데이터는 `public/data/*.json`이고, 저장소 루트의 `scripts/refresh.py`가 매일 다시 만듭니다 (`.github/workflows/refresh-data.yml`).
- Vercel 배포: 프로젝트 Root Directory를 `web`으로, 환경변수 `NEXT_PUBLIC_KAKAO_JS_KEY`를 넣으면 됩니다.
