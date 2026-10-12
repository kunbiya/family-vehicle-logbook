# 가족 차량 운행·정비 관리

가족이 함께 사용하는 차량 운행·정비 기록 관리 웹앱입니다.

## 운영 방식

실제 서비스는 OpenAI Sites에서 계속 운영합니다. 이 GitHub 저장소는 소스 코드 보관용이며, GitHub Pages나 자동 배포는 설정하지 않았습니다. GitHub와 Sites의 변경 사항은 자동 동기화되지 않습니다.

## 기능

- 공용 비밀번호 인증 및 7일 세션
- 운행 기록 등록·상세 조회·수정·삭제
- 출발지·목적지 분리 및 집으로 버튼
- 정비 기록 등록·상세 조회·수정·삭제
- 정비 항목 목록 관리 및 기타 정비 직접 입력
- 차량 모델·차량번호·누적 주행거리 설정
- 모바일 반응형 UI 및 전역 로딩 레이어

## 기술 구성

React, TypeScript, Vinext/Vite, Cloudflare Workers, Cloudflare D1, Drizzle ORM.

## 비밀정보와 데이터

`FAMILY_PASSWORD`와 `FAMILY_SESSION_SECRET`은 Sites의 서버 Secret으로 설정합니다. 실제 값은 저장소에 포함하지 않습니다. 비밀번호는 DB에 저장하지 않으며 서버에서 확인합니다. 환경변수 변경 후에는 Sites에서 재배포해야 적용됩니다.

실제 운행·정비 데이터는 운영 D1에 저장됩니다. 이 저장소에는 DB 구조와 마이그레이션만 포함되며 실제 데이터나 DB 백업은 포함하지 않습니다. `DB` 바인딩은 운영 플랫폼에서 연결합니다.

`.env.example`은 비밀값 없이 필요한 변수 이름만 안내합니다. 실제 `.env`와 로컬 DB 상태는 Git에서 제외합니다.

## 검증

Node.js >=22.13.0에서 의존성을 설치한 뒤 다음 검증을 실행할 수 있습니다.

```sh
npm run install:ci
node tests/vehicle-api.test.mjs
node tests/maintenance-form.test.mjs
npx tsc --noEmit --incremental false
```

`app/`은 화면과 API, `lib/`은 인증·검증·데이터 처리, `db/`와 `drizzle/`은 DB 구조, `tests/`는 검증 코드입니다.

## 저장 기준

Sites 소스 커밋: `5a5d81f315a3a5e103dc1ace9c80725d5af35baf` (버전 12). 최초 GitHub 저장은 이 시점의 소스 스냅샷이며, 이전 Sites Git 이력 전체를 복제하지 않았습니다.
