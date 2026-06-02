'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

type ChatRoomRow = {
  id: string
  job_post_id: string
  employer_id: string
  seeker_id: string
  interview_completed: boolean
  created_at: string
  job_posts: { title: string } | null
  employer: { name: string } | null
  seeker: { name: string } | null
  last_message?: string | null
  last_message_at?: string | null
  unread_count?: number
}

export default function ChatListPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [rooms, setRooms] = useState<ChatRoomRow[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    const fetchRooms = async () => {
      // 채팅방 기본 정보
      const { data: roomData } = await supabase
        .from('chat_rooms')
        .select(`
          *,
          job_posts(title),
          employer:profiles!chat_rooms_employer_id_fkey(name),
          seeker:profiles!chat_rooms_seeker_id_fkey(name)
        `)
        .or(`employer_id.eq.${user.id},seeker_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (!roomData) { setFetching(false); return }

      // 각 채팅방의 마지막 메시지 병렬 조회
      const enriched = await Promise.all(
        (roomData as unknown as ChatRoomRow[]).map(async room => {
          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('chat_room_id', room.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          return {
            ...room,
            last_message: lastMsg?.content ?? null,
            last_message_at: lastMsg?.created_at ?? null,
          }
        })
      )

      // 마지막 메시지 시간 기준 재정렬
      enriched.sort((a, b) => {
        const aTime = a.last_message_at ?? a.created_at
        const bTime = b.last_message_at ?? b.created_at
        return new Date(bTime).getTime() - new Date(aTime).getTime()
      })

      setRooms(enriched)
      setFetching(false)
    }

    fetchRooms()
  }, [user])

  if (loading || fetching) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between mb-1">
          <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-gray-100 flex-shrink-0" />
              <div className="flex-1">
                <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">채팅 목록</h1>
        {rooms.length > 0 && (
          <span className="text-xs text-gray-400">{rooms.length}개</span>
        )}
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-sm">아직 채팅방이 없습니다</p>
          {profile?.role === 'seeker' && (
            <Link
              href="/jobs"
              className="inline-block mt-4 text-sm text-orange-500 font-medium hover:underline"
            >
              구인글 둘러보기 →
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rooms.map(room => {
            const isEmployer = room.employer_id === user?.id
            const otherName = isEmployer ? room.seeker?.name : room.employer?.name
            const initial = otherName?.[0] ?? '?'

            return (
              <Link key={room.id} href={`/chat/${room.id}`}>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-orange-200 transition-all active:scale-[0.99]">
                  <div className="flex items-center gap-3">
                    {/* 아바타 */}
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: 'var(--brand)' }}
                    >
                      {initial}
                    </div>

                    {/* 이름 + 마지막 메시지 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {otherName ?? '상대방'}
                        </p>
                        {room.last_message_at && (
                          <p className="text-xs text-gray-300 flex-shrink-0">
                            {formatTime(room.last_message_at)}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">
                        {room.last_message ?? room.job_posts?.title ?? ''}
                      </p>
                    </div>

                    {/* 면접완료 뱃지 */}
                    {room.interview_completed && (
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex-shrink-0">
                        면접완료
                      </span>
                    )}
                  </div>

                  {/* 공고 제목 */}
                  {room.job_posts?.title && (
                    <p className="text-xs text-gray-300 mt-2 ml-14 truncate">
                      📋 {room.job_posts.title}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 시간 포맷 ─────────────────────────────────────────────
function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return '방금'
  if (diffMins < 60) return `${diffMins}분 전`
  if (diffHours < 24) return `${diffHours}시간 전`
  if (diffDays < 7) return `${diffDays}일 전`
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}
