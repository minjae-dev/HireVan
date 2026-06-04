/*
  # HireVan Complete Database Schema + Seed Data

  ## Overview
  Single file that creates the entire HireVan database from scratch
  and populates it with test users and sample data.

  ## Tables
  1. `profiles` - User profiles linked to auth.users (employer/seeker)
  2. `job_posts` - Job listings created by employers
  3. `applications` - Job applications submitted by seekers
  4. `chat_rooms` - Chat rooms between employer and seeker for a job post
  5. `messages` - Messages within chat rooms
  6. `reviews` - Reviews left after interview completion

  ## Security
  - RLS enabled on all tables
  - Role-based access control (employer/seeker)
  - Participants-only access for chat_rooms and messages
  - Public read access for job_posts (open), profiles, and reviews

  ## Test Accounts
  - employer@test.com / test12345 (업체)
  - seeker@test.com / test12345 (구직자)

  ## Important Notes
  1. Run this on a FRESH database (drop existing tables first)
  2. All tables use UUID primary keys via gen_random_uuid()
  3. profiles.id is also a foreign key to auth.users.id
  4. auth.users are inserted with fixed UUIDs for reproducibility
*/

-- ============================================================
-- 1. PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('employer', 'seeker')),
  name text NOT NULL DEFAULT '',
  bio text DEFAULT '',
  visa_type text DEFAULT '',
  avatar_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- ============================================================
-- 2. JOB_POSTS
-- ============================================================

CREATE TABLE IF NOT EXISTS job_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  salary text DEFAULT '',
  work_hours text DEFAULT '',
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view open or own job posts"
  ON job_posts FOR SELECT
  TO authenticated
  USING (status = 'open' OR employer_id = auth.uid());

CREATE POLICY "Employers can insert job posts"
  ON job_posts FOR INSERT
  TO authenticated
  WITH CHECK (employer_id = auth.uid());

CREATE POLICY "Employers can update own job posts"
  ON job_posts FOR UPDATE
  TO authenticated
  USING (employer_id = auth.uid())
  WITH CHECK (employer_id = auth.uid());

CREATE POLICY "Employers can delete own job posts"
  ON job_posts FOR DELETE
  TO authenticated
  USING (employer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_job_posts_employer_id ON job_posts(employer_id);
CREATE INDEX IF NOT EXISTS idx_job_posts_status ON job_posts(status);

-- ============================================================
-- 3. APPLICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (job_post_id, seeker_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seekers and employers can view relevant applications"
  ON applications FOR SELECT
  TO authenticated
  USING (
    seeker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM job_posts
      WHERE job_posts.id = applications.job_post_id
      AND job_posts.employer_id = auth.uid()
    )
  );

CREATE POLICY "Seekers can insert applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (seeker_id = auth.uid());

CREATE POLICY "Employers can update application status"
  ON applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM job_posts
      WHERE job_posts.id = applications.job_post_id
      AND job_posts.employer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM job_posts
      WHERE job_posts.id = applications.job_post_id
      AND job_posts.employer_id = auth.uid()
    )
  );

CREATE POLICY "Seekers can delete own applications"
  ON applications FOR DELETE
  TO authenticated
  USING (seeker_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_applications_seeker_id ON applications(seeker_id);
CREATE INDEX IF NOT EXISTS idx_applications_job_post_id ON applications(job_post_id);

-- ============================================================
-- 4. CHAT_ROOMS
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interview_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (job_post_id, seeker_id)
);

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view chat rooms"
  ON chat_rooms FOR SELECT
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid());

CREATE POLICY "Employers can create chat rooms"
  ON chat_rooms FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = employer_id
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'employer'
    )
  );

CREATE POLICY "Participants can update chat rooms"
  ON chat_rooms FOR UPDATE
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid())
  WITH CHECK (employer_id = auth.uid() OR seeker_id = auth.uid());

CREATE POLICY "Employers can delete chat rooms"
  ON chat_rooms FOR DELETE
  TO authenticated
  USING (employer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_chat_rooms_employer_id ON chat_rooms(employer_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_seeker_id ON chat_rooms(seeker_id);

-- ============================================================
-- 5. MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = messages.chat_room_id
      AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
    )
  );

CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = messages.chat_room_id
      AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
    )
  );

CREATE POLICY "Senders can delete own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_messages_chat_room_id ON messages(chat_room_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- ============================================================
-- 6. REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (chat_room_id, reviewer_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Participants can insert reviews"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = reviews.chat_room_id
      AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
      AND chat_rooms.interview_completed = true
    )
  );

CREATE POLICY "Reviewers can update own reviews"
  ON reviews FOR UPDATE
  TO authenticated
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_chat_room_id ON reviews(chat_room_id);


-- ============================================================
-- ============================================================
-- SEED DATA
-- ============================================================
-- ============================================================

