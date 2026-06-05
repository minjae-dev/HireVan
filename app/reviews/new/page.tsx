'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Suspense } from 'react'

function NewReviewForm() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams.get('room')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [revieweeId, setRevieweeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!roomId || !user) return
    const fetchRoom = async () => {
      const { data } = await supabase
        .from('chat_rooms')
        .select('employer_id, seeker_id')
        .eq('id', roomId)
        .maybeSingle()
      if (data) {
        const room = data as unknown as { employer_id: string; seeker_id: string }
        setRevieweeId(room.employer_id === user.id ? room.seeker_id : room.employer_id)
      }
    }
    fetchRoom()
  }, [roomId, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !roomId || !revieweeId || rating === 0) return
    setLoading(true)
    setError('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('reviews').insert({
      chat_room_id: roomId,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating,
      comment,
    })

    if (error) {
      setError('후기 작성에 실패했습니다.')
      setLoading(false)
      return
    }

    router.push('/reviews')
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center">
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">후기 작성</h1>
        <p className="text-sm text-gray-500 mb-6">솔직한 후기는 커뮤니티 신뢰를 높입니다</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              별점 <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="text-3xl transition-transform hover:scale-110 active:scale-95"
                >
                  {star <= rating ? '★' : '☆'}
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-sm text-gray-500 mt-2">
                {['', '별로였어요', '아쉬웠어요', '보통이에요', '좋았어요', '최고였어요'][rating]}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              한줄평
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={4}
              placeholder="경험을 자유롭게 작성해주세요"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || rating === 0}
            className="w-full text-white font-semibold py-3 rounded-xl transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {loading ? '제출 중...' : '후기 제출하기'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function NewReviewPage() {
  return (
    <Suspense>
      <NewReviewForm />
    </Suspense>
  )
}
