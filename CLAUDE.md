# FUNDIT — Claude 에이전트 가이드

## 1. 프로젝트 개요

- **서비스명**: FUNDIT
- **슬로건**: 정책자금 수주, FUNDIT으로 끝내세요
- **목적**: 정책자금 컨설팅 전문 SaaS CRM — 중소기업의 보조금·융자·보증 신청을 지원하는 컨설팅 팀이 고객사 관리, 신청건 추적, 일정 및 팀 성과를 통합 관리하는 도구
- **멀티테넌트 구조**: workspace 단위로 완전 격리 (Supabase RLS). 가입 시 workspace가 생성되고, 이후 팀원은 초대를 통해 동일 workspace에 합류
- **현재 개발 단계**: 인증 플로우 완성, UI 레이아웃·컴포넌트 완성, 모든 페이지 샘플 데이터로 구현 완료. Supabase 실데이터 연동은 미완성.

---

## 2. 기술 스택

- **Frontend**: React 19.2.4, Vite 8.0.1
- **Backend**: Supabase (Auth, PostgreSQL, RLS)
- **라우팅**: react-router-dom 7.13.2 (현재 미사용, SPA 상태 기계 방식으로 구현됨)
- **주요 패키지** (package.json 기준):
  - `@supabase/supabase-js` ^2.101.1
  - `react` ^19.2.4
  - `react-dom` ^19.2.4
  - `react-router-dom` ^7.13.2
- **개발 도구**: ESLint 9, @vitejs/plugin-react 6
- **배포 환경**: Vercel (예정)
- **스타일**: 인라인 스타일 전용 (CSS-in-JS 라이브러리 없음)

---

## 3. 파일 구조

```
fundit2/
├── src/
│   ├── App.jsx              — 진입점, 인증 상태기계(loading/landing/login/app), 사이드바, 레이아웃
│   ├── supabase.js          — Supabase 클라이언트, signUp/signIn/signOut/getProfile, translateError
│   ├── theme.jsx            — 테마 토큰(dark/light), ThemeProvider, useT/useTheme hook
│   ├── index.css            — 전역 CSS 리셋, 폰트 임포트, 스크롤바 스타일
│   └── components/
│       ├── Common.jsx       — StatusBadge, Card, Button 공통 컴포넌트
│       ├── Landing.jsx      — 랜딩 페이지 (로고, 슬로건, CTA)
│       ├── Login.jsx        — 로그인/회원가입 스플릿 레이아웃
│       ├── Dashboard.jsx    — KPI 카드, 최근 고객사, 마감 임박, 신청 현황 요약
│       ├── Customers.jsx    — 고객사 목록 테이블 + 슬라이드 상세 패널
│       ├── Applications.jsx — 신청건 목록 테이블 + 슬라이드 상세 패널 + 진행단계 시각화
│       ├── Funds.jsx        — 정책자금 목록 테이블 (R&D/융자/보조/바우처)
│       ├── Calendar.jsx     — 일정 목록 (예정/지난 일정, 유형별 필터)
│       ├── Team.jsx         — 팀 멤버 카드 + 멤버 초대 폼
│       ├── Stats.jsx        — KPI 요약, 월별 막대 차트, 담당자별 성과 테이블, 신청건 상태 분포
│       └── Settings.jsx     — 프로필/워크스페이스/테마/알림 설정 (4개 섹션)
├── supabase/
│   ├── migrations/
│   │   └── 0001_setup.sql         — 초기 스키마 (테이블 + GRANT + RLS 정책)
│   ├── fix_rls_policies.sql       — RLS 정책 재작성본 (subquery 패턴으로 교체)
│   ├── fix_rls_recursion.sql      — profiles 재귀 문제 수정 (get_my_workspace_id 함수)
│   └── fix_signup_function.sql    — create_workspace_and_profile RPC 함수 정의
├── .env                           — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── package.json
└── CLAUDE.md
```

---

## 4. 디자인 시스템

### 컬러 토큰

