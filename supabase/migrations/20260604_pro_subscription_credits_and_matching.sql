-- =========================================================================
-- HireVan PRO 구독 + 웰컴 크레딧 + 유예기간 + 스마트 매칭 알림
-- =========================================================================
-- Idempotent migration. 기존 `profiles` 테이블을 확장하고,
-- certificates / notifications / employer_seeker_views 테이블을 추가하며,
-- 매칭/크레딧 RPC와 트리거를 정의합니다.

-- -------------------------------------------------------------------------
-- 1. 비자 상태 enum
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visa_status_enum') THEN
    CREATE TYPE public.visa_status_enum AS ENUM (
      'working_holiday',
      'co_op',
      'student',
      'post_grad_work',
      'permanent_resident',
      'citizen',
      'other'
    );
  END IF;
END$$;

-- visa_status 컬럼 추가 (있으면 무시)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS visa_status public.visa_status_enum;

-- -------------------------------------------------------------------------
-- 2. profiles 확장: 크레딧 / PRO 상태 / 유예기간
-- -------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pro_subscriber boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_credit_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS english_level text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_english_level_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_english_level_check
      CHECK (english_level IS NULL OR english_level IN ('beginner', 'intermediate', 'advanced', 'native'));
  END IF;
END$$;

COMMENT ON COLUMN public.profiles.credit_count
  IS '구직자 프로필 열람용 크레딧. 가입 시 3개 부여, 1회 열람 = -1.';
COMMENT ON COLUMN public.profiles.pro_subscriber
  IS 'Stripe 활성 구독 여부. true면 무제한 열람 + 상세 프로필 비공개 해제.';
COMMENT ON COLUMN public.profiles.subscription_ends_at
  IS '현재 구독 만료 시각.';
COMMENT ON COLUMN public.profiles.grace_period_active
  IS '결제 실패 후 유예기간 3일 진행 중 여부.';
COMMENT ON COLUMN public.profiles.grace_period_ends_at
  IS '유예기간 종료 시각 (결제 실패로부터 3일 후).';
COMMENT ON COLUMN public.profiles.last_payment_failed_at
  IS '마지막 결제 실패 시각.';
COMMENT ON COLUMN public.profiles.welcome_credit_granted
  IS '웰컴 크레딧 1회성 부여 여부 (중복 부여 방지).';
COMMENT ON COLUMN public.profiles.english_level
  IS '구직자 영어 레벨 (beginner/intermediate/advanced/native).';

CREATE INDEX IF NOT EXISTS idx_profiles_pro_subscriber
  ON public.profiles(pro_subscriber) WHERE pro_subscriber = true;

CREATE INDEX IF NOT EXISTS idx_profiles_grace_period
  ON public.profiles(grace_period_ends_at)
  WHERE grace_period_active = true;

-- -------------------------------------------------------------------------
-- 3. 자격증 (certificates) - 정규화 테이블
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_ko text NOT NULL,
  label_en text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.seeker_certificates (
  seeker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  certificate_id uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  issued_at date,
  expires_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seeker_id, certificate_id)
);

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seeker_certificates ENABLE ROW LEVEL SECURITY;

INSERT INTO public.certificates (code, label_ko, label_en, category) VALUES
  ('sir', '서빙 잇 라이트 (Serving It Right)', 'Serving It Right', 'liquor'),
  ('foodsafe', 'FoodSafe (BC)', 'FoodSafe Certificate', 'food'),
  ('first_aid', '응급처치 (First Aid)', 'First Aid / CPR', 'safety'),
  ('barista', '바리스타 자격증', 'Barista Certificate', 'food'),
  ('food_safe_level2', 'FoodSafe Level 2', 'FoodSafe Level 2', 'food')
ON CONFLICT (code) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view certificate master" ON public.certificates;
CREATE POLICY "Anyone can view certificate master"
  ON public.certificates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Seekers can view own certificates" ON public.seeker_certificates;
