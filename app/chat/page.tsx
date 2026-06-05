'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

type MessagePreview = { content: string; created_at: string }

type ChatRoomRow = {
  id: string
  job_post_id: string
  employer_id: string
  seeker_id: string
  interview_completed: boolean
  created_at: string
  job_posts: {
    title: string
    location: string
    status: 'open' | 'closed'
  } | null
  employer: { name: string } | null
  seeker: { name: string } | null
  messages?: MessagePreview[] | null
}

type GroupedRooms = {
  job_post_id: string
  job_post: ChatRoomRow['job_posts']
  rooms: ChatRoomRow[]
  lastMessageAt: string
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / (1000 * 60))
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffHour < 24) return `${diffHour}시간 전`
  if (diffDay < 7) return `${diffDay}일 전`
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function ChatListPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [rooms, setRooms] = useState<ChatRoomRow[]>([])
  const [fetching, setFetching] = useState(true)
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

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
          job_posts(title, location, status),
          employer:profiles!chat_rooms_employer_id_fkey(name),
          seeker:profiles!chat_rooms_seeker_id_fkey(name),
          messages(content, created_at)
        `)
        .or(`employer_id.eq.${user.id},seeker_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      const roomsWithMessages = ((data ?? []) as unknown as ChatRoomRow[]).map(room => ({
        ...room,
        messages: (room.messages as MessagePreview[] | null)
          ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          ?.slice(0, 1) ?? null,
      }))

      setRooms(roomsWithMessages)
      // 첫 로드 시 모든 공고 그룹을 펼쳐서 보여줌
      setExpandedJobs(new Set(roomsWithMessages.map(r => r.job_post_id)))
      setFetching(false)
    }
    fetchRooms()
  }, [user])

  // Realtime 구독: 새 채팅방 추가 시
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('chat_rooms:all')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_rooms',
          filter: `or(employer_id.eq.${user.id},seeker_id.eq.${user.id})`,
        },
        async payload => {
          const newRoom = payload.new as ChatRoomRow
          const { data } = await supabase
            .from('chat_rooms')
            .select(`
              *,
              job_posts(title, location, status),
              employer:profiles!chat_rooms_employer_id_fkey(name),
              seeker:profiles!chat_rooms_seeker_id_fkey(name)
            `)
            .eq('id', newRoom.id)
            .single()

          if (data) {
            setRooms(prev => [data as unknown as ChatRoomRow, ...prev])
            // 새 공고면 자동 펼침
            setExpandedJobs(prev => new Set(prev).add((data as unknown as ChatRoomRow).job_post_id))
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // 공고별로 그룹화 + 정렬 (최근 활동 순)
  const groupedRooms = useMemo<GroupedRooms[]>(() => {
    const map = new Map<string, GroupedRooms>()
    for (const room of rooms) {
      const existing = map.get(room.job_post_id)
      const roomLastTime = room.messages?.[0]?.created_at ?? room.created_at
      if (existing) {
        existing.rooms.push(room)
        if (new Date(roomLastTime).getTime() > new Date(existing.lastMessageAt).getTime()) {
          existing.lastMessageAt = roomLastTime
        }
      } else {
        map.set(room.job_post_id, {
          job_post_id: room.job_post_id,
          job_post: room.job_posts,
          rooms: [room],
          lastMessageAt: roomLastTime,
        })
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    )
  }, [rooms])

  const toggleJob = (jobPostId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobPostId)) {
        next.delete(jobPostId)
      } else {
        next.add(jobPostId)
      }
      return next
    })
  }

  if (loading || fetching) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isEmployer = profile?.role === 'employer'

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">채팅</h1>
      <p className="text-sm text-gray-500 mb-5">
        {isEmployer
          ? '내 공고별로 진행 중인 대화를 관리하세요'
          : '지원한 공고별로 진행 중인 대화를 확인하세요'}
      </p>

      {groupedRooms.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-sm">아직 진행 중인 채팅이 없습니다</p>
          {isEmployer ? (
            <Link
              href="/employer/jobs"
              className="inline-block mt-4 text-sm text-orange-500 font-medium hover:underline"
            >
              내 구인글 관리 →
            </Link>
          ) : (
            <Link
              href="/jobs"
              className="inline-block mt-4 text-sm text-orange-500 font-medium hover:underline"
            >
              구인글 둘러보기 →
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groupedRooms.map(group => {
            const isExpanded = expandedJobs.has(group.job_post_id)
            const isJobOpen = group.job_post?.status === 'open'
            return (
              <div
                key={group.job_post_id}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              >
                {/* 공고 헤더 (아코디언 토글) */}
                <button
                  type="button"
                  onClick={() => toggleJob(group.job_post_id)}
                  className="w-full px-4 py-4 flex items-center gap-3 text-left hover:bg-gray-50 transition-all active:scale-[0.99]"
                  aria-expanded={isExpanded}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: 'var(--brand-light)' }}
                  >
                    📋
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {group.job_post?.title ?? '공고'}
                      </p>
                      {group.job_post && (
                        <span
                          className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            isJobOpen
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {isJobOpen ? '모집중' : '마감'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {group.rooms.length}명 · 최근 활동 {formatRelativeTime(group.lastMessageAt)}
                    </p>
                  </div>
                  <span
                    className={`text-gray-400 text-xs transition-transform flex-shrink-0 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {/* 공고에 속한 채팅방들 */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50/50">
                    {group.rooms.map((room, idx) => {
                      const roomIsEmployer = room.employer_id === user?.id
                      const otherName = roomIsEmployer
                        ? room.seeker?.name
                        : room.employer?.name
                      const lastMessage = room.messages?.[0]?.content
                      return (
                        <Link
                          key={room.id}
                          href={`/chat/${room.id}`}
                          className={`block px-4 py-3 hover:bg-white transition-all ${
                            idx > 0 ? 'border-t border-gray-100' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: 'var(--brand)' }}
                            >
                              {otherName ? otherName[0] : '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm">
                                {otherName ?? '상대방'}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                {lastMessage ?? '아직 메시지가 없습니다'}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {room.interview_completed && (
                                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                  면접완료
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
