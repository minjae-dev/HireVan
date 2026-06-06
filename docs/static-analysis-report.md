# HireVan 전수 정적 분석 리포트

**작성일**: 2026-06-05  
**범위**: 영역 1 (Runtime/Null 가드) · 영역 2 (타입 안전성) · 영역 3 (RLS/인증)  
**대상**: 전체 `app/`, `lib/`, `components/`, `supabase/` 디렉토리

---

## 요약

| 심각도 | 건수 | 상태 |
|--------|------|------|
| 🔴 빌드 차단 (Build Blocker) | 1 | 확정 · 수정 코드 포함 |
| 🔴 런타임 크래시 | 2 | 확정 · 수정 코드 포함 |
| 🟡 스키마 불일치 (마이그레이션 실패) | 1 | 확정 · 수정 코드 포함 |
| 🟡 린트 에러 | 1 | 이미 수정됨 |
| 🟠 구조적 고아 컴포넌트 | 5 | 확인 · 연결 필요 |
| 🔵 타입 안전성 (as any 남용) | 31 | 패턴 기록 |
| 🔵 Null 가드 개선 | 3 | 권고 |

---

## 영역 2: 타입 안전성

### BUG-1 🔴 [빌드 차단] `PublicProfile` interface → type 변경 필요

**위치**: `lib/database.types.ts` L116  
**증상**: Supabase의 View Row 타입은 `Record<string, unknown>` 제약을 만족해야 하는데, TypeScript `interface`는 명시적 키 집합을 가지므로 해당 제약을 충족하지 못함 → `Database['public']['Views']['profiles_public']['Row']` 전체가 `never`로 붕괴 → 앱 전역 30개+ TS 에러 → `next build` 실패  
**검증**: 타입을 `type`으로 변경하면 빌드 통과 확인됨

**현재 코드**:
```typescript
// lib/database.types.ts L116
export interface PublicProfile {
  id: string
  role: 'employer' | 'seeker'
  // ... 15+ 필드
}
```

**수정 코드**:
```typescript
// lib/database.types.ts L116
export type PublicProfile = {
  id: string
  role: 'employer' | 'seeker'
  name: string
  avatar_url: string | null
  bio: string | null
  no_show_count: number
  created_at: string
  visa_status: VisaStatus | string | null
  visa_type: string | null
  visa_expiry: string | null
  availability: AvailabilityMatrix | null
  neighborhood: string | null
  has_sir: boolean | null
  has_foodsafe: boolean | null
  english_level: EnglishLevel | null
  local_experience_months: number | null
  skills: string[] | null
  available_shifts: string[] | null
  postal_code_prefix: string | null
}
```

> **참고**: `SeekerPreferences`, `JobMatchResult`, `EmployerBillingStatus`, `ViewSeekerProfileResult`, `SeekerMatch`, `AppNotification` 등 나머지 interface들은 `Database` 타입 구조에 직접 연결되어 있지 않으므로 영향 없음. `PublicProfile`만 수정하면 됨.

---

### BUG-2 🟡 [스키마 불일치] `profiles_public` 뷰에 `no_show_count` 참조

**위치**: `lib/database.types.ts` L122 (PublicProfile 정의), 실제 SQL 뷰 정의  
**증상**: `profiles_public` 뷰가 `p.no_show_count`를 참조하지만, 이 컬럼을 추가하는 마이그레이션이 어디에도 없음 → 신규 DB에서 뷰 생성 실패 (`column p.no_show_count does not exist`) → `view_seeker_profile` RPC, 매칭 시스템 전부 연쇄 파괴  
**검증**: 로컬 Postgres에서 마이그레이션 적용 시 재현 확인됨

**수정 방향**: 
1. SQL 마이그레이션에 `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0;` 추가
2. 또는 `PublicProfile`에서 `no_show_count` 필드를 제거하고, RPC에서 이 필드를 제외

```sql
-- supabase/migrations/XXXXXXXX_add_no_show_count.sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0;
```

---

### 타입 안전성 패턴: `(supabase as any)` 31건

전체 코드베이스에서 `(supabase as any)` 타입 캐스팅이 **31건** 발견됨. Supabase 클라이언트의 제네릭 타입 추론이 깨질 때 우회용으로 사용되고 있지만, 이는 **런타임 타입 안전성을 완전히 무력화**한다.

