/*
  # Complete RLS Policy Rebuild

  Rebuilds all RLS policies to ensure they work correctly with authenticated users.
  The issue was that INSERT policies were checking employer_id/seeker_id in WITH CHECK,
  but these need to match the current user.
*/

-- Disable RLS temporarily to rebuild policies
ALTER TABLE job_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE job_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies on job_posts
DROP POLICY IF EXISTS "Anyone can view open job posts" ON job_posts;
DROP POLICY IF EXISTS "Employers can insert job posts" ON job_posts;
DROP POLICY IF EXISTS "Employers can update own job posts" ON job_posts;
DROP POLICY IF EXISTS "Employers can delete own job posts" ON job_posts;

-- Drop all existing policies on applications
DROP POLICY IF EXISTS "Seekers can view own applications" ON applications;
DROP POLICY IF EXISTS "Seekers can insert applications" ON applications;
DROP POLICY IF EXISTS "Employers can update application status" ON applications;
DROP POLICY IF EXISTS "Seekers can delete own applications" ON applications;

-- Recreate job_posts policies
CREATE POLICY "Anyone can view open job posts"
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

-- Recreate applications policies
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
