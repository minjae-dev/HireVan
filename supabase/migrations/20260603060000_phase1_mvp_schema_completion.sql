-- Phase 1 MVP schema completion: plans, resumes, interview scheduling, and PRO fields.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free', 'pro'));

ALTER TABLE public.job_posts
  ADD COLUMN IF NOT EXISTS require_resume boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_questions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS resume_url text,
  ADD COLUMN IF NOT EXISTS custom_answers jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_url text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(seeker_id)
);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Seekers can view own resumes" ON public.resumes;
DROP POLICY IF EXISTS "Employers can view accepted applicant resumes" ON public.resumes;
DROP POLICY IF EXISTS "Seekers can insert own resumes" ON public.resumes;
DROP POLICY IF EXISTS "Seekers can update own resumes" ON public.resumes;
DROP POLICY IF EXISTS "Seekers can delete own resumes" ON public.resumes;

CREATE POLICY "Seekers can view own resumes"
  ON public.resumes FOR SELECT
  TO authenticated
  USING (seeker_id = auth.uid());

CREATE POLICY "Employers can view accepted applicant resumes"
  ON public.resumes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications
      JOIN public.job_posts ON job_posts.id = applications.job_post_id
      WHERE applications.seeker_id = resumes.seeker_id
        AND applications.status = 'accepted'
        AND job_posts.employer_id = auth.uid()
    )
  );

CREATE POLICY "Seekers can insert own resumes"
  ON public.resumes FOR INSERT
  TO authenticated
  WITH CHECK (seeker_id = auth.uid());

CREATE POLICY "Seekers can update own resumes"
  ON public.resumes FOR UPDATE
  TO authenticated
  USING (seeker_id = auth.uid())
  WITH CHECK (seeker_id = auth.uid());

CREATE POLICY "Seekers can delete own resumes"
  ON public.resumes FOR DELETE
  TO authenticated
  USING (seeker_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmed_date timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(application_id)
);

ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view interviews" ON public.interviews;
DROP POLICY IF EXISTS "Employers can create interviews" ON public.interviews;
DROP POLICY IF EXISTS "Participants can update interviews" ON public.interviews;

CREATE POLICY "Participants can view interviews"
  ON public.interviews FOR SELECT
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid());

CREATE POLICY "Employers can create interviews"
  ON public.interviews FOR INSERT
  TO authenticated
  WITH CHECK (
    employer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.applications
      WHERE applications.id = interviews.application_id
        AND applications.seeker_id = interviews.seeker_id
        AND applications.status = 'accepted'
    )
  );

CREATE POLICY "Participants can update interviews"
  ON public.interviews FOR UPDATE
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid())
  WITH CHECK (employer_id = auth.uid() OR seeker_id = auth.uid());

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE;

INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Users can upload own resume files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own resume files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own resume files" ON storage.objects;
DROP POLICY IF EXISTS "Public can read resume files" ON storage.objects;

CREATE POLICY "Public can read resume files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'resumes');

CREATE POLICY "Users can upload own resume files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

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

CREATE POLICY "Users can delete own resume files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