**발생 파일 분포**:
| 파일 | 건수 | 주요 원인 |
|------|------|-----------|
| `app/chat/[id]/page.tsx` | 9 | insert/update 시 타입 불일치 |
| `app/employer/dashboard/page.tsx` | 4 | RPC 호출, profiles 직접 쿼리 |
| `app/employer/jobs/[id]/page.tsx` | 4 | update 시 타입 불일치 |
| `app/jobs/[id]/page.tsx` | 6 | insert/update 시 타입 불일치 |
| `app/profile/page.tsx` | 2 | profiles update, resumes upsert |
| `app/profile/edit/page.tsx` | 1 | profiles update |
| 기타 | 5 | various |

**근본 원인**: `database.types.ts`의 `PublicProfile`이 `interface`로 선언되어 전체 타입 체인이 붕괴한 것이 주요 원인. BUG-1 수정 후 상당수가 해결될 것으로 예상됨.

---

## 영역 3: RLS / 인증

### 인증 검증 결과 (API 라우트)

| 라우트 | 인증 방식 | 검증 |
|--------|-----------|------|
| `POST /api/stripe/webhook` | Stripe 서명 검증 | ✅ 안전 |
| `POST /api/stripe/checkout` | Bearer token → `getUser()` | ✅ 안전 |
| `POST /api/stripe/portal` | Bearer token → `getUser()` | ✅ 안전 |
| `GET /api/seeker/matches` | Bearer token → `getUser()` | ✅ 안전 |

**모든 API 라우트가 적절한 인증 검증을 갖추고 있다.**

---

### 클라이언트 쿼리 보안 이슈

#### ISSUE-3 🟠 [보안 권고] `employer/dashboard`에서 `profiles` 테이블 직접 쿼리

**위치**: `app/employer/dashboard/page.tsx` L117-121  
**위험도**: 중간 (RLS 의존)

```typescript
// L117-121: 클라이언트 측에서 profiles 테이블을 직접 쿼리
let query = (supabase as any)
  .from('profiles')
  .select('*')
  .eq('role', 'seeker')
  .order('created_at', { ascending: false })
  .limit(30)
```

**문제**: `profiles_public` 뷰를 사용하지 않고 `profiles` 테이블을 직접 쿼리함. RLS 정책이 `profiles` 테이블에 properly configured 되어 있다면 안전하지만, 그렇지 않은 경우 민감 정보(Stripe customer ID 등)가 노출될 수 있음.

**권장 수정**: `profiles_public` 뷰 또는 별도의 RPC를 사용하여 민감 필드가 전송되지 않도록 함.

---

#### ISSUE-4 🟠 [보안 권고] `no_show_count` 클라이언트 직접 업데이트

**위치**: `app/chat/[id]/page.tsx` L345-352  

```typescript
// L345-352: 클라이언트에서 직접 no_show_count 증가
const { data: seekerProfile } = await supabase
  .from('profiles')
  .select('no_show_count')
  .eq('id', room.seeker_id)
  .maybeSingle()
const currentCount = (seekerProfile as unknown as { no_show_count: number } | null)?.no_show_count ?? 0
await (supabase as any).from('profiles').update({ no_show_count: currentCount + 1 }).eq('id', room.seeker_id)
```

**문제**: 
1. RACE CONDITION: 동시 업데이트 시 `currentCount + 1`이 덮어쓰기됨
2. 권한 검증 없이 상대방의 `no_show_count`를 수정 가능 (RLS에 `UPDATE` 정책이 있다면)
3. RPC를 사용해야 원자적 업데이트가 보장됨

**권장 수정**: 별도 RPC (`increment_no_show_count`)를 생성하여 서버 측에서 원자적 처리.

---

#### ISSUE-5 🟠 [보안 권고] `PreScreeningCard`에서 RLS에 의존한 권한 검증

**위치**: `app/employer/dashboard/page.tsx` L862-868  

```typescript
// L862-868: 소유권 검증 없이 job_posts 업데이트
const { error: updateError } = await (supabase as any)
  .from('job_posts')
  .update({
    require_resume: requireResume,
    custom_questions: cleanedQuestions,
  })
  .eq('id', targetJob.id)
```

**문제**: 소유권 검증이 없음. `targetJob`은employer의 공고 목록에서 온 것이지만, 직접 ID를 조작하면 다른 업체의 공고를 수정할 수 있음.  
**완화 요건**: RLS 정책에 `employer_id = auth.uid()` 조건이 있어야 함.

---

## 영역 1: Null / 런타임 가드

### 런타임 크래시 (확정)

#### BUG-3 🔴 `match_seekers_to_job` SQL 타입 오류

