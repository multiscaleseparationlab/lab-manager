# 시약 관리 (Lab Reagent Manager)

승인된 연구실 구성원이 시약을 정해진 보관함에 등록하고 검색·폐기하는 웹페이지입니다.

- **검색** (`index.html`): 영문·한글 이름 · 약칭 · CAS · 상품코드 · 동의어(예: EtOH, ethyl alcohol)로 검색합니다. 폐기된 시약은 결과에서 빠집니다. 결과가 없으면 "이 시약 등록하기" 버튼이 나옵니다.
- **등록** (`register.html`)
  - CAS 번호, 상품코드, 영문 이름, 한글 이름 중 하나를 입력하면 정보를 자동으로 채웁니다.
    - PubChem: 영문명 · 분자식 · GHS 정보
    - 한국환경공단 API: 국문명 · KE번호 · 화학물질관리법 분류(유독물질, 사고대비물질 등)
    - 안전보건공단 API: KOSHA MSDS 연결, 한글 이름 검색
  - 관리 대상 물질(사고대비물질 등)이면 경고를 보여줍니다.
  - 상품코드는 연구실 안에서 한 번 CAS와 함께 등록하면, 그다음부터는 코드만 입력해도 자동으로 채워집니다.
  - 같은 시약이 이미 있으면 중복 경고를 보여줍니다.
  - 보관함 종류와 GHS 위험 분류가 맞지 않으면 경고합니다.
- **시약 상세** (`reagent.html`): 상태(미개봉/사용중) · 보관함 · 양 · 약칭 · 한글 이름 · 메모를 수정하고 **폐기 버튼**으로 폐기합니다.
  - **MSDS 링크**: 제조사 MSDS(직접 입력한 주소), KOSHA MSDS, 제조사 사이트 SDS 찾기(Sigma-Aldrich · TCI · Thermo), PubChem 안전정보
  - 화학물질관리법 분류를 보여주고, 다시 불러올 수 있습니다.
- **폐기 목록** (`disposed.html`)
  - 폐기된 시약 전체를 폐기일 · 폐기자 · 사유와 함께 보여줍니다.
  - CSV로 내보낼 수 있습니다.
  - 관리자는 잘못 폐기한 시약을 복원할 수 있습니다.
- **관리** (`admin.html`, 관리자만): 보관함과 승인된 사용자를 관리합니다.

## 바로 써보기 (데모 모드)

`js/config.js`가 비어 있으면 **데모 모드**로 동작합니다. 데이터는 그 브라우저에만 저장됩니다.

```bash
py -m http.server 8770
```

브라우저에서 http://localhost:8770 를 엽니다. 데모 데이터를 초기화하려면 브라우저 개발자 도구 콘솔에서 `localStorage.removeItem('reagent-manager-demo-v2')`을 실행한 뒤 새로고침합니다.

데모 모드에서는 공공데이터 API(국문명 · 법적 분류 · 한글 이름 조회)가 꺼져 있습니다. MSDS 링크(KOSHA 검색 · 제조사 · PubChem)는 키 없이도 동작합니다.

## 실제 운영 설정 (Supabase + GitHub Pages, 무료)

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 에서 새 프로젝트를 만듭니다. 리전은 Northeast Asia (Seoul)을 권장합니다.
2. **SQL Editor**를 열고 `supabase/schema.sql` 전체를 붙여넣어 실행합니다.
3. 맨 아래 주석 처리된 줄의 이메일을 본인 Google 계정으로 바꿔 실행합니다. 이 계정이 첫 관리자가 됩니다.
   ```sql
   insert into approved_users (email, name, is_admin) values ('본인이메일@gmail.com', '이름', true);
   ```
4. 예시 보관함 8개가 만들어집니다. 나중에 '관리' 페이지에서 연구실에 맞게 바꾸면 됩니다.

