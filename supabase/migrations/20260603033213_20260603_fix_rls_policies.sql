/*
  # Fix RLS Policies for job_posts and applications

  ## Issues Fixed
  1. job_posts INSERT policy - employer_id 필드 자동 설정 불가
  2. applications INSERT policy - seeker_id 필드 자동 설정 불가

  ## Changes
  - job_posts INSERT: employer_id가 현재 사용자와 일치하도록 수정
  - applications INSERT: seeker_id가 현재 사용자와 일치하도록 수정
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Employers can insert job posts" ON job_posts;
DROP POLICY IF EXISTS "Seekers can insert applications" ON applications;

-- Create fixed job_posts INSERT policy
CREATE POLICY "Employers can insert job posts"
  ON job_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = employer_id AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'employer'
    )
  );

-- Create fixed applications INSERT policy
CREATE POLICY "Seekers can insert applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = seeker_id AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'seeker'
    )
  );
