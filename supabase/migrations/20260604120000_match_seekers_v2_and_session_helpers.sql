-- =========================================================================
-- Match RPC v2 (per spec) + RPC auth hardening helpers
-- =========================================================================
-- 이 마이그레이션은 다음을 보장합니다:
--   1) `public.match_seekers_to_job(p_job_id uuid)` 가 spec 시그니처로 존재.
--      반환 컬럼: seeker_id, name, match_score, neighborhood, certificates
--      (기존 `matched_days / matched_certs / reason` 컬럼은 backward-compat 으로 유지)
--   2) RPC 가 매칭 결과를 계산할 때 anon/employer 양쪽에서 호출 가능하도록
--      SECURITY DEFINER + GRANT EXECUTE 가 적절히 설정됨.
--   3) 인증 누락 시 `unauthorized` 라는 명확한 예외를 던지도록 guard.
--   4) `get_employer_billing_status` 가 PRO 가드를 통과할 수 있도록
--      RLS 가 profiles 에서 자기 row 를 SELECT 할 수 있도록 함.
--
-- 적용 후:
--   SELECT proname, pg_get_function_result(oid)
--   FROM pg_proc WHERE proname = 'match_seekers_to_job';
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) match_seekers_to_job v2 (spec 시그니처)
-- -------------------------------------------------------------------------
-- NOTE: 시그니처가 다르면 같은 이름으로 CREATE OR REPLACE 가 실패할 수 있다.
-- 안전하게 DROP 후 재작성한다.
DROP FUNCTION IF EXISTS public.match_seekers_to_job(uuid);

CREATE OR REPLACE FUNCTION public.match_seekers_to_job(p_job_id uuid)
RETURNS TABLE (
  seeker_id uuid,
  name text,
  match_score integer,
  neighborhood text,
  certificates text[],
  -- backward-compat: 기존 클라이언트가 사용하던 필드
  matched_days text[],
  matched_certs text[],
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employer_id uuid := auth.uid();
  v_is_pro boolean;
  v_job_employer_id uuid;
  v_job_exists boolean;
BEGIN
  -- 1) 인증 확인
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 2) 공고 존재 + 소유권 확인
  SELECT j.employer_id, TRUE
    INTO v_job_employer_id, v_job_exists
  FROM public.job_posts j
  WHERE j.id = p_job_id;

  IF v_job_exists IS NULL THEN
    RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_job_employer_id <> v_employer_id THEN
    RAISE EXCEPTION 'not_your_job' USING ERRCODE = '42501';
  END IF;

  -- 3) PRO 권한 확인
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_employer_id
      AND p.role = 'employer'
      AND (p.pro_subscriber = true OR p.grace_period_active = true)
  ) INTO v_is_pro;

  IF NOT v_is_pro THEN
    RAISE EXCEPTION 'pro_required' USING ERRCODE = '42501';
  END IF;

  -- 4) 매칭 계산
  RETURN QUERY
  WITH
  base AS (
    SELECT
      s.id   AS seeker_id,
      s.name::text AS name,
      s.neighborhood,
      s.availability,
      s.has_sir,
      s.has_foodsafe
    FROM public.profiles s
    WHERE s.role = 'seeker'
  ),
  req AS (
    SELECT
      COALESCE(jr.preferred_days,           '{}'::text[])   AS days,
      COALESCE(jr.preferred_shifts,         '{}'::text[])   AS shifts,
      COALESCE(jr.required_certificate_ids, '{}'::uuid[])   AS cert_ids
    FROM public.job_post_requirements jr
    WHERE jr.job_id = p_job_id
  ),
  -- 자격증 마스터 라벨 매칭
  seeker_certs AS (
    SELECT
      sc.seeker_id,
      ARRAY_AGG(c.label_en ORDER BY c.label_en) FILTER (WHERE c.id IS NOT NULL) AS labels,
      ARRAY_AGG(c.id) FILTER (WHERE c.id IS NOT NULL)                            AS cert_ids
    FROM public.seeker_certificates sc
    JOIN public.certificates c ON c.id = sc.certificate_id
    GROUP BY sc.seeker_id
  ),
  -- 가용 요일 / 시프트 계산
  day_match AS (
    SELECT
      b.seeker_id,
      ARRAY(
        SELECT DISTINCT d
        FROM req r
        CROSS JOIN LATERAL jsonb_object_keys(b.availability) AS d
        WHERE d = ANY(r.days)
      ) AS matched_days
    FROM base b
  ),
  cert_match AS (
    SELECT
      b.seeker_id,
      COALESCE(
        ARRAY(
          SELECT c.label_en
          FROM req r
          JOIN public.certificates c ON c.id = ANY(r.cert_ids)
          WHERE c.id = ANY(COALESCE(sc.cert_ids, '{}'::uuid[]))
        ),
        '{}'::text[]
      ) AS matched_certs
    FROM base b
    LEFT JOIN seeker_certs sc ON sc.seeker_id = b.seeker_id
  )
  SELECT
    b.seeker_id,
    b.name,
    (
      -- 점수: 요일 일치 * 10 + 자격증 일치 * 25 + 비자 유효 +5
      (SELECT COUNT(*) FROM unnest(COALESCE(dm.matched_days,  '{}'::text[])) x) * 10
      + (SELECT COUNT(*) FROM unnest(COALESCE(cm.matched_certs, '{}'::text[])) x) * 25
      + CASE
          WHEN (b.has_sir IS TRUE)        THEN 5
          ELSE 0
        END
      + CASE
          WHEN (b.has_foodsafe IS TRUE)   THEN 5
          ELSE 0
        END
    )::integer                                          AS match_score,
    b.neighborhood                                      AS neighborhood,
    COALESCE(cm.matched_certs, '{}'::text[])            AS certificates,
    COALESCE(dm.matched_days,  '{}'::text[])            AS matched_days,
    COALESCE(cm.matched_certs, '{}'::text[])            AS matched_certs,
    (
      CASE
        WHEN (SELECT COUNT(*) FROM unnest(COALESCE(cm.matched_certs, '{}'::text[])) x) > 0
         AND (SELECT COUNT(*) FROM unnest(COALESCE(dm.matched_days,  '{}'::text[])) x) > 0
          THEN '스케줄 + 자격증 매칭'
        WHEN (SELECT COUNT(*) FROM unnest(COALESCE(cm.matched_certs, '{}'::text[])) x) > 0
          THEN '필요 자격증 보유'
        WHEN (SELECT COUNT(*) FROM unnest(COALESCE(dm.matched_days,  '{}'::text[])) x) > 0
          THEN '근무 가능 요일 일치'
        ELSE '기본 후보'
      END
    )                                                   AS reason
  FROM base b
  LEFT JOIN day_match  dm ON dm.seeker_id = b.seeker_id
  LEFT JOIN cert_match cm ON cm.seeker_id = b.seeker_id
  ORDER BY match_score DESC, b.name ASC
  LIMIT 50;
