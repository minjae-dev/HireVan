
/*
  # HireVan MVP Schema

  ## Overview
  Complete database schema for HireVan - a Vancouver Korean community job matching platform.

  ## New Tables

  1. `profiles`
     - Extends auth.users with public profile data
     - `id` - references auth.users
     - `role` - 'employer' or 'seeker'
     - `name` - display name
     - `bio` - short bio
     - `visa_type` - working holiday / student / other
     - `avatar_url` - profile photo URL

  2. `job_posts`
     - Job listings created by employers
     - `employer_id` - references profiles
     - `title`, `location`, `salary`, `work_hours`, `description`
     - `status` - 'open' or 'closed'

  3. `applications`
     - Job applications from seekers
     - `job_post_id` - references job_posts
     - `seeker_id` - references profiles
     - `status` - 'pending', 'accepted', or 'rejected'

  4. `chat_rooms`
     - 1:1 chat room between employer and seeker for a specific job
     - `job_post_id`, `employer_id`, `seeker_id`

  5. `messages`
     - Chat messages within a chat room
     - `chat_room_id`, `sender_id`, `content`

  6. `reviews`
     - Mutual reviews after interview completion
     - `chat_room_id`, `reviewer_id`, `reviewee_id`
     - `rating` (1-5), `comment`

  ## Security
  - RLS enabled on all tables
  - Policies enforce ownership and participant-based access
*/

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
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


-- job_posts
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

CREATE POLICY "Anyone can view open job posts"
  ON job_posts FOR SELECT
  TO authenticated
  USING (status = 'open' OR employer_id = auth.uid());

CREATE POLICY "Employers can insert job posts"
  ON job_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Employers can update own job posts"
  ON job_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = employer_id)
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Employers can delete own job posts"
  ON job_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = employer_id);


-- applications
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_post_id, seeker_id)
);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seekers can view own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (
    seeker_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM job_posts
      WHERE job_posts.id = applications.job_post_id
      AND job_posts.employer_id = auth.uid()
    )
  );

CREATE POLICY "Seekers can insert applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = seeker_id);

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


-- chat_rooms
CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id uuid NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seeker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interview_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_post_id, seeker_id)
);

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view chat rooms"
  ON chat_rooms FOR SELECT
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid());

CREATE POLICY "Employers can create chat rooms"
  ON chat_rooms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = employer_id);

CREATE POLICY "Participants can update chat rooms"
  ON chat_rooms FOR UPDATE
  TO authenticated
  USING (employer_id = auth.uid() OR seeker_id = auth.uid())
  WITH CHECK (employer_id = auth.uid() OR seeker_id = auth.uid());

CREATE POLICY "Employers can delete chat rooms"
  ON chat_rooms FOR DELETE
  TO authenticated
  USING (employer_id = auth.uid());


-- messages
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
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM chat_rooms
      WHERE chat_rooms.id = messages.chat_room_id
      AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
    )
  );

CREATE POLICY "Senders can delete own messages"
  ON messages FOR DELETE
  TO authenticated
  USING (sender_id = auth.uid());


-- reviews
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(chat_room_id, reviewer_id)
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
    auth.uid() = reviewer_id AND
    EXISTS (
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


-- Enable realtime for messages and chat_rooms
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;
