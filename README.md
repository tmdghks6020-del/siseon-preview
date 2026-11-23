# 시선 데모

모바일 화면을 기준으로 만든 사회 쟁점 토론 커뮤니티 프로토타입입니다.

## 열어보기

`index.html`을 브라우저에서 열면 됩니다. 별도 설치나 서버가 필요 없습니다. 한글 글꼴은 인터넷 연결 시 Google Fonts를 사용하고, 연결되지 않으면 기기 기본 글꼴로 표시됩니다.

## 들어 있는 동작

- 진행 중 투표와 지난 투표 아카이브 화면
- 여러 분야의 진행 중 투표 30개와 개별 상세 화면
- 좌우 화살표로 넘기는 투표 캐러셀 (넓은 화면 2개, 모바일 1개씩)
- 후보 등록 단계 없이 편집팀이 선정한 30개 주제 바로 편성
- 관리자 편성 화면에서 안건 검토·수정·미리보기·승인·반려
- 승인 시 새 투표를 바로 공개하고 현재 목록의 마지막 투표를 시연 보관 처리해 30개 유지
- 승인·반려 기록을 관리자 화면에 표시
- 관리자 대시보드와 투표·회원·신고·문의·제휴·운영 기록 상세 메뉴
- 회원 검색, 역할 변경, 경고·7일 정지·정지 해제와 게시글 숨김·삭제·복구 시연
- 처리 사유를 남기는 운영 기록과 CSV 내려받기
- 이슈 상세와 찬성·반대 주장 비교
- 투표 전 결과와 토론 숨김, 시연 투표 후 열기
- 제목·내용을 분리해 토론 글 작성, 투표 선택에 맞춘 찬성·반대·보류 배지
- 투표 후 글 제목을 눌러 본문을 펼치고, 입력창에서 댓글 등록
- 토론 글마다 신고 사유와 설명을 접수해 관리자 신고함으로 전달
- 푸터의 회원 문의·제휴 문의 양식에서 접수한 내용을 관리자 인박스에 전달
- 사용자 메뉴와 홈 상단의 한 줄 공지에서 공지 목록·상세로 이동
- 운영 원칙, 닉네임 사용, 신고·제재, 투표 결과 공개, 개인정보 보호 안내 공지 기본 등록
- 관리자 공지 작성·수정·게시/내리기·상단 고정 관리
- 익명 별칭 자유토론장과 댓글·신고, 관리자 게시글 숨김·복구
- 이용자 다음 주제 제안과 관심 표시, 관리자 검토 후 편집 안건으로 전달
- 투표별 토론을 찬성·반대 글, 질문·자료, 정정 요청으로 분류하고 자료 링크 표시
- 관리자에서 제안 검토, 익명 자유토론 글과 투표별 이용자 작성 글을 별도 관리

시연 로그인, 관리자 모드, 안건 승인·공지·제재 기록, 신고·문의·제휴 접수, 익명 게시물·댓글·주제 제안, 관심 표시와 투표 선택은 브라우저 저장소에만 기록되고 서버로 전송되지 않습니다. 익명 별칭은 이 브라우저에서만 계정 시연값과 연결되며 실제 인증이나 신뢰할 수 있는 제재 식별 수단이 아닙니다. 관리자 회원·신고·문의 수치는 예시 데이터이며 실제 이용자 데이터가 아닙니다. 관리자 시연 진입은 실제 인증이 아니므로 공개 서비스의 권한 보호로 사용할 수 없습니다. 실제 서비스에는 서버 기반 관리자 인증·역할 권한·감사 이력, 1인 1표, 게시물·댓글 저장, 접수 알림, 예약 발행, 30일 후 자동 보관, 6개월 후 읽기 전용 전환이 필요합니다.

주제 편성 기준과 이슈 수명 주기는 [CONTENT_GOVERNANCE.md](CONTENT_GOVERNANCE.md)에 정리했습니다.

## AI 안건 검토와 생성

AI 안건은 사이트 배포 때 자동 생성되지 않습니다. 관리자가 **AI 안건 검토 → 최신 이슈 후보 5개 생성**을 눌렀을 때만 Supabase Edge Function이 Bing News 주요 기사 RSS와 웹 검색으로 후보 10개를 찾고, 각 주제의 Bing News RSS 최근 7일 기사 수를 비교해 상위 5개를 저장합니다. 이 RSS 형식은 공식 검색 API로 보장되는 인터페이스가 아니므로 응답 형식이나 접근이 바뀔 수 있고, 피드에 반환된 기사 수는 전체 보도량이나 여론조사가 아닙니다. 따라서 편집 참고 지표로만 사용합니다. 선거 관련 주제는 제외하지만 선거와 무관한 정책·정치 토론은 분야로 선택할 수 있습니다. 생성 성공 시 `topic_candidates`의 기존 행을 새 후보 5개로 교체하며, 승인·반려 감사 기록은 별도 운영 기록에 남습니다.