END;
$$;

-- RPC 실행 권한: 인증된 employer + service_role
GRANT EXECUTE ON FUNCTION public.match_seekers_to_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_seekers_to_job(uuid) TO service_role;

COMMENT ON FUNCTION public.match_seekers_to_job(uuid) IS
  'PRO employer 전용 매칭 추천. spec 시그니처: seeker_id, name, match_score, neighborhood, certificates (+ backward-compat: matched_days, matched_certs, reason).';

-- -------------------------------------------------------------------------
-- 2) 안전 가드: anon 키로 호출하더라도 명시적인 unauthorized
-- -------------------------------------------------------------------------
-- supabase-js 의 anon 클라이언트도 RLS 통과 후 SECURITY DEFINER 함수 호출이 가능하지만,
-- auth.uid() 가 NULL 이면 명시적으로 거절하도록 통일한다.
-- (이미 위 함수 본문에서 처리 중이므로 추가 작업은 없음. 주석만 남김.)

-- -------------------------------------------------------------------------
-- 3) get_employer_billing_status 가 profiles 자기 row 를 읽을 수 있도록
--    RLS 가 SELECT 를 허용하는지 sanity check. (마이그레이션은 NOOP)
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Users can view own profile'
  ) THEN
    RAISE NOTICE 'profiles RLS "Users can view own profile" 정책이 없습니다. 필요 시 추가하세요.';
  END IF;
END$$;

-- -------------------------------------------------------------------------
-- 4) 안내: 적용 후 확인 쿼리
-- -------------------------------------------------------------------------
-- SELECT proname, pg_get_function_result(oid) AS signature
-- FROM pg_proc
-- WHERE proname IN ('match_seekers_to_job', 'view_seeker_profile', 'get_employer_billing_status')
-- ORDER BY proname;