CREATE POLICY "Seekers can view own certificates"
  ON public.seeker_certificates FOR SELECT TO authenticated
  USING (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Seekers can insert own certificates" ON public.seeker_certificates;
CREATE POLICY "Seekers can insert own certificates"
  ON public.seeker_certificates FOR INSERT TO authenticated
  WITH CHECK (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Seekers can update own certificates" ON public.seeker_certificates;
CREATE POLICY "Seekers can update own certificates"
  ON public.seeker_certificates FOR UPDATE TO authenticated
  USING (seeker_id = auth.uid())
  WITH CHECK (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Seekers can delete own certificates" ON public.seeker_certificates;
CREATE POLICY "Seekers can delete own certificates"
  ON public.seeker_certificates FOR DELETE TO authenticated
  USING (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Pro employers can view seeker certificates for matching" ON public.seeker_certificates;
CREATE POLICY "Pro employers can view seeker certificates for matching"
  ON public.seeker_certificates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND viewer.role = 'employer'
        AND (viewer.pro_subscriber = true OR viewer.grace_period_active = true)
    )
  );

-- -------------------------------------------------------------------------
-- 4. notifications 테이블
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END$$;

-- -------------------------------------------------------------------------
-- 5. employer_seeker_views (열람 추적 + 크레딧 차감)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_seeker_views (
  employer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_viewed_at timestamptz NOT NULL DEFAULT now(),
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  view_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (employer_id, seeker_id)
);

CREATE INDEX IF NOT EXISTS idx_employer_seeker_views_employer
  ON public.employer_seeker_views(employer_id, last_viewed_at DESC);

ALTER TABLE public.employer_seeker_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employers can view own view history" ON public.employer_seeker_views;
CREATE POLICY "Employers can view own view history"
  ON public.employer_seeker_views FOR SELECT TO authenticated
  USING (employer_id = auth.uid());

-- -------------------------------------------------------------------------
-- 6. profiles_public 뷰: 결제 정보는 숨기고, PRO employer에게만 premium 노출
-- -------------------------------------------------------------------------
-- 보안 모델:
--   - seeker 본인: 모든 컬럼 그대로
--   - PRO employer (pro_subscriber OR grace_period_active): 모든 컬럼
--   - 그 외 employer: visa_*, availability, neighborhood, has_sir,
--                     has_foodsafe, english_level → NULL
--   - 이미 크레딧을 써서 본 구직자: premium 컬럼 노출 (재열람 무료)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.role,
  p.name,
  p.avatar_url,
  p.bio,
  p.no_show_count,
  p.created_at,

  -- premium 필드들: 본인 / PRO / 이미 본 구직자만 노출
  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.visa_status::text
    WHEN public.is_pro_employer(auth.uid()) THEN p.visa_status::text
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.visa_status::text
    ELSE NULL
  END AS visa_status,

  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.visa_type
    WHEN public.is_pro_employer(auth.uid()) THEN p.visa_type
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.visa_type
    ELSE NULL
  END AS visa_type,

  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.visa_expiry
    WHEN public.is_pro_employer(auth.uid()) THEN p.visa_expiry
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.visa_expiry
    ELSE NULL
  END AS visa_expiry,

  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.availability
    WHEN public.is_pro_employer(auth.uid()) THEN p.availability
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.availability
    ELSE NULL
  END AS availability,

  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.neighborhood
    WHEN public.is_pro_employer(auth.uid()) THEN p.neighborhood
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.neighborhood
    ELSE NULL
  END AS neighborhood,

  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.has_sir
    WHEN public.is_pro_employer(auth.uid()) THEN p.has_sir
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.has_sir
    ELSE NULL
  END AS has_sir,

  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.has_foodsafe
    WHEN public.is_pro_employer(auth.uid()) THEN p.has_foodsafe
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.has_foodsafe
    ELSE NULL
  END AS has_foodsafe,

  CASE
    WHEN p.role <> 'seeker' THEN NULL
    WHEN auth.uid() = p.id THEN p.english_level
    WHEN public.is_pro_employer(auth.uid()) THEN p.english_level
    WHEN public.has_employer_viewed_seeker(auth.uid(), p.id) THEN p.english_level
    ELSE NULL
  END AS english_level

FROM public.profiles p;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;

-- -------------------------------------------------------------------------
-- 7. 헬퍼 함수: PRO employer 여부 / 이미 본 구직자 여부
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pro_employer(p_viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_viewer_id
      AND role = 'employer'
      AND (pro_subscriber = true OR grace_period_active = true)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_pro_employer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro_employer(uuid) TO anon;

CREATE OR REPLACE FUNCTION public.has_employer_viewed_seeker(
  p_employer_id uuid,
  p_seeker_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employer_seeker_views
    WHERE employer_id = p_employer_id
      AND seeker_id = p_seeker_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_employer_viewed_seeker(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_employer_viewed_seeker(uuid, uuid) TO anon;

-- -------------------------------------------------------------------------
-- 8. RPC: 웰컴 크레딧 1회 부여 (employer 가입 시 자동 호출)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_welcome_credit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_credit integer;
  v_granted boolean;
  v_role text;
BEGIN
  SELECT credit_count, welcome_credit_granted, role
    INTO v_current_credit, v_granted, v_role
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found: %', p_user_id;
  END IF;

  IF v_role <> 'employer' THEN
    RETURN v_current_credit;
  END IF;

  IF v_granted THEN
    RETURN v_current_credit;
  END IF;

  UPDATE public.profiles
    SET credit_count = credit_count + 3,
        welcome_credit_granted = true
    WHERE id = p_user_id
    RETURNING credit_count INTO v_current_credit;

  RETURN v_current_credit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_welcome_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_welcome_credit(uuid) TO service_role;

-- 가입 시 employer에게 자동으로 웰컴 크레딧 부여
-- (service_role이 호출하거나, 트리거로 호출)
CREATE OR REPLACE FUNCTION public.handle_new_user_welcome_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'employer' AND NOT NEW.welcome_credit_granted THEN
    NEW.credit_count := NEW.credit_count + 3;
    NEW.welcome_credit_granted := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_user_welcome_credit ON public.profiles;
CREATE TRIGGER trg_handle_new_user_welcome_credit
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_welcome_credit();

-- -------------------------------------------------------------------------
-- 9. RPC: 구직자 프로필 열람 (크레딧 차감 + 열람 기록)
-- -------------------------------------------------------------------------
-- 반환값:
--   {
--     ok: boolean,
--     reason: 'granted' | 'pro' | 'already_viewed' | 'no_credit',
--     profile: profiles_public row (premium 컬럼 포함),
--     credits_remaining: integer
--   }
CREATE OR REPLACE FUNCTION public.view_seeker_profile(p_seeker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employer_id uuid := auth.uid();
  v_credit_count integer;
  v_pro_subscriber boolean;
  v_grace_period_active boolean;
  v_already_viewed boolean;
  v_seeker_role text;
  v_result jsonb;
BEGIN
  IF v_employer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT role INTO v_seeker_role
  FROM public.profiles
  WHERE id = p_seeker_id;

  IF v_seeker_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'seeker_not_found');
  END IF;

  IF v_seeker_role <> 'seeker' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_seeker');
  END IF;

  SELECT credit_count, pro_subscriber, grace_period_active
    INTO v_credit_count, v_pro_subscriber, v_grace_period_active
  FROM public.profiles
  WHERE id = v_employer_id
  FOR UPDATE;

  IF v_pro_subscriber = true OR v_grace_period_active = true THEN
    INSERT INTO public.employer_seeker_views (employer_id, seeker_id, last_viewed_at, view_count)
      VALUES (v_employer_id, p_seeker_id, now(), 1)
      ON CONFLICT (employer_id, seeker_id)
      DO UPDATE SET last_viewed_at = now(), view_count = employer_seeker_views.view_count + 1;

    SELECT to_jsonb(p) INTO v_result FROM public.profiles_public p WHERE p.id = p_seeker_id;
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'pro',
      'profile', v_result,
      'credits_remaining', v_credit_count
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.employer_seeker_views
    WHERE employer_id = v_employer_id AND seeker_id = p_seeker_id
  ) INTO v_already_viewed;

  IF v_already_viewed THEN
    SELECT to_jsonb(p) INTO v_result FROM public.profiles_public p WHERE p.id = p_seeker_id;
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'already_viewed',
      'profile', v_result,
      'credits_remaining', v_credit_count
    );
  END IF;

  IF v_credit_count <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_credit',
      'credits_remaining', 0
    );
  END IF;

  UPDATE public.profiles
    SET credit_count = credit_count - 1
    WHERE id = v_employer_id
    RETURNING credit_count INTO v_credit_count;

  INSERT INTO public.employer_seeker_views (employer_id, seeker_id, last_viewed_at, view_count)
    VALUES (v_employer_id, p_seeker_id, now(), 1)
    ON CONFLICT (employer_id, seeker_id)
    DO UPDATE SET last_viewed_at = now(), view_count = employer_seeker_views.view_count + 1;

  SELECT to_jsonb(p) INTO v_result FROM public.profiles_public p WHERE p.id = p_seeker_id;
  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'granted',
    'profile', v_result,
    'credits_remaining', v_credit_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.view_seeker_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.view_seeker_profile(uuid) TO service_role;

-- -------------------------------------------------------------------------
-- 10. RPC: 스마트 매칭 - 특정 공고에 맞는 구직자 추천 (PRO 전용)
-- -------------------------------------------------------------------------
-- input: p_job_id
-- output: 매칭 점수 순으로 정렬된 구직자 목록
CREATE OR REPLACE FUNCTION public.match_seekers_to_job(p_job_id uuid)
RETURNS TABLE (
  seeker_id uuid,
  name text,
  match_score integer,
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
  v_job record;
BEGIN
  -- 인증 & PRO 권한 체크
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_employer_id
      AND role = 'employer'
      AND (pro_subscriber = true OR grace_period_active = true)
  ) INTO v_is_pro;

  IF NOT v_is_pro THEN
    RAISE EXCEPTION 'pro_required';
  END IF;

  -- 공고 정보
  SELECT j.id, j.employer_id, j.category, j.work_hours
    INTO v_job
  FROM public.job_posts j
  WHERE j.id = p_job_id;

  IF v_job.employer_id <> v_employer_id THEN
    RAISE EXCEPTION 'not_your_job';
  END IF;

  -- job_post_requirements 테이블이 없으면 optional로 처리
  RETURN QUERY
  WITH req AS (
    SELECT
      COALESCE(jr.preferred_days, '{}'::text[]) AS days,
      COALESCE(jr.preferred_shifts, '{}'::text[]) AS shifts,
      COALESCE(jr.required_certificate_ids, '{}'::uuid[]) AS certs
    FROM public.job_post_requirements jr
    WHERE jr.job_id = p_job_id
  ),
  base AS (
    SELECT
      s.id AS seeker_id,
      s.name::text AS name
    FROM public.profiles s
    WHERE s.role = 'seeker'
  ),
  -- 가용 시간 매칭
  sched AS (
    SELECT
      b.seeker_id,
      b.name,
      ARRAY(
        SELECT DISTINCT day
        FROM req r
        CROSS JOIN LATERAL jsonb_object_keys(s.availability) AS day
        WHERE day = ANY(r.days)
      ) AS matched_days
    FROM base b
    JOIN public.profiles s ON s.id = b.seeker_id
  ),
  -- 자격증 매칭
  cert_match AS (
    SELECT
      b.seeker_id,
      ARRAY_AGG(c.label_en) AS matched_certs
    FROM base b
    JOIN public.seeker_certificates sc ON sc.seeker_id = b.seeker_id
    JOIN public.certificates c ON c.id = sc.certificate_id
    WHERE c.id IN (SELECT certs FROM req)
    GROUP BY b.seeker_id
  )
  SELECT
    b.seeker_id,
    b.name,
    (
      (SELECT COUNT(*) FROM unnest(COALESCE(sched.matched_days, '{}')) d) * 10
      + (SELECT COUNT(*) FROM unnest(COALESCE(cm.matched_certs, '{}')) cc) * 25
      + CASE WHEN s.visa_expiry IS NOT NULL AND s.visa_expiry > now() THEN 5 ELSE 0 END
    )::integer AS match_score,
    COALESCE(sched.matched_days, '{}'::text[]) AS matched_days,
    COALESCE(cm.matched_certs, '{}'::text[]) AS matched_certs,
    (
      CASE
        WHEN (SELECT COUNT(*) FROM unnest(COALESCE(cm.matched_certs, '{}')) cc) > 0
          AND (SELECT COUNT(*) FROM unnest(COALESCE(sched.matched_days, '{}')) d) > 0
        THEN '스케줄 + 자격증 매칭'
        WHEN (SELECT COUNT(*) FROM unnest(COALESCE(cm.matched_certs, '{}')) cc) > 0
        THEN '필요 자격증 보유'
        WHEN (SELECT COUNT(*) FROM unnest(COALESCE(sched.matched_days, '{}')) d) > 0
        THEN '근무 가능 요일 일치'
        ELSE '기본 후보'
      END
    ) AS reason
  FROM base b
  JOIN public.profiles s ON s.id = b.seeker_id
  LEFT JOIN sched ON sched.seeker_id = b.seeker_id
  LEFT JOIN cert_match cm ON cm.seeker_id = b.seeker_id
  WHERE public.has_employer_viewed_seeker(v_employer_id, b.seeker_id)
     OR public.is_pro_employer(v_employer_id)
  ORDER BY match_score DESC, b.name ASC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_seekers_to_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_seekers_to_job(uuid) TO service_role;

-- -------------------------------------------------------------------------
-- 11. job_post_requirements: 공고의 선호 요일/시프트/필수 자격증
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_post_requirements (
  job_id uuid PRIMARY KEY REFERENCES public.job_posts(id) ON DELETE CASCADE,
  preferred_days text[] NOT NULL DEFAULT '{}',
  preferred_shifts text[] NOT NULL DEFAULT '{}',
  required_certificate_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_post_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view job requirements" ON public.job_post_requirements;
CREATE POLICY "Anyone can view job requirements"
  ON public.job_post_requirements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Employers can manage own job requirements" ON public.job_post_requirements;
CREATE POLICY "Employers can manage own job requirements"
  ON public.job_post_requirements FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_posts j
      WHERE j.id = job_post_requirements.job_id
        AND j.employer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_posts j
      WHERE j.id = job_post_requirements.job_id
        AND j.employer_id = auth.uid()
    )
  );

-- -------------------------------------------------------------------------
-- 12. 트리거: 구직자 프로필 업데이트 → PRO employer 매칭 알림
-- -------------------------------------------------------------------------
-- 조건: 구직자가 availability / certificate / neighborhood 등을 갱신했을 때,
-- 자신의 새 프로필과 매칭되는 공고(PRO employer 소유)를 찾아 알림을 보냅니다.
CREATE OR REPLACE FUNCTION public.notify_matching_employers_on_seeker_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_seeker_name text;
BEGIN
  -- seeker가 아니거나 availability가 변하지 않았으면 스킵
  IF NEW.role <> 'seeker' THEN
    RETURN NEW;
  END IF;

  IF OLD.availability IS NOT DISTINCT FROM NEW.availability
     AND OLD.neighborhood IS NOT DISTINCT FROM NEW.neighborhood
     AND OLD.has_sir IS NOT DISTINCT FROM NEW.has_sir
     AND OLD.has_foodsafe IS NOT DISTINCT FROM NEW.has_foodsafe
  THEN
    RETURN NEW;
  END IF;

  v_seeker_name := NEW.name;

  FOR v_match IN
    WITH seeker_caps AS (
      SELECT
        ARRAY(
          SELECT jsonb_object_keys(NEW.availability)
        ) AS days,
        ARRAY(
          SELECT DISTINCT elem
          FROM jsonb_array_elements_text(
            jsonb_path_query_array(NEW.availability, '$.*[*]')
          ) AS elem
        ) AS shifts
    ),
    seeker_certs AS (
      SELECT ARRAY_AGG(c.id) AS ids
      FROM public.seeker_certificates sc
      JOIN public.certificates c ON c.id = sc.certificate_id
      WHERE sc.seeker_id = NEW.id
    )
    SELECT
      jp.id AS job_id,
      jp.title AS job_title,
      jp.employer_id,
      jr.preferred_days,
      jr.preferred_shifts,
      jr.required_certificate_ids
    FROM public.job_post_requirements jr
    JOIN public.job_posts jp ON jp.id = jr.job_id
    JOIN public.profiles emp ON emp.id = jp.employer_id
    CROSS JOIN seeker_caps sc
    CROSS JOIN seeker_certs sct
    WHERE jp.status = 'open'
      AND (emp.pro_subscriber = true OR emp.grace_period_active = true)
      AND (
        (sc.days && jr.preferred_days)
        OR (sc.ids && jr.required_certificate_ids)
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link, metadata)
      VALUES (
        v_match.employer_id,
        'seeker_match',
        '새 매칭 구직자: ' || v_seeker_name,
        '스케줄/자격증 조건이 일치하는 구직자가 프로필을 업데이트했어요.',
        '/employer/jobs/' || v_match.job_id,
        jsonb_build_object(
          'seeker_id', NEW.id,
          'job_id', v_match.job_id,
          'matched_days', v_match.preferred_days,
          'matched_certs', v_match.required_certificate_ids
        )
      );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_matching_employers_on_seeker_update ON public.profiles;
CREATE TRIGGER trg_notify_matching_employers_on_seeker_update
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_matching_employers_on_seeker_update();

-- -------------------------------------------------------------------------
-- 13. RPC: 유예기간 만료 시 자동 다운그레이드 (크론 또는 webhook에서 호출)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_grace_periods()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected integer;
BEGIN
  UPDATE public.profiles
    SET grace_period_active = false,
        grace_period_ends_at = NULL,
        pro_subscriber = false
  WHERE grace_period_active = true
    AND grace_period_ends_at IS NOT NULL
    AND grace_period_ends_at < now();

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN v_affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_grace_periods() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_grace_periods() TO authenticated;

-- -------------------------------------------------------------------------
-- 14. RPC: 현재 employer 상태 조회 (대시보드 배너용)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_employer_billing_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employer_id uuid := auth.uid();
  v_row record;
BEGIN
  IF v_employer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT
    p.role,
    p.plan,
    p.pro_subscriber,
    p.credit_count,
    p.subscription_ends_at,
    p.grace_period_active,
    p.grace_period_ends_at,
    p.last_payment_failed_at,
    p.stripe_customer_id,
    p.stripe_subscription_id
  INTO v_row
  FROM public.profiles p
  WHERE p.id = v_employer_id;

  IF v_row.role IS NULL OR v_row.role <> 'employer' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_employer');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'plan', v_row.plan,
    'pro_subscriber', v_row.pro_subscriber,
    'credit_count', v_row.credit_count,
    'subscription_ends_at', v_row.subscription_ends_at,
    'grace_period_active', v_row.grace_period_active,
    'grace_period_ends_at', v_row.grace_period_ends_at,
    'last_payment_failed_at', v_row.last_payment_failed_at,
    'has_stripe_customer', v_row.stripe_customer_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employer_billing_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employer_billing_status() TO service_role;

-- -------------------------------------------------------------------------
-- 15. 마이그레이션 종료
-- -------------------------------------------------------------------------
-- 적용 후 확인:
--   SELECT * FROM public.certificates;
--   SELECT proname FROM pg_proc WHERE proname IN (
--     'grant_welcome_credit', 'view_seeker_profile',
--     'match_seekers_to_job', 'expire_grace_periods',
--     'get_employer_billing_status', 'is_pro_employer', 'has_employer_viewed_seeker'
--   );

