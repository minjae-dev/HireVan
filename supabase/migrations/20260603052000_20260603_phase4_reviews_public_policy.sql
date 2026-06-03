-- Phase 4 후기 시스템 보강: 공개 조회 정책과 중복 작성 방지 보장
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(chat_room_id, reviewer_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view reviews" ON public.reviews;
DROP POLICY IF EXISTS "누구나 후기 조회 가능" ON public.reviews;
DROP POLICY IF EXISTS "로그인한 유저만 후기 작성 가능" ON public.reviews;

CREATE POLICY "누구나 후기 조회 가능"
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "로그인한 유저만 후기 작성 가능"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM public.chat_rooms
      WHERE chat_rooms.id = reviews.chat_room_id
      AND (chat_rooms.employer_id = auth.uid() OR chat_rooms.seeker_id = auth.uid())
      AND chat_rooms.interview_completed = true
    )
  );
