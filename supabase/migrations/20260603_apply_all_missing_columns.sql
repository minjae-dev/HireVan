-- HireVan MVP - 누락된 모든 컬럼 추가
-- 이 스크립트를 Supabase SQL Editor에서 실행하세요

-- 1. job_posts 테이블에 누락된 컬럼 추가
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS category text DEFAULT '';
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS deadline date;
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS require_resume boolean NOT NULL DEFAULT false;
ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS custom_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- category CHECK 제약조건 업데이트
ALTER TABLE job_posts DROP CONSTRAINT IF EXISTS job_posts_category_check;
ALTER TABLE job_posts ADD CONSTRAINT job_posts_category_check 
CHECK (category IN ('카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타', ''));

-- 2. applications 테이블에 누락된 컬럼 추가
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_url text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS custom_answers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. profiles 테이블에 plan 컬럼 추가 (이미 있을 수 있음)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free', 'pro'));

-- 4. interviews 테이블 생성 (없으면)
CREATE TABLE IF NOT EXISTS interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  proposed_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_date timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(application_id)
);

ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- interviews RLS policies
DROP POLICY IF EXISTS "Participants can view interviews" ON interviews;
CREATE POLICY "Participants can view interviews"
  ON interviews FOR SELECT
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid());

DROP POLICY IF EXISTS "Employers can create interviews" ON interviews;
CREATE POLICY "Employers can create interviews"
  ON interviews FOR INSERT
  TO authenticated
  WITH CHECK (
    employer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = interviews.application_id
        AND applications.seeker_id = interviews.seeker_id
        AND applications.status = 'accepted'
    )
  );

DROP POLICY IF EXISTS "Participants can update interviews" ON interviews;
CREATE POLICY "Participants can update interviews"
  ON interviews FOR UPDATE
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid())
  WITH CHECK (employer_id = auth.uid() OR seeker_id = auth.uid());

-- 5. resumes 테이블 생성 (없으면)
CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(seeker_id)
);

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

-- resumes RLS policies
DROP POLICY IF EXISTS "Seekers can view own resumes" ON resumes;
CREATE POLICY "Seekers can view own resumes"
  ON resumes FOR SELECT
  TO authenticated
  USING (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Employers can view accepted applicant resumes" ON resumes;
CREATE POLICY "Employers can view accepted applicant resumes"
  ON resumes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications
      JOIN job_posts ON job_posts.id = applications.job_post_id
      WHERE applications.seeker_id = resumes.seeker_id
        AND applications.status = 'accepted'
        AND job_posts.employer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Seekers can insert own resumes" ON resumes;
CREATE POLICY "Seekers can insert own resumes"
  ON resumes FOR INSERT
  TO authenticated
  WITH CHECK (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Seekers can update own resumes" ON resumes;
CREATE POLICY "Seekers can update own resumes"
  ON resumes FOR UPDATE
  TO authenticated
  USING (seeker_id = auth.uid())
  WITH CHECK (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Seekers can delete own resumes" ON resumes;
CREATE POLICY "Seekers can delete own resumes"
  ON resumes FOR DELETE
  TO authenticated
  USING (seeker_id = auth.uid());

-- 6. Storage bucket 설정 (resumes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage policies
CREATE POLICY "Public can read resume files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes');

DROP POLICY IF EXISTS "Users can upload own resume files" ON storage.objects;
CREATE POLICY "Users can upload own resume files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own resume files" ON storage.objects;
CREATE POLICY "Users can update own resume files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own resume files" ON storage.objects;
CREATE POLICY "Users can delete own resume files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );CREATE POLICY "Public can read resume files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes');

DROP POLICY IF EXISTS "Users can upload own resume files" ON storage.objects;
CREATE POLICY "Users can upload own resume files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own resume files" ON storage.objects;
CREATE POLICY "Users can update own resume files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own resume files" ON storage.objects;
CREATE POLICY "Users can delete own resume files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
