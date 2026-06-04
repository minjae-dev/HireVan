-- HireVan MVP - 전체 스키마 생성
-- Supabase SQL Editor에서 실행하세요

-- 1. profiles 테이블 (이미 있을 수 있음)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('employer', 'seeker')),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  name text NOT NULL DEFAULT '',
  bio text DEFAULT '',
  visa_type text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. job_posts 테이블 (이미 있을 수 있음)
CREATE TABLE IF NOT EXISTS job_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  category text DEFAULT '' CHECK (category IN ('카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타', '')),
  salary text DEFAULT '',
  work_hours text DEFAULT '',
  description text DEFAULT '',
  deadline date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  require_resume boolean NOT NULL DEFAULT false,
  custom_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_posts ENABLE ROW LEVEL SECURITY;

-- 3. applications 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  resume_url text,
  custom_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_post_id, seeker_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- 4. resumes 테이블 (없으면 생성)
CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(seeker_id)
);

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

-- 5. interviews 테이블 (없으면 생성)
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

-- 6. chat_rooms 테이블 (이미 있을 수 있음)
CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_post_id, seeker_id)
);

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

-- 7. messages 테이블 (이미 있을 수 있음)
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 8. reviews 테이블 (이미 있을 수 있음)
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- profiles
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
CREATE POLICY "Anyone can view profiles" ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- job_posts
DROP POLICY IF EXISTS "Anyone can view open job posts" ON job_posts;
CREATE POLICY "Anyone can view open job posts" ON job_posts FOR SELECT TO authenticated USING (status = 'open' OR employer_id = auth.uid());

DROP POLICY IF EXISTS "Employers can insert job posts" ON job_posts;
CREATE POLICY "Employers can insert job posts" ON job_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = employer_id);

DROP POLICY IF EXISTS "Employers can update own job posts" ON job_posts;
CREATE POLICY "Employers can update own job posts" ON job_posts FOR UPDATE TO authenticated USING (auth.uid() = employer_id) WITH CHECK (auth.uid() = employer_id);

DROP POLICY IF EXISTS "Employers can delete own job posts" ON job_posts;
CREATE POLICY "Employers can delete own job posts" ON job_posts FOR DELETE TO authenticated USING (employer_id = auth.uid());

-- applications
DROP POLICY IF EXISTS "Seekers can view own applications" ON applications;
CREATE POLICY "Seekers can view own applications" ON applications FOR SELECT TO authenticated USING (
  seeker_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM job_posts WHERE job_posts.id = applications.job_post_id AND job_posts.employer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Seekers can insert applications" ON applications;
CREATE POLICY "Seekers can insert applications" ON applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = seeker_id);

DROP POLICY IF EXISTS "Employers can update application status" ON applications;
CREATE POLICY "Employers can update application status" ON applications FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM job_posts WHERE job_posts.id = applications.job_post_id AND job_posts.employer_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM job_posts WHERE job_posts.id = applications.job_post_id AND job_posts.employer_id = auth.uid()
  )
);

-- resumes
DROP POLICY IF EXISTS "Seekers can view own resumes" ON resumes;
CREATE POLICY "Seekers can view own resumes" ON resumes FOR SELECT TO authenticated USING (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Employers can view accepted applicant resumes" ON resumes;
CREATE POLICY "Employers can view accepted applicant resumes" ON resumes FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM applications
    JOIN job_posts ON job_posts.id = applications.job_post_id
    WHERE applications.seeker_id = resumes.seeker_id AND applications.status = 'accepted' AND job_posts.employer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Seekers can insert own resumes" ON resumes;
CREATE POLICY "Seekers can insert own resumes" ON resumes FOR INSERT TO authenticated WITH CHECK (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Seekers can update own resumes" ON resumes;
CREATE POLICY "Seekers can update own resumes" ON resumes FOR UPDATE TO authenticated USING (seeker_id = auth.uid()) WITH CHECK (seeker_id = auth.uid());

DROP POLICY IF EXISTS "Seekers can delete own resumes" ON resumes;
CREATE POLICY "Seekers can delete own resumes" ON resumes FOR DELETE TO authenticated USING (seeker_id = auth.uid());

-- interviews
DROP POLICY IF EXISTS "Participants can view interviews" ON interviews;
CREATE POLICY "Participants can view interviews" ON interviews FOR SELECT TO authenticated USING (employer_id = auth.uid() OR seeker_id = auth.uid());

DROP POLICY IF EXISTS "Employers can create interviews" ON interviews;
CREATE POLICY "Employers can create interviews" ON interviews FOR INSERT TO authenticated WITH CHECK (
  employer_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM applications WHERE applications.id = interviews.application_id AND applications.seeker_id = interviews.seeker_id AND applications.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "Participants can update interviews" ON interviews;
CREATE POLICY "Participants can update interviews" ON interviews FOR UPDATE TO authenticated USING (employer_id = auth.uid() OR seeker_id = auth.uid()) WITH CHECK (employer_id = auth.uid() OR seeker_id = auth.uid());

-- chat_rooms
DROP POLICY IF EXISTS "Participants can view chat rooms" ON chat_rooms;
CREATE POLICY "Participants can view chat rooms" ON chat_rooms FOR SELECT TO authenticated USING (employer_id = auth.uid() OR seeker_id = auth.uid());

DROP POLICY IF EXISTS "Employers can create chat rooms" ON chat_rooms;
CREATE POLICY "Employers can create chat rooms" ON chat_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = employer_id);

-- messages
DROP POLICY IF EXISTS "Participants can view messages" ON messages;
CREATE POLICY "Participants can view messages" ON messages FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM chat_rooms WHERE chat_rooms.id = messages.chat_room_id AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Participants can send messages" ON messages;
CREATE POLICY "Participants can send messages" ON messages FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM chat_rooms WHERE chat_rooms.id = messages.chat_room_id AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
  )
);

-- reviews
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
CREATE POLICY "Anyone can view reviews" ON reviews FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Participants can insert reviews" ON reviews;
CREATE POLICY "Participants can insert reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = reviewer_id AND
  EXISTS (
    SELECT 1 FROM chat_rooms WHERE chat_rooms.id = reviews.application_id AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
  )
);

-- Realtime 설정
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;