-- ============================================================
-- S1. AUTH USERS (test accounts)
-- ============================================================
-- Password for both: test12345
-- We insert directly into auth.users with bcrypt hashes.
-- The $2a$06$ hashes below correspond to "test12345".

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_token, email_change,
  email_change_token_new, recovery_token, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'employer@test.com',
    '$2a$06$ehBCUOXTcioKwu.WJ6.O0.9oBEBlTxUhLj6HVS3SOF8SY0LSippem',
    now(), '', '', '', '', now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"sub":"e1000000-0000-0000-0000-000000000001","email":"employer@test.com","email_verified":true,"phone_verified":false}'
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'seeker@test.com',
    '$2a$06$8h2SXrRKBXLzPUwkPjGVe.koynV5KkVD3mO12Vjmx6CDayiLEcEFm',
    now(), '', '', '', '', now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"sub":"e2000000-0000-0000-0000-000000000002","email":"seeker@test.com","email_verified":true,"phone_verified":false}'
  )
ON CONFLICT (id) DO NOTHING;

-- Also add identities for the users
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, last_sign_in_at,
  created_at, updated_at, identity_data
) VALUES
  (
    'e1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'employer@test.com',
    'email',
    now(), now(), now(),
    '{"sub":"e1000000-0000-0000-0000-000000000001","email":"employer@test.com","email_verified":true,"phone_verified":false}'
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    'e2000000-0000-0000-0000-000000000002',
    'seeker@test.com',
    'email',
    now(), now(), now(),
    '{"sub":"e2000000-0000-0000-0000-000000000002","email":"seeker@test.com","email_verified":true,"phone_verified":false}'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- S2. PROFILES
-- ============================================================

INSERT INTO profiles (id, role, name, bio, visa_type) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'employer', '테스트 카페', '다운타운에 위치한 한식 카페입니다. 정직하게 일하실 분 환영!', ''),
  ('e2000000-0000-0000-0000-000000000002', 'seeker', '김구직', '열심히 일할 준비가 되어있는 구직자입니다.', '워킹홀리데이')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- S3. JOB_POSTS (sample jobs by employer)
-- ============================================================

INSERT INTO job_posts (id, employer_id, title, location, salary, work_hours, description, status) VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    '카페 서빙 아르바이트',
    '서울 강남구',
    '시급 12,000원',
    '평일 10:00-15:00',
    '강남역 근처 카페에서 서빙 아르바이트생을 모집합니다. 친절하신 분 환영!',
    'open'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    '주방 보조 구인',
    '서울 마포구',
    '시급 15,000원',
    '주 5일 09:00-18:00',
    '한식당 주방 보조를 찾습니다. 기본적인 식재료 손질 가능하신 분 우대.',
    'open'
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    'e1000000-0000-0000-0000-000000000001',
    '편의점 야간 근무',
    '서울 동대문구',
    '시급 11,000원',
    '야간 22:00-06:00',
    '24시간 편의점에서 야간 근무자를 모집합니다. 책임감 있으신 분 환영!',
    'open'
  ),
  (
    'a1000000-0000-0000-0000-000000000004',
    'e1000000-0000-0000-0000-000000000001',
    '사무실 청소 아르바이트',
    '서울 송파구',
    '시급 10,000원',
    '평일 07:00-09:00',
    '오피스텔 청소 아르바이트 모집. 깔끔하게 청소하실 분!',
    'closed'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- S4. APPLICATIONS (seeker applied to jobs)
-- ============================================================

INSERT INTO applications (id, job_post_id, seeker_id, status) VALUES
  (
    'b1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    'accepted'
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000002',
    'e2000000-0000-0000-0000-000000000002',
    'pending'
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000003',
    'e2000000-0000-0000-0000-000000000002',
    'pending'
  ),
  (
    'b1000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-000000000004',
    'e2000000-0000-0000-0000-000000000002',
    'rejected'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- S5. CHAT_ROOMS (created when application accepted)
-- ============================================================

INSERT INTO chat_rooms (id, job_post_id, employer_id, seeker_id, interview_completed) VALUES
  (
    'c1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    true
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- S6. MESSAGES (sample conversation)
-- ============================================================

INSERT INTO messages (id, chat_room_id, sender_id, content) VALUES
  (
    'd1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    '안녕하세요! 카페 서빙 아르바이트에 관심 가져주셔서 감사합니다. 내일 오전 10시에 매장에서 면접 가능하실까요?'
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    '네! 내일 10시에 방문하겠습니다. 감사합니다!'
  ),
  (
    'd1000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    '네, 강남역 3번 출구에서 5분 거리입니다. "테스트 카페" 간판 보이시면 들어오시면 됩니다!'
  ),
  (
    'd1000000-0000-0000-0000-000000000004',
    'c1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    '잘 찾아가겠습니다. 뵙겠습니다!'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- S7. REVIEWS (after interview completed)
-- ============================================================

INSERT INTO reviews (id, chat_room_id, reviewer_id, reviewee_id, rating, comment) VALUES
  (
    'f1000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    5,
    '친절하게 면접 봐주셔서 감사합니다. 근무 환경도 좋아 보였어요!'
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002',
    4,
    '면접 때 인상이 좋았습니다. 성실해 보이는 구직자네요.'
  )
ON CONFLICT (id) DO NOTHING;
