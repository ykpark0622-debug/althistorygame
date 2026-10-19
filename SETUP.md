# 역사의 갈림길 갤러리 — 설치 안내서

이 폴더를 **Vercel(사이트 호스팅) + Supabase(데이터베이스·로그인)**에 올리면, 이용자끼리 시나리오를 올리고 플레이하고 좋아요를 누르는 사이트가 됩니다. 모두 무료 요금제로 운영할 수 있습니다.

## 기존 사이트를 V2로 업데이트하는 경우

1. 현재 데이터베이스와 별도 보관할 시나리오 JSON을 백업합니다.
2. Supabase SQL Editor에서 `supabase/migrate-v2.sql` 전체를 실행합니다. 새 설치라면 아래 1단계의 `supabase/schema.sql`을 사용하세요.
3. 웹 파일을 같은 위치에 교체합니다. 새 `map-templates.js`와 지도·편집기용 파일도 함께 올리세요. `config.js`의 기존 프로젝트 설정은 유지합니다.
4. 갤러리에서 V1/V2·진행 방식·지도 배지가 표시되는지 확인합니다. 익명·Google 로그인 설정과 관리자 등록은 기존 설정을 사용합니다.

마이그레이션은 계정·게시물·좋아요·신고를 삭제하지 않고 버전 검사와 목록 표시 정보를 추가합니다. 여러 번 실행할 수 있습니다. 신규 업로드는 본문에 따라 버전·모드·지도를 서버가 계산합니다. 목록에 V2 업데이트 오류가 뜨면 마이그레이션 적용과 Supabase의 스키마 갱신을 확인하세요.

V1은 기존 사건형 원고입니다. V2는 `mode:"chronicle"` 또는 `mode:"reign"`을 사용하며 지도를 선택할 수 있습니다. 공개하려면 초안 상태를 마치고 JSON으로 내보낸 뒤 갤러리에서 파일을 선택하세요. 1 MB 제한은 두 형식에 동일하게 적용됩니다. 지도 그림은 프로그램에 포함되어 있어 원고에 SVG 경로를 넣지 않습니다.