| 토큰 | 다크 모드 | 라이트 모드 | 용도 |
|------|-----------|-------------|------|
| `base` | `#03060d` | `#ffffff` | 최하단 배경 |
| `s1` | `#070d1a` | `#f8f9fa` | 표면 1단계 |
| `s2` | `#0b1224` | `#ffffff` | 표면 2단계 (카드, 사이드바) |
| `s3` | `#101a30` | `#e9ecef` | 표면 3단계 (호버, 입력 배경) |
| `line` | `#1c2b44` | `#ced4da` | 테두리, 구분선 |
| `gold` | `#f0b840` | `#f0b840` | 포인트 컬러 (버튼, 활성 탭) |
| `blue` | `#1d6fe8` | `#1d6fe8` | 정보성 강조 |
| `green` | `#0ea571` | `#0ea571` | 성공, 승인 |
| `text` | `#eaf0ff` | `#212529` | 기본 텍스트 |
| `sub` | `#6b84a8` | `#6c757d` | 보조 텍스트, 레이블 |
| `error` | `#dc3545` | `#dc3545` | 에러 메시지 |
| `success` | `#28a745` | `#28a745` | 성공 메시지 |

골드 그라디언트: `linear-gradient(135deg, #f0b840, #d4952a)`

### 폰트

- **Bebas Neue**: 로고(FUNDIT), 사이드바 브랜드, 상단 헤더 페이지명
- **Noto Sans KR**: 본문 전체 (weight: 300, 400, 500, 600, 700)
- 기본 font-size: 14px, line-height: 1.6

### 사용 패턴

```jsx
// 테마 색상만 필요할 때
const C = useT()
// style={{ background: C.s2, border: `1px solid ${C.line}` }}

// 테마 전환 기능도 필요할 때
const { isDark, toggleTheme } = useTheme()
```

- 인라인 스타일만 사용 (CSS 클래스 추가 금지, 외부 UI 라이브러리 설치 금지)
- `Login.jsx`에만 `<style>` 태그 1개 예외 존재 (모바일 브랜드 패널 hide)

---

## 5. Supabase DB 구조

### 테이블

#### `workspaces`
```
id          uuid PK default gen_random_uuid()
name        text NOT NULL
plan        text default 'free'
created_at  timestamptz default now()
```

#### `profiles`
```
id           uuid PK references auth.users(id) ON DELETE CASCADE
workspace_id uuid NOT NULL references workspaces(id) ON DELETE CASCADE
name         text NOT NULL
email        text UNIQUE NOT NULL
role         text NOT NULL CHECK (role IN ('admin','staff'))
status       text NOT NULL default 'active'
created_at   timestamptz default now()
```

#### `customers`
```
id           uuid PK
workspace_id uuid NOT NULL references workspaces(id) ON DELETE CASCADE
company      text NOT NULL
ceo          text
industry     text
employees    int
revenue      numeric
consultant   uuid references profiles(id)
pool         boolean default false
tags         text[]
score        int default 0
created_at   timestamptz default now()
```

#### `funds`
```
id          uuid PK
name        text NOT NULL
org         text
type        text
max_amount  numeric
rate        numeric
deadline    date
tags        text[]
```

#### `applications`
```
id           uuid PK
workspace_id uuid NOT NULL references workspaces(id) ON DELETE CASCADE
customer_id  uuid NOT NULL references customers(id) ON DELETE CASCADE
fund_id      uuid NOT NULL references funds(id) ON DELETE RESTRICT
status       text NOT NULL default '신청중'
consultant   uuid references profiles(id)
amount       numeric
deadline     date
priority     text default '중'
memo         text
created_at   timestamptz default now()
```

#### `notices`
```
id       uuid PK
title    text NOT NULL
org      text
deadline date
tags     text[]
```

### RLS 정책 요약 (현재 적용 기준: fix_rls_recursion.sql까지 실행 완료 가정)

| 테이블 | 정책 | 조건 |
|--------|------|------|
| `workspaces` | SELECT/INSERT/UPDATE | `true` (전체 허용) |
| `profiles` | SELECT | `id = auth.uid()` OR `workspace_id = get_my_workspace_id()` |
| `profiles` | INSERT | `id = auth.uid()` |
| `profiles` | UPDATE | `workspace_id = get_my_workspace_id()` |
| `customers` | ALL | `workspace_id = get_my_workspace_id()` |
| `applications` | ALL | `workspace_id = get_my_workspace_id()` |
| `funds` | SELECT | `true`, INSERT `auth.role() = 'service_role'` |
| `notices` | SELECT | `true`, INSERT `auth.role() = 'service_role'` |

### 주요 DB 함수

