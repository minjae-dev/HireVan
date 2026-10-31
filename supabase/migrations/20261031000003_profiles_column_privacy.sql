-- profiles 읽기 범위 축소 2/2 — 권한 회수.
-- 선행: 20261031000002 적용 + my_profile/search_seekers 를 쓰는 코드 배포 완료
--
-- 기존: "Anyone can view profiles" (authenticated, true) + 테이블 전체 SELECT 권한
--   → 로그인 사용자 누구나 전 회원의 phone / stripe_* / credit_count / plan / is_admin 과
--     구직자 상세(비자 만료, 가용시간, 자격증, 거주지) 를 직접 조회 가능.
--     구직자 열람 크레딧/Pro 결제(view_seeker_profile)가 무의미했음.
--
-- 변경:
--   - 타인 행에서 읽을 수 있는 컬럼을 공개 컬럼으로 제한 (공고/리뷰/채팅/지원자 embed 에서 쓰는 것만)
--   - 본인 전체 행은 my_profile 뷰로 조회
--   - 구직자 브라우징은 search_seekers RPC 가 Pro/열람이력 여부에 따라 서버에서 마스킹
--   - profiles_public 직접 조회 차단 (view_seeker_profile / search_seekers 내부에서만 사용)

-- ─────────────────────────────────────────────────────────────
-- 1) 컬럼 단위 SELECT
--    anon 도 같은 컬럼을 부여한다: 비로그인 공고 목록의 profiles(name, role) embed 가
--    권한 오류로 전체 쿼리를 실패시키지 않도록 (행은 RLS 로 여전히 0건)
-- ─────────────────────────────────────────────────────────────
revoke select on public.profiles from anon, authenticated;
grant select (id, role, name, bio, avatar_url, visa_type, no_show_count, created_at)
  on public.profiles to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2) profiles_public 은 view_seeker_profile / search_seekers(SECURITY DEFINER) 내부에서만 사용
-- ─────────────────────────────────────────────────────────────
revoke all on public.profiles_public from anon, authenticated;
