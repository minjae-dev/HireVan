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
      const { data } = await supabase
        .from('chat_rooms')
        .select(`
          *,
          job_posts(title),
          employer:profiles!chat_rooms_employer_id_fkey(name),
          seeker:profiles!chat_rooms_seeker_id_fkey(name)
        `)
        .or(`employer_id.eq.${user.id},seeker_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
      setRooms((data as unknown as ChatRoomRow[]) ?? [])
      setFetching(false)
    }
    fetchRooms()
  }, [user])

  if (loading || fetching) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">채팅 목록</h1>

      {rooms.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-sm">아직 채팅방이 없습니다</p>
          {profile?.role === 'seeker' && (
            <Link href="/jobs" className="inline-block mt-4 text-sm text-orange-500 font-medium hover:underline">
              구인글 둘러보기 →
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rooms.map(room => {
            const isEmployer = room.employer_id === user?.id
            const otherName = isEmployer ? room.seeker?.name : room.employer?.name
            return (
              <Link key={room.id} href={`/chat/${room.id}`}>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 transition-all active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: 'var(--brand)' }}
                      >
                        {otherName ? otherName[0] : '?'}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{otherName ?? '상대방'}</p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{room.job_posts?.title}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {room.interview_completed && (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          면접완료
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