#### `get_my_workspace_id()`
```sql
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
-- profiles 테이블에서 auth.uid() 기준 workspace_id 반환
-- SECURITY DEFINER: RLS를 거치지 않아 재귀 방지
-- GRANT: authenticated
```

#### `create_workspace_and_profile(p_workspace_name, p_user_id, p_name, p_email)`
```sql
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
-- workspaces INSERT → profiles INSERT 원자적 실행
-- anon + authenticated 모두 실행 가능
-- ON CONFLICT (id) DO NOTHING: 중복 가입 안전 처리
-- RETURNS uuid (workspace_id)
```

### Supabase Auth 플로우

```
앱 로드
  └─ getSession() 즉시 호출 + 3초 타임아웃 안전망
       ├─ 세션 없음 → mode='landing'
       ├─ 세션 있음 → getProfile(userId)
       │     ├─ 성공 → mode='app'
       │     └─ 실패 → mode='login' + 에러 메시지
       └─ 타임아웃 → mode='landing'

onAuthStateChange (외부 변화만 처리)
  ├─ SIGNED_OUT → session/profile 초기화, mode='landing'
  ├─ TOKEN_REFRESHED → session 갱신
  └─ SIGNED_IN / INITIAL_SESSION → 무시 (onLogin/onSignup이 직접 처리)

onLogin()
  └─ signInWithPassword → getProfile → mode='app'

onSignup()
  └─ auth.signUp → create_workspace_and_profile RPC → getSession → getProfile → mode='app'
     └─ 이메일 확인 활성화 시 → mode='login' + 안내 메시지
```

---

## 6. 권한 구조 (RBAC)

### admin
- 모든 페이지 접근 가능 (팀 관리, 통계 포함)
- 워크스페이스 설정 변경
- 팀원 초대

### staff
- 대시보드, 고객사, 신청건, 정책자금, 일정, 설정 접근
- 팀 관리, 통계 접근 불가 (현재 프론트엔드 구분만 구현됨 — NAV_TABS에서 분기 없음, 모든 탭 표시 중)

### 현재 구현 수준
- DB 레벨: workspace 기준 격리 완성 (RLS)
- 프론트엔드: role 구분 UI 미구현 (사이드바에서 role에 따른 탭 숨김 처리 미적용)
- `profile.role` 값은 앱 전체에 전달되나 실제 분기 로직 없음

---

## 7. 완성된 기능 목록

### 인증
- 이메일/비밀번호 로그인 (Supabase Auth 연동 완성)
- 회원가입 (workspace + profile 원자적 생성, `create_workspace_and_profile` RPC)
- 로그아웃 (`supabase.auth.signOut`)
- 세션 복원 (`getSession` + 3초 타임아웃)
- 에러 한글화 (`translateError`)

### 랜딩 페이지
- 브랜드 로고, 슬로건, 기능 배지, CTA 버튼
- 골드 glow 배경 효과

### 로그인/회원가입 페이지
- 스플릿 레이아웃 (왼쪽 브랜딩, 오른쪽 폼)
- 로그인/회원가입 탭 전환
- 포커스 시 골드 테두리 강조
- 상태 메시지 (에러 빨강, 진행중 골드)
- 모바일 768px 이하 브랜딩 패널 숨김

### 앱 레이아웃 (App.jsx > MainApp)
- 240px 고정 사이드바 (sticky, 100vh)
- 골드 그라디언트 활성 탭 표시
- 사이드바 하단 프로필 (이니셜 아바타, 이름, 회사명, 역할, 로그아웃 버튼)
- 상단 헤더바 (페이지명, 오늘 날짜)
- 다크/라이트 테마 (기본 다크)

### 대시보드 (Dashboard.jsx)
- KPI 카드 3개: 고객사 수, 신청건 수, 진행중 건수
- 최근 고객사 테이블 (상태 배지, D-day 색상 분기)
- 이번달 마감 임박 위젯 (D-day 가까운 순 상위 3건)
- 신청 현황 요약 위젯 (상태별 카운트)

### 고객사 관리 (Customers.jsx)
- 상태 필터 (전체/신청예정/서류준비/검토중/보완요청/승인완료/반려)
- 회사명·대표·업종 텍스트 검색
- 9컬럼 테이블 (회사명, 대표, 업종, 직원수, 매출, 담당자, 태그, 점수, 상태)
- 풀 고객사 표시 (파란 뱃지)
- 점수 색상 분기 (80+ 초록, 60+ 골드, 미만 빨강)
- 행 클릭 → 오른쪽 슬라이드 상세 패널 (기본정보, 태그, 신용점수 바, 관련 신청건)

