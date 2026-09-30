# 온라인 교무실

구글 시트로 운영하던 학교 온라인 교무실을 **규격이 있는 웹앱**으로 옮긴 프로젝트입니다.

- 입력은 폼, 달력·시간표·대시보드는 자동 생성
- 학년도 = 1월 ~ 다음해 2월 (학사일정 3월~2월을 함께 보기 위해 14개월)
- 구글 계정(개인 Gmail) 로그인 + 관리자 승인
- 기존 구글 시트(.xlsx)를 관리자 화면에서 그대로 가져오기
- Cloudflare Workers + D1 (무료 플랜 기준 운영)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/01_현황분석_및_설계안.md](docs/01_현황분석_및_설계안.md) | 기존 시트 분석, 설계 원칙, 결정 사항, 이관 결과 |
| [docs/02_배포_가이드.md](docs/02_배포_가이드.md) | Cloudflare 배포, 구글 로그인 설정, 첫 가져오기 |
| [docs/03_재구조화_설계.md](docs/03_재구조화_설계.md) | v2 화면 재구조화: 영역별 메뉴, 색 분류 달력, 예산 현황 |

## 구조

```
src/                 Cloudflare Worker (API · 로그인 · 암호화)
migrations/          D1 테이블
public/
  js/modules.js      메뉴별 규격(칸 구성·드롭다운·권한) ← 칸 추가는 여기서
  js/importer.js     구글 시트(.xlsx) → 웹앱 기록 변환
  js/views/          화면 — calendar(달력 부품) · schedule · classes · notices · money · info · dashboard(홈) · admin
test/                가져오기·규격 테스트 (npm test)
scripts/             가져오기 미리보기 (node scripts/try-import.mjs 파일.xlsx)
```

## 개발

```bash
npm install
cp .dev.vars.example .dev.vars   # DATA_KEY 채우기
npm run db:init:local
npm run dev                      # http://127.0.0.1:8787/auth/dev?email=admin@example.com
npm test
```

> 이 저장소에는 학교 데이터가 들어 있지 않습니다. 실제 데이터(.xlsx, .dev.vars)는 `.gitignore` 로 제외됩니다.
