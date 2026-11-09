# 무야호농장

48×48칸의 땅을 열고 밭, 축사, 작업장과 장식을 배치하는 농장 게임입니다. ID와 비밀번호로 가입합니다. 같은 계정으로 휴대폰과 PC에서 이어서 플레이할 수 있습니다.

## 시작하기

1. Node.js 22 이상에서 `npm ci`를 실행합니다.
2. `.env.example`을 `.env.local`로 복사하고 아래 값을 채웁니다. 이미 프로젝트에 `.env.local`이 있으면 그 파일을 사용합니다.
3. Supabase에 아래의 DB 마이그레이션을 적용한 뒤 `npm run dev`를 실행합니다.
4. [localhost:3000](http://localhost:3000)에서 계정을 만들고, 표시되는 복구 코드를 저장한 뒤 로그인합니다.

| 환경 변수 | 값 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트의 Connect 화면에 표시되는 Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Connect 또는 Settings → API Keys의 `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | Settings → API Keys의 서버 전용 `sb_secret_…` |
| `FARM_AUTH_PEPPER` | 서버에서만 쓰는 64자리 소문자 16진수. 처음 한 번 생성한 뒤 보관합니다. |

새 환경에서 비밀값을 생성할 때는 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`를 사용합니다. 같은 Supabase DB를 쓰는 로컬과 Vercel은 같은 `FARM_AUTH_PEPPER`를 사용해야 합니다. 이 값을 바꾸면 기존 계정의 로그인과 복구가 끊깁니다. `.env.local`은 Git에서 제외됩니다.

## 농장 조작과 3D 모델

휴대폰은 가로 화면을 기준으로 구성했습니다. 한 손가락으로 드래그하면 이동하고, 두 손가락으로 확대하거나 축소합니다. PC에서는 마우스 드래그와 휠을 사용합니다. **편집**에서 시설을 선택한 뒤 빈 땅을 누르고 **배치**를 확정합니다. 기존 시설을 눌러 옮기거나 보관할 수 있습니다. 밭·길·울타리는 **여러 칸**을 선택해 드래그로 배치합니다. **농장 지도**에서는 인접 구역을 열거나 이름을 붙이고, **설정**에서는 카메라와 그래픽을 조절합니다.

밭과 축사에는 생산 시간이 따로 흐릅니다. 창고에서 상품을 팔고, 작업장에 가공을 예약하거나 주문서로 납품합니다. **농장 방문** 메뉴에서 초대 링크를 열고 닫을 수 있습니다. 로그인한 방문자는 방명록, 선물, 주문 지원을 이용합니다.

모든 3D 모델은 MIT로 공개된 파일입니다. [모델별 원본과 SHA-256](public/models/sources.json), [Holokat](public/models/HOLokat-MIT.txt), [CropForge](public/models/CropForge-MIT.txt), [Microsoft](public/models/Microsoft-MIT.txt)의 라이선스 고지를 모델과 함께 보관합니다. 제목·버튼 글꼴은 SIL Open Font License 1.1로 공개된 [Jua](https://fonts.google.com/specimen/Jua)(Woowahan Brothers)를 `next/font`로 불러옵니다. 로그인 배경은 이 모델로 구성한 장면을 캡처한 이미지입니다. Chrome, Edge 등 WebGL 2를 지원하는 브라우저에서 3D 화면을 열 수 있습니다.

## 데이터베이스와 검사

현재 연결한 개발 프로젝트에는 자유 배치 저장 구조가 적용되어 있습니다. 새 DB에는 `supabase/migrations/`의 SQL을 순서대로 적용합니다. 이번 업데이트 이후 기존 계정으로 처음 로그인할 때 새 농장이 생성되며, 이후 플레이는 새 농장에 저장됩니다. 이전 농장 저장 데이터는 기존 테이블에 남지만 새 농장으로 옮기지는 않습니다. 서버는 계정별 스냅샷의 버전을 검사해 다른 기기의 변경을 덮어쓰지 않습니다.

- `npm test`는 ID, 비밀번호, 복구 코드 처리 규칙, 농장 배치·생산·교류, 터치 판정과 모델 출처를 검사합니다.
- `npm run build`는 배포용 Next.js 빌드를 생성합니다.
- `tests/open-farm.sql`은 동시 저장 충돌, 두 계정 간 원자적 갱신, 공유 링크와 권한을 검사하고 테스트 데이터를 롤백합니다.

## Vercel에 배포하기

GitHub 비공개 저장소를 Vercel의 **Add New → Project**에서 가져오고, Environment Variables에 위 네 값을 추가합니다. 첫 지인 테스트에는 [배포 접근 보호](https://vercel.com/docs/deployment-protection)를 켠 Preview 배포를 공유합니다. 게임 내 계정만으로 접속 범위가 제한되지는 않습니다.