### 신청건 관리 (Applications.jsx)
- 상태 필터 + 텍스트 검색
- 상단 요약 카드 (전체/진행중/승인완료/이번달 마감 건수, 합계 금액)
- 8컬럼 테이블 (고객사, 사업명, 상태, 담당자, 금액, 마감일+D-day, 우선순위, 메모)
- 행 클릭 → 슬라이드 상세 패널 (사업정보, 메모, 진행단계 스텝퍼 시각화)
- 반려 상태 별도 표시

### 정책자금 (Funds.jsx)
- 유형 필터 (전체/R&D/융자/보조/바우처)
- 사업명·기관·태그 검색
- 7컬럼 테이블 (사업명+설명, 기관, 유형, 최대금액, 금리, 마감일+D-day, 태그)
- 무이자 녹색 표시, 마감 임박 빨강/주황 표시

### 일정 관리 (Calendar.jsx)
- 유형 필터 (마감/실사/협약/심사/제출/미팅/내부)
- 예정/지난 일정 섹션 분리
- 지난 일정 opacity 0.55 처리
- 오늘 날짜 골드 표시

### 팀 관리 (Team.jsx)
- 멤버 카드 (이니셜 아바타, 역할 배지, 담당 고객사/신청건/승인 통계)
- 활성/비활성 멤버 구분
- 멤버 초대 폼 (이메일 유효성 검사, 역할 선택) — 현재 시뮬레이션만

### 통계 (Stats.jsx)
- KPI 카드 5개 (총 신청건, 승인 완료, 승인율, 총 지원금액, 관리 고객사)
- 월별 신청/승인 막대 차트 (CSS 직접 구현, 외부 차트 라이브러리 없음)
- 담당자별 성과 테이블
- 신청건 상태 분포 프로그레스 바

### 설정 (Settings.jsx)
- 프로필 설정 섹션 (이름 수정, 이메일 표시, 비밀번호 변경 폼)
- 워크스페이스 설정 섹션 (회사명, 플랜 표시)
- 테마 설정 섹션 (다크/라이트 토글 — `useTheme().toggleTheme()` 연동)
- 알림 설정 섹션 (마감 임박/보완요청/승인 결과/이메일 토글)

### 공통 컴포넌트 (Common.jsx)
- `StatusBadge`: 6개 상태 색상 매핑 (신청예정/서류준비/검토중/보완요청/승인완료/반려)
- `Card`: 통계 카드 모드 + 일반 카드 모드
- `Button`: primary(골드)/secondary(투명)/danger(빨강) 3종

---

## 8. 미완성·예정 기능

### Supabase 실데이터 연동 (전체 페이지)
모든 페이지의 데이터는 컴포넌트 상단 `SAMPLE_*` 상수로 하드코딩됨.
실제 Supabase 쿼리 연동이 필요한 컴포넌트:
- `Dashboard.jsx` — stats, recentCustomers (현재 App.jsx에서 하드코딩 props 전달)
- `Customers.jsx` — SAMPLE_CUSTOMERS, RELATED_APPS
- `Applications.jsx` — SAMPLE_APPS
- `Funds.jsx` — SAMPLE_FUNDS
- `Calendar.jsx` — SAMPLE_SCHEDULES
- `Team.jsx` — SAMPLE_TEAM
- `Stats.jsx` — MONTHLY_DATA, CONSULTANT_STATS, FUND_TYPE_STATS, STATUS_STATS

### 고객사·신청건 등록 폼
- `+ 고객사 등록`, `+ 신청건 등록` 버튼 존재하나 onClick 핸들러 없음

### 정책자금 등록/스크래핑
- `공고 스크래핑`, `+ 직접 등록` 버튼 존재하나 미구현

### Settings API 연동
- 이름 저장, 비밀번호 변경, 워크스페이스 이름 저장 모두 "저장되었습니다." 메시지만 표시 (실제 DB 업데이트 없음)
- 이메일 필드는 `sujin.lee@fundit.kr`로 하드코딩

