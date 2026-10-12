# Sites → GitHub 소스 동기화

## 동작과 제한

실제 서비스와 환경변수, D1 데이터는 Sites에 유지합니다. 이 파이프라인은 소스 코드만 GitHub `main`에 보관합니다. GitHub에서 Sites로 배포하지 않습니다.

현재 Sites 플러그인은 저장하면 안 되는 단기 소스 토큰만 제공합니다. GitHub Actions가 그 토큰을 발급하거나 Sites 변경 이벤트를 직접 구독하는 연결은 없습니다. 따라서 **Sites에서 수정·게시한 뒤 소스를 GitHub `sites-sync` 브랜치로 전달하는 단계가 필요**합니다. 전달 이후 검증·`main` 갱신은 Actions가 자동 처리합니다. 전달하지 않은 Sites 변경을 Actions가 스스로 발견하지는 않습니다.

추가 GitHub Secret, Cloudflare 토큰, 가족 비밀번호는 필요하지 않습니다. Actions는 GitHub가 발급하는 저장소 한정 `GITHUB_TOKEN`의 `contents: write` 권한만 사용합니다. 워크플로는 `sites-sync`에 push되거나 Actions에서 수동 실행하면 동작합니다.

## 이후 Sites 수정 작업의 절차

1. 같은 Sites 프로젝트를 수정하고 기존 Sites 절차로 소스 저장·게시를 완료합니다.
2. 성공한 게시 버전의 정확한 소스 커밋과 버전 번호를 확인합니다. 실패한 배포나 미게시 소스는 전달하지 않습니다.
3. GitHub `main`의 `.github/scripts/sites_sync.py`로 추적된 소스 파일만 내보냅니다.

   ```sh
   python3 sites_sync.py export /path/to/sites-checkout /path/to/empty-snapshot \
     --ref <published-source-commit> --site-version <published-version-number>
   ```

4. 검증을 통과한 파일과 `.sites-sync/source.json`을 GitHub `sites-sync` 브랜치의 **한 커밋**으로 저장합니다. GitHub 플러그인의 Git tree/commit 도구 또는 인증된 Git을 사용합니다. 브랜치의 `.github` 워크플로는 유지하고, GitHub에만 있는 문서·파이프라인 파일을 소스로 덮어쓰지 않습니다. 삭제된 소스 파일도 새 스냅샷에서 제거합니다. 강제 push하지 않고 현재 브랜치 HEAD를 부모로 사용합니다.
5. `Sync Sites source` 실행 성공과 `main`의 `.sites-sync/state.json`에 기록된 Sites 커밋·버전이 일치하는지 확인합니다. 실패하면 완료로 보고하지 않습니다.

GitHub Actions가 만든 커밋의 `GITHUB_TOKEN` push는 다른 push 워크플로를 다시 실행하지 않으므로 순환하지 않습니다. 이 파이프라인은 코드 설치·빌드·실행이나 운영 DB 조회를 하지 않습니다.

## 안전장치

- 앱 소스 디렉터리와 필요한 설정 파일만 허용합니다.
- 환경변수 파일, DB 파일, 압축 백업, 개인 키, 심볼릭 링크와 Git 하위 모듈은 제외하거나 거부합니다.
- 흔한 토큰 형태와 공용 비밀번호/세션 키의 직접 입력을 검사합니다. 검사는 보조 장치이며 모든 비밀값을 탐지하는 보장은 아닙니다. 공개 브랜치에 보내기 **전에** 내보내기 검증과 검토를 수행합니다.
- 파일별 SHA-256, 프로젝트 ID, 게시 버전 번호를 확인합니다. 이전 버전으로 되돌리기는 거부합니다.
- `main`의 신뢰된 스크립트로 검증하고 들어오는 소스 코드는 실행하지 않습니다.
- README, `.github`, AGENTS.md, `.gitignore`, `.env.example` 등 GitHub 관리 파일은 동기화로 변경하지 않습니다.
- 기존 동기화 상태에 등록된 파일만 삭제 처리합니다.
- 동시 실행을 직렬화하고 `main`에 강제 push하지 않습니다. 동시에 다른 커밋이 추가되면 push가 실패하므로 새로 실행합니다.

## 결과 확인

저장소 Actions의 `Sync Sites source`에서 결과와 요약을 확인합니다. `.sites-sync/state.json`에는 마지막 반영한 Sites 버전, 원본 소스 커밋, GitHub 스냅샷 커밋과 파일 해시가 남습니다.

Sites 비밀번호 변경, 기록 추가·수정·삭제는 소스 변경이 아니므로 이 동기화 대상이 아닙니다.
