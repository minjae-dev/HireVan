-- Add category and deadline columns to job_posts
ALTER TABLE job_posts
  ADD COLUMN IF NOT EXISTS category text DEFAULT '' CHECK (
    category IN ('카페', '식당', '네일숍', '편의점', '기타', '')
  ),
  ADD COLUMN IF NOT EXISTS deadline date;