### 팀 초대 실제 발송
- 이메일 유효성 검사 후 "발송했습니다" 메시지 시뮬레이션만 있음

### RBAC 프론트엔드 적용
- staff는 팀 관리, 통계 탭 숨김 처리 미적용

### 일정 CRUD
- 일정 추가/수정/삭제 버튼 없음, `기준일: 2026-04-02` 하드코딩

### 대시보드 "전체 보기" 버튼
- 고객사 테이블의 "전체 보기" 버튼에 onClick 핸들러 없음

### 반응형 모바일 대응
- Login.jsx에만 768px 미디어쿼리 적용. 나머지 페이지 미지원.

### 이메일 확인 플로우
- 이메일 확인 비활성화 가정으로 개발됨. 활성화 시 onSignup 플로우 재검토 필요.

### 구독/플랜 관리
- `workspaces.plan = 'free'` 구조만 있고, 실제 플랜 관리 UI 없음

---

## 9. 코딩 규칙

### 필수 패턴
```jsx
// 테마: 항상 useT()
const C = useT()
// style={{ background: C.s2, color: C.text }}

// 에러 한글화: translateError() 사용
import { translateError } from '../supabase.js'
setStatus(translateError(error))

// 상태 분기 색상: StatusBadge 컴포넌트 사용
import { StatusBadge } from './Common.jsx'
<StatusBadge status="검토중" />
```

### 금지 사항
- CSS 파일 추가 금지 (index.css 수정만 허용)
- 외부 UI 라이브러리 설치 금지 (MUI, Ant Design, shadcn 등)
- 차트 라이브러리 설치 금지 (recharts, Chart.js 등) — CSS 막대 직접 구현
- 하드코딩 색상 금지 — C.text, C.gold 등 토큰 사용
- styled-components, CSS Modules 금지

### 파일 구조 규칙
- 컴포넌트는 `src/components/` 아래 분리된 파일
- 공통 컴포넌트는 `Common.jsx`에 추가
- 샘플 데이터는 각 컴포넌트 파일 상단 `SAMPLE_*` 상수로 정의
- 전역 상태 라이브러리 없음 — useState + props 전달

### 스타일 관례
```jsx
// 테이블 헤더/셀 스타일은 로컬 상수로 정의
const th = { textAlign: 'left', padding: '8px 12px', color: C.sub, fontSize: 12, fontWeight: 600, borderBottom: `1px solid ${C.line}` }
const td = { padding: '10px 12px', color: C.text, fontSize: 13, borderBottom: `1px solid ${C.line}` }

// 섹션 레이블 스타일
const SECTION_LABEL = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }
```

---

## 10. 에이전트 활용 지침

| 작업 유형 | 권장 에이전트 |
|-----------|--------------|
| 로그인/회원가입/인증 버그 | `multi-tenant-auth-guard` |
| DB 스키마/마이그레이션/RLS 정책 | `supabase-data-integrity` |
| 컴포넌트 리팩토링/코드 정리 | `frontend-refactor` |
| UX 개선/레이아웃/인터랙션 | `fundit-ux-optimizer` |
| 기능 평가/우선순위/SaaS 전략 | `fundit-refactor` |
| 복잡한 멀티파일 조사 | `Explore (subagent)` |

---

## 11. 브랜딩

- **서비스명**: FUNDIT
- **슬로건**: 정책자금 수주, FUNDIT으로 끝내세요
- **로고**: Bebas Neue, 골드 그라디언트 (`linear-gradient(135deg, #f0b840, #d4952a)`)
- **포인트 컬러**: `#f0b840` (골드), `#d4952a` (다크 골드)
- **무드**: 고급스럽고 모던한 다크 CRM, 네이비 계열 배경
- **배경 효과**: radial-gradient glow (골드 왼쪽, 블루 오른쪽)

---

## 12. 해결된 주요 이슈 (세션 히스토리)

1. **`불러오는 중...` 고착**
   - 원인: `onAuthStateChange`의 `INITIAL_SESSION` 이벤트만 기다리는 구조
   - 해결: `getSession()` 즉시 호출 + 3초 타임아웃 → `mode='landing'` 강제 전환

2. **`로그인 중...` 고착**
   - 원인: `SIGNED_IN` 이벤트에서 프로필 로드 시도 → 이벤트 누락/경쟁 조건
   - 해결: `onLogin`/`onSignup` 함수에서 `signInWithPassword` 직후 `getProfile` 직접 호출

