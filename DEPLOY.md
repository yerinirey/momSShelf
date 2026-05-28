# 엄마만의 서재 · 배포 가이드

## 아키텍처 (하이브리드)

| 컴포넌트 | 어디서 실행 | 이유 |
|---|---|---|
| 프론트엔드 + 인증 + DB + Storage 프록시 | **Vercel** | 빠른 CDN, 무료. 60초 안에 끝나는 모든 것 |
| 책 생성 (`/generate`, 2~3분 소요) | **Render** (Node 워커) | 타임아웃 없음, 무료 |
| DB · Storage · Auth | **Supabase** | 그대로 |

```
[브라우저]
   ├─ 페이지/책장/책 상세 ─→ Vercel
   └─ 책 생성             ─→ Render (POST /generate)
                              ├─ Anthropic Claude
                              └─ Supabase (DB + Storage)
```

---

## 로컬 실행

### 일반 (Next.js만)
```bash
npm run dev
```
`.env.local`에 `NEXT_PUBLIC_WORKER_URL`이 비어있으면 자동으로 `/api/generate` (Next.js 라우트) 사용. 타임아웃 없음 → 가장 빠른 iteration.

### 워커까지 같이 (배포 전 최종 검증)
터미널 1:
```bash
cd worker
cp ../.env.local .env
npm install
npm run dev          # http://localhost:8080
```
터미널 2:
```bash
# .env.local에 추가:
# NEXT_PUBLIC_WORKER_URL=http://localhost:8080
npm run dev
```
이 상태에서 책 한 권 생성해보고 정상 동작하면 Render 배포로 진행.

---

## 1단계 · GitHub 리포지토리

```bash
git add -A
git commit -m "ready for deploy"
gh repo create MomsShelf --private --source=. --push
```

또는 GitHub 웹에서 빈 리포 만들고:
```bash
git remote add origin https://github.com/<your>/MomsShelf.git
git push -u origin main
```

⚠️ `.env.local`은 `.gitignore`로 빠져있는지 확인.

---

## 2단계 · Render에 워커 배포

### 2-A. Render 가입
1. https://render.com → Sign Up (GitHub 계정 권장)

### 2-B. New Web Service
1. 대시보드 → **+ New** → **Web Service**
2. **Build and deploy from a Git repository** → Connect → MomsShelf 선택
3. 설정:
   - **Name**: `moms-shelf-worker`
   - **Region**: Singapore 또는 Oregon (가까운 곳)
   - **Branch**: `main`
   - **Root Directory**: `worker`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run start`
   - **Instance Type**: **Free**

### 2-C. Environment Variables 등록

| Key | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `SUPABASE_URL` | `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` 값 |
| `SUPABASE_ANON_KEY` | `.env.local`의 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 값 |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`에서 그대로 |
| `ANTHROPIC_API_KEY` | `.env.local`에서 그대로 |
| `ALLOWED_EMAILS` | `ggominoona@gmail.com,audry1201@naver.com` |
| `ALLOWED_ORIGINS` | (잠시 뒤 Vercel 도메인. 일단 `*` 입력) |

**Create Web Service** 클릭 → 2~5분 대기.

### 2-D. 동작 확인
배포 완료 후 받은 URL (예: `https://moms-shelf-worker.onrender.com`)을:
```bash
curl https://moms-shelf-worker.onrender.com/
# → {"name":"moms-shelf-worker","ok":true,"model":"claude-sonnet-4-6"}
```

⚠️ **첫 응답이 30초 이상 걸릴 수 있음** — Render free tier는 15분 무사용 시 잠들고 다음 요청에 깨어남.

---

## 3단계 · Vercel에 프론트엔드 배포

### 3-A. Vercel 가입 + Import
1. https://vercel.com/new → MomsShelf 리포 import
2. Framework: **Next.js** (자동 인식)
3. Root Directory: `.` (기본)