### 2. Google 로그인 연결
1. [Google Cloud Console](https://console.cloud.google.com/) → API 및 서비스 → 사용자 인증 정보로 갑니다.
2. **OAuth 클라이언트 ID**를 만듭니다. 유형은 '웹 애플리케이션'입니다.
3. 승인된 리디렉션 URI에 `https://<프로젝트ID>.supabase.co/auth/v1/callback` 을 넣습니다.
4. Supabase → Authentication → Providers → Google을 켜고, 발급받은 Client ID와 Secret을 입력합니다.
5. Supabase → Authentication → URL Configuration에서 배포할 주소를 **Site URL**과 **Redirect URLs**에 넣습니다.
   - 배포 주소 예: `https://<깃허브아이디>.github.io/<저장소>/`
   - 로컬 테스트용으로 `http://localhost:8770/**` 도 추가합니다.

### 3. 설정값 입력
Supabase → Project Settings → API에서 값을 복사해 `js/config.js`에 넣습니다.

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';   // anon public key (공개돼도 괜찮음)
```

> **service_role key는 절대 넣지 마세요.** 권한은 DB의 RLS 정책이 막습니다.

### 4. GitHub Pages 배포
1. 이 폴더를 새 GitHub 저장소에 올립니다.
2. 저장소 Settings → Pages → Branch: `main` / root를 선택합니다.
3. 몇 분 뒤 `https://<아이디>.github.io/<저장소>/` 에서 열립니다.

### 5. 공공데이터 API 연결 (국문명 · 법적 분류 · KOSHA MSDS · 한글 이름 조회)
인증키는 브라우저에 노출되면 안 되므로, Supabase Edge Function(`supabase/functions/chem-info`)이 중간에서 호출합니다.

1. [공공데이터포털](https://www.data.go.kr)에 로그인한 뒤 아래 두 API를 **활용신청**합니다. 개발계정은 자동 승인됩니다.
   - [한국환경공단_화학물질 정보 조회 서비스](https://www.data.go.kr/data/15149420/openapi.do)
   - [한국산업안전보건공단_물질안전보건자료 조회 서비스](https://www.data.go.kr/data/15157612/openapi.do)
2. 마이페이지에서 **일반 인증키(Decoding)** 를 복사합니다. 두 API는 같은 키를 씁니다.
3. 키를 Supabase에 시크릿으로 저장합니다. 방법은 둘 중 하나입니다.
   - 대시보드: Edge Functions → Secrets → `DATA_GO_KR_KEY`
   - CLI:
     ```bash
     npx supabase secrets set DATA_GO_KR_KEY=발급받은키 --project-ref <프로젝트ID>
     ```
   > 키를 `js/config.js`나 다른 파일, 채팅에 넣지 마세요.
4. Edge Function을 배포합니다.
   ```bash
   npx supabase functions deploy chem-info --project-ref <프로젝트ID>
   ```
   CLI를 쓰지 않으려면 대시보드의 Edge Functions → Deploy a new function에서 이름을 `chem-info`로 하고, `index.ts` 내용을 붙여넣어도 됩니다.
5. `js/config.js`의 `USE_KR_CHEM_API`가 `true`인지 확인합니다. 배포하지 않을 거라면 `false`로 두세요.

Edge Function은 승인된 사용자(`approved_users`)의 요청만 처리합니다. 개발계정의 하루 호출 한도는 환경공단 10,000건, 안전보건공단 2,000건입니다. 연구실 규모라면 충분합니다.

### 6. 구성원 추가
관리자로 로그인한 뒤 **관리** 페이지에서 구성원의 Google 이메일을 추가합니다. 등록되지 않은 계정은 로그인해도 '승인 대기' 화면만 보입니다.

## 권한 정리

| 작업 | 승인 사용자 | 관리자 |
|---|---|---|
| 검색 / 등록 / 수정 / 폐기 | ✅ | ✅ |
| 폐기 시약 복원 | ❌ | ✅ |
| 보관함 · 사용자 관리 | ❌ | ✅ |

권한은 브라우저가 아니라 DB(`schema.sql`의 RLS 정책과 트리거)에서 강제합니다. 폐기와 복원 시 날짜와 처리자도 서버에서 기록합니다.

## 알아둘 점 / 한계

- **상품코드**: 시약 회사들은 공개 API가 없어 직접 조회할 수 없습니다. 그래서 연구실 안에서 쌓이는 캐시 방식을 씁니다.
  - `179124-1L`처럼 끝에 용량이 붙은 코드는 용량을 읽어 자동으로 채웁니다.
  - 같은 기본 코드의 다른 용량(`179124-500ML`)도 조회됩니다.
- **한글 이름**: 공공데이터 API를 연결하면 국문명이 자동으로 채워집니다. 연결하지 않았다면 한글 이름 칸이나 약칭 칸(예: 염산)에 직접 넣어도 한글로 검색됩니다.
- **한글 이름 조회**: 안전보건공단 MSDS 목록에 있는 물질만 찾을 수 있습니다. 한국환경공단 API는 한글 이름 검색을 지원하지 않습니다(영문명 · CAS · 고유번호만 가능).
- **MSDS**: KOSHA MSDS는 참고용입니다. 법적으로는 시약을 공급한 업체의 MSDS를 갖춰야 하므로, 병과 함께 받은 SDS 주소를 '제조사 MSDS 주소' 칸에 넣어 두는 것을 권장합니다.
- **화학물질관리법 분류**: 한국환경공단 데이터 기준이며 참고용입니다. 함량 기준이 있는 분류(예: '○○ 및 이를 10% 이상 함유한 혼합물')는 실제 농도를 확인하세요.
- **예전에 등록한 시약**: 상세 페이지의 '국문명·법적 분류·MSDS 다시 불러오기' 버튼으로 채울 수 있습니다.
- **GHS 정보**: PubChem에 보고된 여러 출처의 분류를 합친 것이라, 실제 병의 MSDS보다 항목이 많을 수 있습니다. 호환성 경고는 참고용이며 등록을 막지 않습니다.
- **용액·혼합물**: CAS는 주성분 기준으로 넣고, '용액·혼합물인 경우' 칸에 농도와 용매를 적습니다.

## 파일 구조

```
index.html / register.html / reagent.html / disposed.html / admin.html
css/style.css
js/config.js       설정 (Supabase URL/키)
js/db.js           데이터 계층 선택 (Supabase ↔ 데모)
js/db-supabase.js  Supabase 구현
js/db-demo.js      데모(localStorage) 구현
js/pubchem.js      PubChem 조회
js/lookup.js       CAS 검증 · 상품코드 파싱
js/compat.js       GHS 기반 보관 호환성 규칙
js/krchem.js       국문명 · 법적 분류 · MSDS 링크
js/nav.js          상단 메뉴 · 로그인 확인
js/ui.js           공통 도우미
js/search.js, register.js, reagent.js, disposed.js, admin.js   페이지별 스크립트
supabase/schema.sql  테이블 · RLS · 트리거 · 초기 데이터 (다시 실행하면 새 컬럼이 추가됨)
supabase/functions/chem-info/index.ts  공공데이터포털 API 중계 Edge Function
```