먼저 SQL Editor에서 `supabase/migrations/202611230002_topic_candidate_review.sql`을 한 번 실행하고, 새 버전 `content-admin` Edge Function을 배포하세요. Edge Function Secrets에 기존 `OPENAI_API_KEY`가 필요합니다. Bing News RSS 사용에는 별도 Bing 또는 Naver API 키를 요구하지 않습니다. RSS 요청이 거부되거나 응답 형식이 바뀌면 후보 생성이 중단되고 관리자 화면에 오류가 표시됩니다.

네이버 크리에이터 어드바이저의 유입 검색어는 채널 계정별 비공개 데이터이므로 이 앱이 자동으로 가져오지 않습니다. 관리자 화면에 본인이 확인한 상위 유입 검색어를 선택적으로 붙여 넣으면 후보 탐색 참고용으로만 전달합니다. Bing News RSS는 공식 검색 API가 아니고 피드에 반환되는 기사가 제한될 수 있습니다. 비교 결과는 이 피드와 검색어에 종속되므로 전체 뉴스 보도량이나 일반 여론을 나타내지 않습니다. 생성 후보는 운영자가 출처·최신성·사실·찬반 균형을 확인하고 직접 승인해야 합니다. 승인된 안건의 공개 투표 게시판 반영은 현재 정적 사이트의 브라우저 시연 동작입니다. 실제 모든 이용자에게 동일한 투표를 게시하려면 공개 투표 데이터도 Supabase 저장소로 연결해야 합니다.

## AI 홍보 콘텐츠와 외부 채널 발행

관리자 메뉴 **콘텐츠 자동화**는 Supabase Auth, PostgreSQL, RLS, Edge Functions를 사용하도록 구성했습니다. 공개 GitHub Pages에는 Supabase URL과 publishable key만 두고, OpenAI·Meta 비밀 키와 Supabase 서버 키는 Edge Functions secrets에 둡니다.

### Supabase 준비

1. Supabase 프로젝트를 만들고 Authentication에서 이메일·비밀번호 로그인을 켭니다. 운영자 계정은 직접 생성하고 공개 회원가입은 운영 정책에 맞게 제한하세요.
2. `supabase-config.js`에 Project URL과 **publishable key**를 입력합니다. 이 값은 브라우저 공개용입니다. `secret` 키나 예전 `service_role` 키를 이 파일에 넣으면 안 됩니다.
3. Supabase CLI에서 `supabase login`과 `supabase link --project-ref YOUR_PROJECT_REF`를 실행하고 `supabase db push`로 `supabase/migrations/`의 테이블, RLS, 승인 검증 함수를 적용합니다.
4. Supabase Authentication에서 `user_roles` 테이블에 운영자 사용자 UID와 `admin` 역할을 SQL Editor로 등록합니다: `insert into public.user_roles(user_id, role) values ('AUTH_USER_UUID', 'admin');` 이 표는 브라우저에서 읽거나 수정할 수 없고 Edge Function만 관리자 역할을 확인합니다.
5. Edge Function secrets로 `OPENAI_API_KEY`, `META_ACCESS_TOKEN`, `THREADS_ACCESS_TOKEN`, `SISEON_SITE_URL`, `META_GRAPH_VERSION`, `META_FACEBOOK_PAGE_ID`, `META_INSTAGRAM_USER_ID`, `META_THREADS_USER_ID`, `SCHEDULER_SECRET`을 등록합니다. Supabase URL과 서버 secret key는 런타임 기본 환경 변수에서 읽습니다. `secret` key는 절대 공개 파일이나 GitHub Pages에 올리지 마세요.
6. `supabase functions deploy content-admin`과 `supabase functions deploy publish-scheduled`로 함수를 배포합니다. `publish-scheduled`는 사용자 JWT 대신 `SCHEDULER_SECRET`을 검사하도록 설정되어 있습니다.
7. Supabase Database의 `pg_cron`, `pg_net`, `supabase_vault` 확장을 켜고 [cron.sql](supabase/cron.sql)의 프로젝트 URL·키·스케줄 비밀값을 Vault에 저장한 뒤 5분 예약 작업을 등록합니다. GitHub Pages는 `index.html`, `app.js`, `content-automation.js`, `supabase-config.js`, `styles.css`, `assets/`를 포함해 갱신합니다. Pages와 Supabase 함수는 각각 배포해야 합니다.

### 운영 흐름과 플랫폼 제약

