'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

type Review = {
  id: string
  rating: number
  comment: string
  created_at: string
  reviewer: { name: string; role: string } | null
  reviewee: { name: string; role: string } | null
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMyReviews = async () => {
      // 1. 현재 로그인한 유저 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setLoading(false)
        return
      }

      // 2. 내 ID(user.id)를 조건으로 리뷰 필터링
      const { data } = await supabase
        .from('reviews')
        .select(`
          id, rating, comment, created_at,
          reviewer:profiles!reviews_reviewer_id_fkey(name, role),
          reviewee:profiles!reviews_reviewee_id_fkey(name, role)
        `)
        .eq('reviewee_id', user.id) // 내 ID와 일치하는 리뷰만 조회
        .order('created_at', { ascending: false })
        
      setReviews((data as unknown as Review[]) ?? [])
      setLoading(false)
    }
    fetchMyReviews()
  }, [])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">후기 목록</h1>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">⭐</p>
          <p className="text-sm">아직 후기가 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map(review => (
            <div key={review.id} className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900 text-sm">
                      {review.reviewer?.name ?? '익명'}
                    </span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className="text-sm text-gray-600">{review.reviewee?.name ?? '익명'}</span>
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <span
                        key={star}
                        className={`text-base ${star <= review.rating ? 'text-orange-400' : 'text-gray-200'}`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-gray-300 flex-shrink-0">
                  {new Date(review.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              {review.comment && (
                <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