지도 도형은 제공된 시연판의 Natural Earth 기반 현대 지역 구획을 묶은 것으로 실제 역사적 경계와 다를 수 있습니다. 실행 중 지도 파일을 외부 서비스에서 받지 않습니다. 원자료는 [Natural Earth의 퍼블릭 도메인 자료](https://www.naturalearthdata.com/about/terms-of-use/)이며, 해당 시대의 소유·점령·영향권은 시나리오에서 따로 정의합니다.

| 누가 | 무엇을 할 수 있나 |
| --- | --- |
| 누구나 (로그인 없이) | 갤러리 둘러보기, 검색·정렬, 플레이, 좋아요, JSON 받기, 만들기·편집 |
| 구글 로그인한 사람 | 위의 모든 것 + 시나리오 올리기, 내 시나리오 수정·내용 교체·삭제, 신고 |
| 관리자 | 위의 모든 것 + 신고·숨김 목록 보기, 다시 공개, 숨기기, 삭제 |

- 좋아요는 로그인 없이 누를 수 있습니다. 처음 누를 때 브라우저에 '익명 계정'이 자동으로 만들어집니다.
- 신고가 **3건** 쌓이면 시나리오가 자동으로 숨겨지고, 관리자가 '관리' 탭에서 확인합니다.
- 한 사람은 **10분에 5개, 전체 50개**까지 올릴 수 있습니다. 시나리오 하나는 **1 MB**까지입니다.
- 숫자는 `supabase/schema.sql` 맨 위의 '운영 설정'에서 바꿀 수 있습니다.

준비물: **GitHub, Vercel, Supabase, Google** 계정. 모두 무료입니다. 처음 설정에는 40분~1시간쯤 걸립니다.

---

## 1단계. Supabase 프로젝트와 데이터베이스 만들기

1. [supabase.com](https://supabase.com)에 GitHub 계정으로 가입하고 **New project**를 누릅니다.
2. 이름(예: `history-gallery`)과 데이터베이스 비밀번호를 정하고, Region은 **Northeast Asia (Seoul)**을 고릅니다. 요금제는 **Free**입니다.
3. 프로젝트가 만들어지면 왼쪽 메뉴 **SQL Editor → New query**를 엽니다.
4. 이 폴더의 `supabase/schema.sql` 내용을 **전부** 복사해 붙여 넣고 **Run**을 누릅니다. `Success`가 나오면 됩니다.
   - 왼쪽 **Table Editor**에 `scenarios`, `likes`, `reports`, `admins` 표가 보이면 성공입니다.
   - 이 파일은 여러 번 실행해도 안전합니다. 설정 숫자를 바꿨을 때도 다시 실행하면 됩니다.

## 2단계. config.js에 주소와 공개 키 넣기

1. Supabase 화면 위쪽의 **Connect** 버튼(또는 **Project Settings → API Keys**)을 엽니다.
2. **Project URL**과 **publishable 키**(`sb_publishable_…`로 시작)를 복사합니다. 화면에 publishable 키가 없으면 **anon public 키**를 쓰면 됩니다.
3. 이 폴더의 `config.js`를 메모장으로 열어 두 값을 넣고 저장합니다.

```js
window.HC_COMMUNITY = {
  supabaseUrl: 'https://abcdefghijkl.supabase.co',
  supabaseKey: 'sb_publishable_xxxxxxxxxxxxxxxx'
};
```

> **주의:** `secret` 키나 `service_role` 키는 절대 넣지 마세요. 그 키가 공개되면 누구나 데이터베이스 전체를 지울 수 있습니다. publishable/anon 키는 공개되어도 안전하도록 설계되어 있고, 실제 권한은 1단계에서 만든 보안 규칙이 지킵니다.

## 3단계. GitHub에 올리고 Vercel로 배포하기

1. GitHub에서 **New repository**를 만듭니다(Public 또는 Private 모두 가능).
2. **Add file → Upload files**에 이 폴더 **안의 파일과 폴더를 모두** 끌어 놓고 **Commit changes**를 누릅니다. `index.html`이 저장소 맨 위에 있어야 합니다.
   - Mac에서는 이름이 점으로 시작하는 `.github` 폴더가 숨겨져 같이 올라가지 않을 수 있습니다. 7단계에서 따로 만드는 방법을 안내합니다.
3. [vercel.com](https://vercel.com)에 GitHub 계정으로 가입하고, 요금제는 **Hobby(무료)**를 고릅니다.
4. **Add New → Project**에서 방금 만든 저장소를 **Import**합니다.
5. **Framework Preset은 `Other`**로 두고, Build Command와 Output Directory는 비워 둔 채 **Deploy**를 누릅니다. 이 사이트는 빌드 과정이 없습니다.
6. 1분쯤 뒤 `https://프로젝트이름.vercel.app` 주소가 생깁니다. 이 주소를 **사이트 주소**라고 부르겠습니다.

이제 사이트 주소의 `/gallery.html`을 열면 갤러리가 보입니다. 로그인과 좋아요는 아직 안 되고, 4~5단계를 마쳐야 됩니다.

> 이후에 파일을 고쳐 GitHub에 다시 올리면, Vercel이 자동으로 새로 배포합니다.

## 4단계. Supabase 로그인 설정

Supabase 왼쪽 메뉴 **Authentication**에서 설정합니다. 메뉴 이름은 Supabase 화면 개편에 따라 조금 다를 수 있습니다.

1. **Sign In / Providers**(또는 Providers) 화면에서
   - **Allow anonymous sign-ins**를 켭니다. 로그인 없이 좋아요를 누르는 데 필요합니다.
   - **Allow manual linking**을 켭니다. 익명으로 좋아요를 누른 사람이 나중에 구글로 로그인해도 좋아요가 유지됩니다.
   - 공급자 목록에서 **Email**을 눌러 **끕니다(Disable)**. Supabase는 처음에 이메일 가입이 켜져 있습니다. 켜 두면 일회용 이메일로 계정을 여러 개 만들어 올리기·신고를 할 수 있어서, 신고 3건 자동 숨김을 악용할 수 있습니다. 이 사이트는 구글 로그인만 씁니다.
2. **URL Configuration** 화면에서
   - **Site URL**에 사이트 주소(`https://프로젝트이름.vercel.app`)를 넣습니다.
   - **Redirect URLs**에 `https://프로젝트이름.vercel.app/**`를 추가합니다.
3. **Providers → Google**을 열어 두고, 거기 적힌 **Callback URL**(`https://abcdefghijkl.supabase.co/auth/v1/callback` 모양)을 복사해 둡니다. 다음 단계에서 씁니다.

## 5단계. 구글 로그인 연결하기

1. [Google Cloud Console](https://console.cloud.google.com)에서 새 프로젝트를 만듭니다(예: `history-gallery`).
2. **Google Auth Platform**(또는 'API 및 서비스 → OAuth 동의 화면')에서 시작하기를 누르고
   - 앱 이름(예: 역사의 갈림길), 사용자 지원 이메일, 개발자 연락처 이메일을 넣습니다.
   - 대상(Audience)은 **외부(External)**를 고릅니다.
3. **클라이언트(Clients) → 클라이언트 만들기**에서
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 JavaScript 원본: `https://프로젝트이름.vercel.app`
   - 승인된 리디렉션 URI: 4단계 3번에서 복사한 **Supabase Callback URL**
   - 만들기를 누르면 나오는 **클라이언트 ID**와 **클라이언트 보안 비밀**을 복사합니다.
4. **대상(Audience)** 화면에서 **앱 게시(Publish app)**를 눌러 '프로덕션' 상태로 바꿉니다. '테스트' 상태로 두면 직접 등록한 테스트 사용자만 로그인할 수 있습니다. 이 사이트는 이메일·이름 같은 기본 정보만 쓰므로 구글 심사는 필요 없습니다.
5. Supabase **Authentication → Providers → Google**로 돌아와 **Enable**을 켜고, 클라이언트 ID와 보안 비밀을 붙여 넣고 **Save**를 누릅니다.

사이트의 갤러리에서 **구글로 로그인**을 눌러 로그인이 되는지 확인하세요.

## 6단계. 나를 관리자로 등록하기

1. 사이트 갤러리에서 내 구글 계정으로 한 번 로그인합니다.
2. Supabase **SQL Editor**에서 아래를 실행합니다. 이메일은 내 구글 이메일로 바꾸세요.

```sql
insert into public.admins (user_id)
select id from auth.users where email = '내이메일@gmail.com';
```

3. 갤러리를 새로고침하면 **관리** 탭이 나타납니다. 신고된 시나리오와 숨겨진 시나리오를 보고 '다시 공개', '숨기기', '삭제'를 할 수 있습니다.

## 7단계. 일주일 휴면으로 멈추지 않게 하기 (권장)

Supabase 무료 프로젝트는 **1주일 동안 요청이 없으면 일시 정지**됩니다. 방문자가 꾸준하면 괜찮지만, 이용자가 뜸한 시기를 대비해 GitHub가 3일마다 갤러리를 한 번 조회하게 해 둡니다.

1. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**에서 두 개를 등록합니다.
   - `SUPABASE_URL`: config.js에 넣은 Project URL
   - `SUPABASE_KEY`: config.js에 넣은 publishable/anon 키
2. 저장소에 `.github/workflows/keep-supabase-awake.yml` 파일이 있는지 확인합니다. 없으면 **Add file → Create new file**에서 파일 이름 칸에 그 경로를 그대로 적고, 이 폴더의 같은 파일 내용을 붙여 넣어 만듭니다.
3. **Actions** 탭 → Keep Supabase awake → **Run workflow**로 한 번 실행해 초록색 체크가 나오면 끝입니다.

참고: GitHub는 저장소에 60일 동안 아무 변경이 없으면 예약 작업을 멈출 수 있습니다. 그때는 Actions 탭에서 다시 켜면 됩니다. 이미 멈췄다면 Supabase 대시보드에서 프로젝트를 **Restore**하면 데이터 그대로 다시 켜집니다.

---

## 무료 한도 (2026년 10월 확인)

| 서비스 | 무료로 주는 양 | 이 사이트 기준 체감 |
| --- | --- | --- |
| Vercel Hobby | 월 100 GB 전송, 비상업적 개인 용도만 | 사이트 파일이 작아 여유가 큽니다 |
| Supabase Free | 데이터베이스 500 MB | 시나리오 하나가 보통 20~60 KB → 약 1만 개 |
| Supabase Free | 월 5 GB 전송(egress) | 플레이 1회에 시나리오 1번 내려받음 → 월 10만 회 안팎 |
| Supabase Free | 월 활성 사용자 5만 명 | 좋아요를 누른 익명 방문자도 1명으로 셉니다 |
| Supabase Free | 1주일 휴면 시 일시 정지, 프로젝트 2개까지 | 7단계로 대비 |

- 목록 화면은 시나리오 본문을 빼고 제목·소개만 불러오므로 전송량을 아낍니다.
- 광고를 붙이는 등 **상업적으로 운영**하게 되면 Vercel Hobby 약관에 맞지 않습니다. 이 사이트는 빌드가 없는 정적 파일이라 GitHub Pages나 Cloudflare Pages에 **파일 그대로** 옮길 수 있습니다. 옮긴 뒤 4·5단계의 사이트 주소만 새 주소로 바꾸면 됩니다.
- 출처: [Supabase 요금](https://supabase.com/pricing), [Supabase 로그인 제한](https://supabase.com/docs/guides/auth/rate-limits), [Vercel Hobby](https://vercel.com/docs/plans/hobby)

## 알아 둘 점

- **플레이 수는 참고용입니다.** 누구나 볼 수 있는 숫자를 비용 없이 세느라 서버에서 사람을 구분하지 않습니다. 같은 브라우저에서는 하루 한 번만 세지만, 마음먹고 부풀리는 것까지 막지는 못합니다. 그래서 기본 정렬은 사람마다 한 번만 누를 수 있는 **좋아요 순**입니다.
- 좋아요도 브라우저 데이터를 지우고 다시 누르면 한 번 더 셀 수 있습니다. Supabase가 같은 인터넷 주소에서 익명 계정을 시간당 30개까지만 만들게 막아 두어서, 크게 부풀리기는 어렵습니다.
- 관리자가 다시 공개한 시나리오를 작성자가 고치면, 예전에 신고했던 사람들도 다시 신고할 수 있게 됩니다.

## 자주 생기는 문제

| 증상 | 확인할 것 |
| --- | --- |
| 갤러리에 '설정이 필요합니다'가 나옴 | `config.js`의 두 값이 비어 있거나 GitHub에 반영되지 않았습니다 |
| 목록을 불러오지 못함 | 1단계 SQL을 실행했는지, Supabase 프로젝트가 일시 정지되지 않았는지 확인 |
| 좋아요를 누르면 '익명 좋아요가 꺼져 있습니다' | 4단계 1번 Allow anonymous sign-ins |
| 구글 로그인 후 오류 페이지 또는 `redirect_uri_mismatch` | 5단계 3번의 리디렉션 URI가 Supabase Callback URL과 정확히 같은지 |
| 로그인 후 엉뚱한 주소로 이동 | 4단계 2번의 Site URL과 Redirect URLs |
| 일부 사람만 로그인됨 | 5단계 4번 앱 게시(프로덕션) |
| '잠시 후 다시 올려 주세요' | 10분에 5개 제한입니다. `schema.sql` 맨 위 숫자를 바꾸고 다시 실행 |

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `index.html`, `app.js`, `editor.js`, `flowchart.js`, `engine.js`, `ai-helper.js` | 만들기·플레이 프로그램 |
| `gallery.html`, `gallery.js`, `community.css` | 갤러리 페이지 |
| `community-bridge.js` | 갤러리에서 고른 시나리오를 플레이 화면으로 넘겨줌 |
| `config.js` | Supabase 주소와 공개 키 (2단계) |
| `vendor/supabase.js` | Supabase 공식 JavaScript 라이브러리 2.99.3 (MIT 라이선스) |
| `supabase/schema.sql` | 데이터베이스 표·보안 규칙·좋아요·신고·관리자 기능 (다시 실행하면 최신 내용으로 갱신) |
| `.github/workflows/keep-supabase-awake.yml` | 휴면 방지 예약 작업 (7단계) |
| `vercel.json` | 보안 헤더, config.js 캐시 끄기 |
| `standalone.html` | 인터넷 없이 여는 한 파일짜리 버전 (갤러리 기능 없음) |

## (선택) 오래된 익명 계정 정리

좋아요를 누른 적 없이 90일이 지난 익명 계정을 지우려면 SQL Editor에서 실행하세요.

```sql
delete from auth.users u
 where u.is_anonymous
   and u.created_at < now() - interval '90 days'
   and not exists (select 1 from public.likes l where l.user_id = u.id);
```