- 콘텐츠 자동화 화면은 한 이슈의 제목·요약·찬반 관점·참고 URL을 받아 플랫폼별 초안을 생성합니다. 초안은 무조건 검토 대기이며, PostgreSQL의 승인 검증 함수와 서버 함수에서 모두 승인 여부를 확인합니다. 네 테이블은 RLS가 켜져 있고 브라우저 접근 권한을 부여하지 않았습니다.
- 검토자는 콘텐츠 JSON을 수정하거나 승인·반려할 수 있습니다. Meta 플랫폼은 승인 후 예약 게시 대기열로 보낼 수 있고, Cron이 5분 간격으로 처리합니다. 실패 작업은 관리자가 최대 3회 재시도할 수 있습니다. 게시 ID·URL·실패 내용을 보관합니다.
- Instagram은 공개 HTTPS 이미지 URL이 필요합니다. AI는 이미지 제작 지시문을 생성하지만 이미지 파일 호스팅·자동 카드뉴스 이미지 제작은 아직 붙어 있지 않으므로 관리자가 편집 JSON에 `imageUrl`을 제공해야 게시할 수 있습니다. Facebook Page Feed의 `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` 및 페이지의 게시 권한이 필요합니다. Instagram은 전문 계정, 로그인 유형에 맞는 권한과 앱 검수가 필요합니다.
- Threads는 Facebook/Instagram용 Meta 토큰을 공유하지 않고 Threads 전용 OAuth 토큰을 사용합니다. 게시 권한은 `threads_basic`, `threads_content_publish`이며, API는 컨테이너 생성 후 게시하는 두 단계로 연결합니다. Threads 사용자 ID와 앱 검수 설정도 필요합니다.
- 네이버 블로그 외부 글쓰기 API는 종료되어 자동 발행하지 않습니다. 초안을 복사해 직접 게시한 뒤 실제 `blog.naver.com` 게시 주소를 등록합니다.
- UTM 링크는 이슈·플랫폼·콘텐츠 ID별로 생성합니다. 다만 저장소의 투표·게시글은 현재 브라우저 시연 데이터라 실제 방문자 수나 실제 투표 전환율을 안전하게 산출할 수 없습니다. GA4/서버 기반 실사용자 투표가 연결될 때까지 전환 분석 숫자를 만들어 표시하지 않습니다. 공개 Pages에서 어떤 행동도 자동으로 실투표 통계에 반영되지 않습니다.
- Meta 토큰 만료 상태를 자동 갱신하거나 계정을 OAuth로 직접 연결하는 화면은 아직 없습니다. 운영자는 Meta 개발자 콘솔에서 발급·갱신하고 Supabase Edge Function secrets를 교체해야 합니다. 토큰 권한·만료, 인스타 이미지 준비, 게시물 주소는 실제 운영 계정으로 검증해야 합니다.

Edge Functions·Cron의 실제 사용 가능 범위와 비용은 Supabase 요금제 및 사용량에 따릅니다. 이 작업공간에는 실제 Supabase 프로젝트·Meta 계정 정보가 없어 실제 외부 게시를 수행하거나 API 연결 성공을 확인하지 않았습니다. 월 비용은 함수 호출, 데이터베이스·저장 공간, OpenAI 검색·토큰 사용량에 따라 달라져 이 코드만으로 고정할 수 없습니다. Supabase 사용량 알림과 OpenAI 사용 한도를 설정하세요.

## 검색엔진용 파일

`SITE_URL`을 실제 공개 주소로 설정한 뒤 배포 때 `node scripts/generate-seo-files.mjs`를 실행하면 현재 앱에 들어 있는 투표 상세 주소를 담은 `sitemap.xml`과 `robots.txt`를 만듭니다. Google Search Console과 네이버 서치어드바이저에서 사이트 소유권을 확인하고 사이트맵을 제출해야 합니다. 검색 등록은 노출이나 상위 순위를 보장하지 않습니다.

투표 상세 화면은 공유 가능한 `?issue=...` 주소와 페이지별 제목·설명·canonical·Open Graph·WebPage 구조화 데이터를 설정합니다. 다만 현재 사용자 게시글·댓글과 관리자 승인 결과는 브라우저 저장소에만 있습니다. 서버의 공개 데이터와 게시글별 주소가 없으면 모든 이용자 글과 댓글을 검색엔진에 안정적으로 제공하거나 사이트맵에 넣을 수 없습니다. 게시글·댓글의 검색 노출은 신고·개인정보·혐오·스팸 검토 후 공개된 글만 대상으로 하는 편이 안전합니다. 실제 사이트 도메인과 서버 저장 기능을 연결한 뒤 서버 렌더링 또는 정적 페이지 생성을 추가해야 합니다.