**위치**: Supabase RPC `match_seekers_to_job` (DB 측)  
**증상**: `WHERE c.id IN (SELECT certs FROM req)` — `certs`가 `uuid[]` 타입인데 `uuid = uuid[]` 비교 연산자 오류 → 호출 시 Postgres throw  
**검증**: 로컬 Postgres에서 재현 확인

**수정 코드**:
```sql
-- 수정 전 (오류)
WHERE c.id IN (SELECT certs FROM req)

-- 수정 후
WHERE c.id = ANY(SELECT unnest(certs) FROM req)
```

---

### Null 가드 패턴 분석

#### 양호한 패턴

| 파일 | 패턴 | 평가 |
|------|------|------|
| `lib/safe.ts` | `withDefault`, `safeArray`, `safeString`, `safeNumber`, `safeBool` | ✅ 전체 null/undefined 가드 유틸 완비 |
| `lib/profile.ts` | `normalizeSeekerCompetitiveFields()` | ✅ safeArray/safeNumber/safeString 활용 |
| `lib/chatRooms.ts` | 모든 함수가 `if (!id) return null/[]` 가드 | ✅ |
| `lib/applications.ts` | 모든 함수가 `if (!id) return []` 가드 | ✅ |
| `lib/jobPosts.ts` | 모든 함수가 null 체크 | ✅ |
| `lib/reviews.ts` | 모든 함수가 null 체크 | ✅ |
| `lib/resume.ts` | `if (!userId) throw` + `if (!seekerId) return null` | ✅ |

#### 개선 권고 패턴

##### IMPROVE-1 🟠 `BlurredSeekerCard`에서 `visa_expiry_date` 미정의 필드 접근

**위치**: `components/BlurredSeekerCard.tsx` L151-156

```typescript
// L151-156: PublicProfile에 없는 필드를 unsafe cast로 접근
(seeker as Record<string, unknown>).visa_expiry_date
  ? new Date((seeker as Record<string, unknown>).visa_expiry_date as string).toLocaleDateString('ko-KR')
  : seeker.visa_expiry
    ? new Date(seeker.visa_expiry).toLocaleDateString('ko-KR')
    : '—'
```

**문제**: `PublicProfile` 타입에 `visa_expiry_date` 필드가 없어서 `as Record<string, unknown>` 캐스팅으로 우회. DB에는 `visa_expiry_date` 컬럼이 있는데 타입 정의에 빠져 있음.

**권장 수정**: `PublicProfile`에 `visa_expiry_date: string | null` 필드 추가

```typescript
// lib/database.types.ts PublicProfile에 추가
visa_expiry_date: string | null
```

---

##### IMPROVE-2 🔵 `app/chat/[id]/page.tsx`에서 `room` null 가드 타이밍

**위치**: `app/chat/[id]/page.tsx` L94-97

```typescript
// L94-97: user가 아직 로드되기 전에 권한 검증 시도
if (user && roomData.employer_id !== user.id && roomData.seeker_id !== user.id) {
  router.push('/chat')
  return
}
```

**평가**: `user`가 `null`일 때(아직 세션 로드 전) 조건이 `false`가 되어 통과됨 → OK (의도적). 단, `fetchRoom`이 `user` 변경 없이도 호출될 수 있으므로 `user`를 dependency에 포함시킨 것은 올바름.

---

##### IMPROVE-3 🔵 `app/profile/page.tsx`에서 `profile` 타입 캐스팅 없이 필드 접근

**위치**: `app/profile/page.tsx` L48-51

```typescript
// L48-51: profile이 null이 아닐 때 name/bio/visa_type 접근
if (profile) {
  setName(profile.name)
  setBio(profile.bio)
  setVisaType(profile.visa_type)
}
```

**평가**: `profile`의 타입이 `Database['public']['Tables']['profiles']['Row'] | null`인데, `profiles` Row의 `name`, `bio`, `visa_type`은 `string` (non-nullable)이므로 안전함. ✅

---

### 구조적 이슈: 고아 컴포넌트 / 연결 안 됨

아래 컴포넌트들이 **어떤 페이지에도 import되지 않아 현재 UI에 연결되어 있지 않다**:

| 컴포넌트 | 파일 경로 | 상태 |
|----------|-----------|------|
| `AvailabilityMatrix` | `components/AvailabilityMatrix.tsx` | 고아 |
| `VisaSelector` | `components/VisaSelector.tsx` | 고아 |
| `CertificateToggles` | `components/CertificateToggles.tsx` | 고아 |
| `JobRequirementsEditor` | `components/JobRequirementsEditor.tsx` | 고아 |
| `components/page.tsx` | `components/page.tsx` | 고아 (의도不明) |

