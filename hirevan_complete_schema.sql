/*
  # HireVan Complete Database Schema

  ## Overview
  Single migration file that creates the entire HireVan database from scratch.
  Includes all tables, constraints, indexes, and RLS policies.

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

  ## Important Notes
  1. Run this migration on a fresh database (no existing tables)
  2. All tables use UUID primary keys via gen_random_uuid()
  3. profiles.id is also a foreign key to auth.users.id
  4. Duplicate RLS policies are avoided (one policy per operation per table)
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

-- Index for filtering by employer
CREATE INDEX IF NOT EXISTS idx_job_posts_employer_id ON job_posts(employer_id);

-- Index for filtering by status
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

-- Index for filtering by seeker
CREATE INDEX IF NOT EXISTS idx_applications_seeker_id ON applications(seeker_id);

-- Index for filtering by job post
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

-- Index for filtering by employer
CREATE INDEX IF NOT EXISTS idx_chat_rooms_employer_id ON chat_rooms(employer_id);

-- Index for filtering by seeker
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

-- Index for messages by chat room
CREATE INDEX IF NOT EXISTS idx_messages_chat_room_id ON messages(chat_room_id);

-- Index for messages by sender
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

-- Index for messages by created_at (for ordering)
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

-- Index for reviews by reviewee (to look up someone's ratings)
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_id ON reviews(reviewee_id);

-- Index for reviews by chat room
CREATE INDEX IF NOT EXISTS idx_reviews_chat_room_id ON reviews(chat_room_id);