3. **회원가입 race condition**
   - 원인: `auth.signUp()` 직후 `SIGNED_IN` 발화 → 프로필 없는 상태에서 `getProfile` 실패
   - 해결: `create_workspace_and_profile` RPC 호출 후 `getSession` → `getProfile` 순서 보장

4. **profiles RLS 무한 재귀**
   - 원인: profiles SELECT/UPDATE 정책에서 profiles 자신을 서브쿼리로 참조
   - 해결: `get_my_workspace_id()` SECURITY DEFINER 함수로 RLS 우회

5. **anon INSERT 403**
   - 원인: workspaces 테이블에 anon GRANT 없음 + 이메일 미확인 상태 (auth.uid()=null)
   - 해결: `create_workspace_and_profile` SECURITY DEFINER RPC로 권한 우회

6. **에러 메시지 영어 노출**
   - 해결: `translateError()` 함수 (`src/supabase.js`)로 모든 Supabase Auth 에러 한글화

---

## 13. 자주 쓰는 명령어

```bash
# 개발 서버 시작
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 결과 미리보기
npm run preview

# Supabase SQL 파일 실행 (linked 프로젝트 대상)
supabase db query --linked --file supabase/fix_rls_recursion.sql
supabase db query --linked --file supabase/fix_signup_function.sql

# ESLint 검사
npm run lint
```

---

## 14. 절대 건드리면 안 되는 것

### `src/App.jsx` 인증 플로우
`getSession` 즉시 호출 + `onAuthStateChange` 최소 처리 구조는 여러 버그를 수정하며 확립된 것입니다.
변경 시 반드시 `multi-tenant-auth-guard` 에이전트를 사용하세요.

### `get_my_workspace_id()` DB 함수
`supabase/fix_rls_recursion.sql`에 정의된 SECURITY DEFINER 함수입니다.
이 함수를 삭제하거나 SECURITY INVOKER로 변경하면 profiles 테이블 접근 전체가 무한 재귀로 중단됩니다.

### `onAuthStateChange`에서 `SIGNED_IN` 처리 금지
현재 코드에서 SIGNED_IN/INITIAL_SESSION은 의도적으로 무시합니다.
다시 추가하면 onLogin/onSignup과의 경쟁 조건이 재발합니다.

### `profiles_insert` 정책 (`id = auth.uid()`)
이 조건을 변경하면 회원가입 시 profile INSERT가 실패합니다.
(단, `create_workspace_and_profile` RPC는 SECURITY DEFINER로 RLS를 우회하므로 RPC 경로는 영향 없음)

### `.env` 파일
`VITE_SUPABASE_ANON_KEY`는 `sb_publishable_` 접두어 형식이 정상입니다 (Supabase 최신 형식).

---

## 15. 다음 우선순위 작업

코드 기반으로 파악한 미완성 항목, 비즈니스 임팩트 순:

1. **Supabase 실데이터 연동** (최우선)
   - Customers, Applications 페이지 `SAMPLE_*` → 실제 DB 쿼리
   - `supabase.from('customers').select(...)` 패턴 적용
   - Dashboard stats도 실데이터 기반으로 전환

2. **고객사·신청건 등록 폼 구현**
   - `+ 고객사 등록`, `+ 신청건 등록` 버튼 onClick 핸들러 + 모달/슬라이드 폼

3. **Settings API 연동**
   - 이름/비밀번호 변경: `supabase.auth.updateUser()` 연동
   - 워크스페이스 이름: `workspaces` UPDATE 연동
   - 이메일 필드 하드코딩 제거 → profile.email 사용

4. **RBAC 프론트엔드 적용**
   - staff는 팀 관리, 통계 탭 숨김: `NAV_TABS`에 role 조건 추가

5. **팀 초대 실제 발송**
   - Supabase `auth.admin.inviteUserByEmail()` 또는 커스텀 이메일 로직

6. **일정 CRUD 구현**
   - `schedules` 테이블 추가 + 일정 등록/수정/삭제 기능

7. **정책자금 공고 연동**
   - `funds` 테이블 실데이터 입력 또는 공공데이터 API 스크래핑

8. **반응형 모바일 대응**
   - 사이드바 햄버거 메뉴, 테이블 스크롤 처리