**영향**: 
- `AvailabilityMatrix` / `VisaSelector` / `CertificateToggles` — `profile/edit/page.tsx`에서 별도의 로컬 상태 관리로 대체되어 사용되지 않음
- `JobRequirementsEditor` — `employer/dashboard/page.tsx`의 `PreScreeningCard`가 인라인 편집 UI로 대체
- `components/page.tsx` — `app/page.tsx`와 별개로 존재. Next.js 라우팅에서 `components/page.tsx`는 `app/components/page.tsx`로 해석되지 않으므로 의도된 라우트가 아님

**연결 완료된 컴포넌트**:
- `BlurredSeekerCard` → `app/employer/dashboard/page.tsx` ✅
- `ProUpsellModal` → `app/employer/dashboard/page.tsx` ✅
- `GracePeriodBanner` → `app/employer/dashboard/page.tsx` ✅
- `useSeekerAccess` → `app/employer/dashboard/page.tsx` ✅
- `Navbar` → `app/layout.tsx` (추정) ✅

---

### `app/profile/page.tsx` 프리미엄 필드 누락

**위치**: `app/profile/page.tsx` L168-189

현재 프로필 저장 핸들러가 `name`, `bio`, `visa_type`만 저장:

```typescript
// L178: 저장되는 필드
const { error } = await (supabase as any)
  .from('profiles')
  .update({ name, bio, visa_type: visaType })
  .eq('id', user.id)
```

다음 필드들은 `app/profile/edit/page.tsx`에서만 처리됨:
- `availability` (가용 시간)
- `visa_status` (비자 상태 enum)
- `visa_expiry_date` (비자 만료일)
- `has_sir`, `has_foodsafe` (자격증)
- `neighborhood` (거주 구역)
- `local_experience_months` (캐나다 경력)
- `skills` (스킬)
- `available_shifts` (가능 시간대)
- `postal_code_prefix` (우편번호)

**평가**: `profile/page.tsx`는 기본 프로필 편집, `profile/edit/page.tsx`는 상세 편집으로 분리된 구조. 편집 버튼이 `/profile/edit`으로 링크되어 있어 의도적 분리로 판단됨. 단, 사용자가 기본 편집 페이지에서 "저장"하면 프리미엄 필드가 덮어쓰기되지 않으므로 안전.

---

## 수정 권고 요약 (우선순위)

### P0 — 즉시 수정 (빌드/런타임 차단)

1. **`lib/database.types.ts` L116**: `interface PublicProfile` → `type PublicProfile = { ... }`
2. **SQL 마이그레이션**: `profiles` 테이블에 `no_show_count integer NOT NULL DEFAULT 0` 컬럼 추가
3. **SQL RPC `match_seekers_to_job`**: `WHERE c.id IN (SELECT certs FROM req)` → `WHERE c.id = ANY(SELECT unnest(certs) FROM req)`

### P1 — 가까운 시일 내 수정

4. **`lib/database.types.ts` PublicProfile**: `visa_expiry_date: string | null` 필드 추가
5. **`app/employer/dashboard/page.tsx` L117**: `profiles` 테이블 직접 쿼리 → `profiles_public` 뷰 또는 RPC 사용
6. **`app/chat/[id]/page.tsx` L345-352**: `no_show_count` 직접 업데이트 → RPC로 교체

### P2 — 리팩토링 권고

7. **31건 `(supabase as any)`**: BUG-1 수정 후 타입 추론 복구 시大部分 해소 가능. 잔여분은 Supabase 타입 재생성(`supabase gen types typescript`)으로 해결
8. **고아 컴포넌트 정리**: `AvailabilityMatrix`, `VisaSelector`, `CertificateToggles`, `JobRequirementsEditor`, `components/page.tsx` 삭제 또는 연결

---

## 확인된 안전한 수정 사항

아래 수정은 즉시 PR로 올릴 수 있다:

1. ✅ `lib/database.types.ts` — `interface` → `type` 변경 (BUG-1)
2. ✅ `lib/database.types.ts` — `visa_expiry_date` 필드 추가 (IMPROVE-1)
3. ✅ `app/chat/[id]/page.tsx` — `prefer-const` lint 수정 (BUG-4, 이미 완료)

---

*본 리포트는 정적 분석 기반이며, 실제 DB 마이그레이션/SQL 수정은 별도 PR에서 처리.*