### 3-B. Environment Variables

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`에서 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`에서 |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local`에서 |
| `ANTHROPIC_API_KEY` | `.env.local`에서 (Next.js 라우트는 사용 안 하지만 빌드 시 참조될 수 있어 일단 등록) |
| `ALLOWED_EMAILS` | `ggominoona@gmail.com,audry1201@naver.com` |
| **`NEXT_PUBLIC_WORKER_URL`** | **`https://moms-shelf-worker.onrender.com`** ← 2단계에서 받은 URL |

### 3-C. Deploy
**Deploy** 클릭 → 1~2분 후 Vercel URL 받음 (예: `https://moms-shelf.vercel.app`).

---

## 4단계 · 도메인 보안 마무리

### 4-A. Render의 ALLOWED_ORIGINS을 Vercel 도메인으로 한정
Render 대시보드 → moms-shelf-worker → Environment:
- `ALLOWED_ORIGINS` 값을 `https://moms-shelf.vercel.app,http://localhost:3000`으로 수정
- 저장 → 자동 재배포

### 4-B. Supabase Auth URLs
**Authentication → URL Configuration**:
- **Site URL**: `https://moms-shelf.vercel.app`
- **Redirect URLs**: 
  - `https://moms-shelf.vercel.app/**`
  - `http://localhost:3000/**`

### 4-C. Kakao Developers Redirect URI
**그대로 유지** — Supabase의 `https://rggvgebrctgkzonpqqza.supabase.co/auth/v1/callback` 외 추가 불필요.

---

## 5단계 · 최종 검증

1. `https://moms-shelf.vercel.app` 접속 → 책 3권 보임
2. 휴대폰에서 같은 URL → 카카오 로그인 → 책 추가
3. 새 책 생성 → 진행 바 끝까지 → 성공
   - **첫 생성은 워커가 잠들어있어 30초 지연 가능** — 그 후 정상 속도

---

## 비용

| 항목 | 무료 한도 | 운영비 |
|---|---|---|
| Vercel Hobby | 100GB bandwidth | $0 |
| Render Free | 750h/월, cold start | $0 |
| Supabase Free | 500MB DB, 1GB Storage | $0 |
| Anthropic | 사용한 만큼 | 책 1권 약 $0.05~0.10 |

---

## 트러블슈팅

### Render 워커 호출 시 CORS 에러
→ Render 환경변수 `ALLOWED_ORIGINS`에 Vercel 도메인이 정확히 있는지 확인 (https 포함, 끝에 슬래시 X)

### 워커 첫 응답이 매우 느림
→ Cold start 정상. 어머니께 "조금 천천히 만들어드릴게요" 식으로 안내. 또는 Render `Background Worker` 무료 한도 안에서 keep-alive 스크립트 운영 가능 (별도 셋업).

### 401 Unauthorized
→ 클라이언트가 Supabase access_token을 보내는지 브라우저 devtools Network 탭에서 Authorization 헤더 확인.

### 워커 로그 보기
Render 대시보드 → moms-shelf-worker → Logs

### 워커 재배포
GitHub에 push만 하면 자동 재배포. 수동: 대시보드 → Manual Deploy → Deploy latest commit.

---

## 운영 팁

- **책 잘못 생성됨**: Supabase Studio → books에서 row 삭제 + Storage에서 파일 삭제
- **사용자 추가**: 
  - Vercel `ALLOWED_EMAILS` 환경변수 갱신 + Redeploy
  - **Render `ALLOWED_EMAILS`도 똑같이** 갱신 (자동 재배포됨)
- **워커 Sleep 깨우기 (선택)**: cron 서비스(cron-job.org 등)로 `https://.../health`를 10분마다 핑

---

## (참고) 사용하지 않는 Supabase Edge Function

`supabase/functions/generate/` 디렉토리는 이전 시도의 잔재로 남아있습니다. 사용하지 않으니 신경 안 써도 됩니다. 삭제하려면:
```bash
supabase functions delete generate
rm -rf supabase/functions/generate
```
