import { supabase } from '@/lib/supabase'

/**
 * lib/reviews.ts
 *
 * reviews 테이블 + 후기 별점·평균 계산 로직.
 */

export interface ReviewRow {
  id: string
  rating: number
  comment: string
  created_at: string
  reviewer: { name: string; role: 'employer' | 'seeker' } | null
  reviewee?: { name: string; role: string } | null
}

export interface ReceivedReview {
  id: string
  rating: number
  comment: string
  created_at: string
  reviewer: { name: string; role: 'employer' | 'seeker' } | null
}

/** 특정 사용자가 받은 후기 목록. */
export async function fetchReceivedReviews(userId: string): Promise<ReceivedReview[]> {
  if (!userId) return []
  const { data, error } = await supabase
    .from('reviews')
    .select(
      'id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(name, role)',
    )
    .eq('reviewee_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as ReceivedReview[]) ?? []
}

/** 모든 후기 (공개 페이지용). */
export async function fetchAllReviews(): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviews_reviewer_id_fkey(name, role),
      reviewee:profiles!reviews_reviewee_id_fkey(name, role)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as ReviewRow[]) ?? []
}

/**
 * 매너온도 = 36.5 + (avgRating - 3) * 8, [18, 99] 클램프.
 * 후기가 없으면 기본 36.5.
 */
export function computeMannerTemperature(reviews: { rating: number }[]): string {
  if (reviews.length === 0) return '36.5'
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
  const avg = sum / reviews.length
  const temp = Math.min(99, Math.max(18, 36.5 + (avg - 3) * 8))
  return temp.toFixed(1)
}

/** 평균 별점을 1자리 소수점 문자열로. */
export function computeAverageRating(reviews: { rating: number }[]): string {
  if (reviews.length === 0) return '0.0'
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
  return (sum / reviews.length).toFixed(1)
}

export interface CreateReviewInput {
  chatRoomId: string
  reviewerId: string
  revieweeId: string
  rating: number
  comment: string
}

/** 후기 INSERT. */
export async function createReview(input: CreateReviewInput): Promise<void> {
  const { error } = await supabase
    .from('reviews')
     
    .insert({
      chat_room_id: input.chatRoomId,
      reviewer_id: input.reviewerId,
      reviewee_id: input.revieweeId,
      rating: input.rating,
      comment: input.comment,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  if (error) throw error
}

/** 현재 사용자가 특정 채팅방에 후기를 이미 남겼는지 확인. */
export async function checkAlreadyReviewed(
  chatRoomId: string,
  reviewerId: string,
): Promise<boolean> {
  if (!chatRoomId || !reviewerId) return false
  const { data, error } = await supabase
    .from('reviews')
    .select('id')
    .eq('chat_room_id', chatRoomId)
    .eq('reviewer_id', reviewerId)
    .maybeSingle()
  if (error) throw error
  return !!data
}