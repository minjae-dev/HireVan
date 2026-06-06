'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Message = Database['public']['Tables']['messages']['Row'] & {
  profiles: { name: string } | null
}

type ChatRoom = {
  id: string
  job_post_id: string
  employer_id: string
  seeker_id: string
  interview_completed: boolean
  job_posts: { title: string } | null
  employer: { name: string } | null
  seeker: { name: string } | null
}

type InterviewProposal = {
  date: string
  time: string
  location: string
  status: 'pending' | 'confirmed' | 'declined' | 'no_show'
}

const RATING_LABELS = ['', '아쉬웠어요', '조금 아쉬웠어요', '보통이에요', '좋았어요', '최고였어요']

const INTERVIEW_PREFIX = '[INTERVIEW_PROPOSAL]'
const INTERVIEW_STATUSES = new Set<InterviewProposal['status']>([
  'pending',
  'confirmed',
  'declined',
  'no_show',
])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseProposal(content: string): InterviewProposal | null {
  if (!content.startsWith(INTERVIEW_PREFIX)) return null

  try {
    const parsed: unknown = JSON.parse(content.slice(INTERVIEW_PREFIX.length))

    if (!isPlainRecord(parsed)) return null

    const { date, time, location, status } = parsed

    if (
      typeof date !== 'string' ||
      typeof time !== 'string' ||
      typeof location !== 'string' ||
      typeof status !== 'string' ||
      !INTERVIEW_STATUSES.has(status as InterviewProposal['status'])
    ) {
      return null
    }

    return {
      date,
      time,
      location,
      status: status as InterviewProposal['status'],
    }
  } catch {
    return null
  }
}

export default function ChatRoomPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()

  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [completingInterview, setCompletingInterview] = useState(false)
  const [hasReview, setHasReview] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Interview scheduling state ──
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [scheduleLocation, setScheduleLocation] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // 채팅방 로드
  const fetchRoom = useCallback(async () => {
    const { data } = await supabase
      .from('chat_rooms')
      .select(`
        *,
        job_posts(title),
        employer:profiles!chat_rooms_employer_id_fkey(name),
        seeker:profiles!chat_rooms_seeker_id_fkey(name)
      `)
      .eq('id', id)
      .maybeSingle()

    if (!data) {
      router.push('/chat')
      return
    }

    const roomData = data as unknown as ChatRoom

    // 권한 검증: 채팅방의 업체 또는 구직자만 접근 가능
    if (user && roomData.employer_id !== user.id && roomData.seeker_id !== user.id) {
      router.push('/chat')
      return
    }

    setRoom(roomData)
  }, [id, router, user])

  // 메시지 로드
  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(name)')
      .eq('chat_room_id', id)
      .order('created_at', { ascending: true })
    setMessages((data as unknown as Message[]) ?? [])
  }, [id])

  const fetchReviewStatus = useCallback(async () => {
    if (!user || !room?.interview_completed) {
      setHasReview(false)
      return
    }

    const { data } = await supabase
      .from('reviews')
      .select('id')
      .eq('chat_room_id', id)
      .eq('reviewer_id', user.id)
      .maybeSingle()

    setHasReview(!!data)
  }, [id, room?.interview_completed, user])

  useEffect(() => {
    fetchRoom()
    fetchMessages()
  }, [fetchRoom, fetchMessages])

  // 후기 작성 여부 확인
  useEffect(() => {
    fetchReviewStatus()
  }, [fetchReviewStatus])

  // 스크롤 아래로
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 실시간 구독
  useEffect(() => {
    const channel = supabase
      .channel(`room:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_room_id=eq.${id}`,
        },
        async payload => {
          const { data } = await supabase
            .from('messages')
            .select('*, profiles(name)')
            .eq('id', payload.new.id)
            .maybeSingle()
          if (data) setMessages(prev => [...prev, data as unknown as Message])
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_room_id=eq.${id}`,
        },
        async payload => {
          const { data } = await supabase
            .from('messages')
            .select('*, profiles(name)')
            .eq('id', payload.new.id)
            .maybeSingle()
          if (data) {
            const msg = data as unknown as Message
            setMessages(prev => prev.map(m => (m.id === msg.id ? msg : m)))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_rooms',
          filter: `id=eq.${id}`,
        },
        payload => {
          setRoom(prev => prev ? { ...prev, interview_completed: Boolean(payload.new.interview_completed) } : prev)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  // 메시지 전송
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !user) return
    setSending(true)
    const content = input.trim()
    setInput('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').insert({
      chat_room_id: id as string,
      sender_id: user.id,
      content,
    })
    setSending(false)
    inputRef.current?.focus()
  }

  // 면접 완료
  const handleCompleteInterview = async () => {
    if (!room || !user || room.employer_id !== user.id) return
    setCompletingInterview(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('chat_rooms')
      .update({ interview_completed: true })
      .eq('id', id)

    if (!error) {
      setRoom({ ...room, interview_completed: true })
      setShowReviewModal(true)
    }
    setCompletingInterview(false)
  }

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room || !user || hasReview) return

    const revieweeId = room.employer_id === user.id ? room.seeker_id : room.employer_id
    setSubmittingReview(true)
    setReviewError('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('reviews').insert({
      chat_room_id: id as string,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating,
      comment: comment.trim(),
    })

    if (error) {
      setReviewError('후기 등록에 실패했습니다. 잠시 후 다시 시도해주세요.')
      setSubmittingReview(false)
      return
    }

    setHasReview(true)
    setShowReviewModal(false)
    setComment('')
    setRating(5)
    setSubmittingReview(false)
  }

  // ── Interview scheduling handlers ──
  const handleProposeInterview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !scheduleDate || !scheduleTime || !scheduleLocation.trim()) return
    setScheduling(true)

    const proposal: InterviewProposal = {
      date: scheduleDate,
      time: scheduleTime,
      location: scheduleLocation.trim(),
      status: 'pending',
    }

    const content = `${INTERVIEW_PREFIX}${JSON.stringify(proposal)}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').insert({
      chat_room_id: id as string,
      sender_id: user.id,
      content,
    })

    setScheduleDate('')
    setScheduleTime('')
    setScheduleLocation('')
    setScheduling(false)
    setShowScheduleModal(false)
  }

  const handleConfirmInterview = async (msg: Message) => {
    const proposal = parseProposal(msg.content)
    if (!proposal) return
    proposal.status = 'confirmed'
    const newContent = `${INTERVIEW_PREFIX}${JSON.stringify(proposal)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').update({ content: newContent }).eq('id', msg.id)

    // Drop system message
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('messages').insert({
        chat_room_id: id as string,
        sender_id: user.id,
        content: 'System: 면접 일정이 확정되었습니다!',
      })
    }
  }

  const handleDeclineInterview = async (msg: Message) => {
    const proposal = parseProposal(msg.content)
    if (!proposal) return
    proposal.status = 'declined'
    const newContent = `${INTERVIEW_PREFIX}${JSON.stringify(proposal)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').update({ content: newContent }).eq('id', msg.id)
  }

  // ── No-show reporting ──
  const [showNoShowConfirm, setShowNoShowConfirm] = useState<string | null>(null) // msg id

  function isInterviewExpired(proposal: InterviewProposal): boolean {
    if (proposal.status !== 'confirmed') return false
    // Combine date + time into a UTC timestamp and check if > 1 hour ago
    const dt = new Date(`${proposal.date}T${proposal.time}:00`)
    const now = new Date()
    return now.getTime() - dt.getTime() > 60 * 60 * 1000
  }

  const handleReportNoShow = async (msg: Message) => {
    if (!user || !room) return
    const proposal = parseProposal(msg.content)
    if (!proposal) return

    // Update message status to no_show
    proposal.status = 'no_show'
    const newContent = `${INTERVIEW_PREFIX}${JSON.stringify(proposal)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').update({ content: newContent }).eq('id', msg.id)

    // Increment seeker's no_show_count (direct update since RPC not in types)
    const { data: seekerProfile } = await supabase
      .from('profiles')
      .select('no_show_count')
      .eq('id', room.seeker_id)
      .maybeSingle()
    const currentCount = (seekerProfile as unknown as { no_show_count: number } | null)?.no_show_count ?? 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('profiles').update({ no_show_count: currentCount + 1 }).eq('id', room.seeker_id)

    // Drop system notification message
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').insert({
      chat_room_id: id as string,
      sender_id: user.id,
      content: 'System: 노쇼(No-Show)가 신고되었습니다.',
    })

    setShowNoShowConfirm(null)
  }

  if (!room) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isEmployer = room.employer_id === user?.id
  const otherName = isEmployer ? room.seeker?.name : room.employer?.name

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* ── 헤더 ── */}
      <div className="bg-white border-b border-gray-100 rounded-t-2xl px-4 py-3 flex items-center gap-3">
        <Link href="/chat" className="text-gray-400 hover:text-gray-600 text-lg leading-none">
          ←
        </Link>

        {/* 아바타 */}
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {otherName?.[0] ?? '?'}
        </div>

        {/* 이름 + 공고 */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{otherName}</p>
          <Link
            href={isEmployer ? `/employer/jobs/${room.job_post_id}` : `/jobs/${room.job_post_id}`}
            className="mt-0.5 inline-flex items-center gap-1 max-w-full text-xs font-medium text-orange-600 hover:text-orange-700 hover:underline"
          >
            <span className="flex-shrink-0">📋</span>
            <span className="truncate">{room.job_posts?.title}</span>
          </Link>
        </div>

        {/* 면접완료 버튼 / 뱃지 */}
        {room.interview_completed ? (
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full flex-shrink-0">
            면접 완료
          </span>
        ) : isEmployer ? (
          <button
            onClick={handleCompleteInterview}
            disabled={completingInterview}
            className="text-xs font-semibold text-white px-3 py-1.5 rounded-full transition-all active:scale-95 flex-shrink-0 disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {completingInterview ? '완료 중...' : '면접 완료'}
          </button>
        ) : (
          <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full flex-shrink-0">
            면접 진행 중
          </span>
        )}
      </div>

      {/* ── 후기 배너 ── */}
      {room.interview_completed && !hasReview && (
        <div
          className="px-4 py-3 flex items-center justify-between gap-3"
          style={{ backgroundColor: 'var(--brand-light)' }}
        >
          <div className="min-w-0">
            <p className="text-sm text-orange-700 font-semibold">⭐ {otherName}님과의 면접은 어떠셨나요?</p>
            <p className="text-xs text-orange-600/80 mt-0.5">별점과 한줄평으로 신뢰를 쌓아주세요.</p>
          </div>
          <button
            onClick={() => setShowReviewModal(true)}
            className="text-xs font-semibold text-white px-3 py-2 rounded-full flex-shrink-0 active:scale-95"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            후기 작성
          </button>
        </div>
      )}

      {room.interview_completed && hasReview && (
        <div className="bg-green-50 px-4 py-2.5 text-center text-xs font-medium text-green-700">
          후기 등록이 완료되었습니다. 소중한 의견 감사합니다!
        </div>
      )}

      {/* ── 메시지 영역 ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10">
            <p className="text-3xl mb-2">👋</p>
            <p>첫 메시지를 보내보세요!</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const proposal = parseProposal(msg.content)

          // ── Interview proposal card ──
          if (proposal) {
            const confirmed = proposal.status === 'confirmed'
            const declined = proposal.status === 'declined'
            const pending = proposal.status === 'pending'
            const noShow = proposal.status === 'no_show'
            const expired = confirmed && isInterviewExpired(proposal)
            const isSeeker = room.seeker_id === user?.id
            const showReport = isEmployer && confirmed && expired && !noShow

            return (
              <div key={msg.id} className="flex justify-center">
                <div className={`w-full max-w-sm rounded-2xl border p-4 ${
                  noShow
                    ? 'bg-red-50 border-red-200'
                    : confirmed
                    ? 'bg-green-50 border-green-200'
                    : declined
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-orange-50 border-orange-200'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">📅</span>
                    <span className="font-bold text-sm text-gray-800">면접 제안</span>
                    {pending && <span className="ml-auto text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">대기 중</span>}
                    {confirmed && <span className="ml-auto text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">확정됨</span>}
                    {declined && <span className="ml-auto text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">거절됨</span>}
                    {noShow && <span className="ml-auto text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">노쇼</span>}
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-5">📆</span>
                      <span>{proposal.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-5">🕐</span>
                      <span>{proposal.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-5">📍</span>
                      <span>{proposal.location}</span>
                    </div>
                  </div>

                  {pending && isSeeker && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleConfirmInterview(msg)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                        style={{ backgroundColor: 'var(--brand)' }}
                      >
                        수락 및 확정
                      </button>
                      <button
                        onClick={() => handleDeclineInterview(msg)}
                        className="flex-1 py-2.5 rounded-xl text-xs font-bold text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-all active:scale-95"
                      >
                        거절
                      </button>
                    </div>
                  )}

                  {!pending && !noShow && (
                    <p className="mt-3 text-xs text-gray-400 text-center">
                      {confirmed ? '✅ 면접 일정이 확정되었습니다.' : '❌ 면접 제안이 거절되었습니다.'}
                    </p>
                  )}

                  {noShow && (
                    <p className="mt-3 text-xs text-red-500 text-center font-semibold">🚨 노쇼(No-Show) 신고 완료</p>
                  )}

                  {showReport && (
                    <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3">
                      <p className="text-xs font-semibold text-red-700 mb-2">면접이 예정대로 진행되었나요?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            // Mark interview as completed instead
                            handleCompleteInterview()
                          }}
                          className="flex-1 py-2 rounded-xl text-xs font-bold text-green-700 border border-green-200 bg-white hover:bg-green-50 transition-all active:scale-95"
                        >
                          네, 진행됨
                        </button>
                        <button
                          onClick={() => setShowNoShowConfirm(msg.id)}
                          className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                          style={{ backgroundColor: '#ef4444' }}
                        >
                          노쇼 신고하기
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="mt-2 text-xs text-gray-300 text-right">
                    {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {/* No-Show confirmation popover */}
                {showNoShowConfirm === msg.id && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowNoShowConfirm(null)}>
                    <div className="bg-white rounded-2xl p-5 mx-3 max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                      <h3 className="font-bold text-gray-900 text-sm mb-2">🚨 노쇼 신고 확인</h3>
                      <p className="text-xs text-gray-500 mb-4">해당 지원자가 면접에 불참한 것으로 신고하시겠습니까?<br/>신고 시 구직자 프로필에 노쇼 이력이 기록됩니다.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReportNoShow(msg)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95"
                          style={{ backgroundColor: '#ef4444' }}
                        >
                          네, 신고합니다
                        </button>
                        <button
                          onClick={() => setShowNoShowConfirm(null)}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 transition-all active:scale-95"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          }

          // ── Regular message bubble ──
          const isMine = msg.sender_id === user?.id
          const prevMsg = messages[idx - 1]
          const showName = !isMine && (!prevMsg || prevMsg.sender_id !== msg.sender_id)

          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] flex flex-col ${isMine ? 'items-end' : 'items-start'} gap-0.5`}>
                {showName && (
                  <p className="text-xs text-gray-400 px-1">{msg.profiles?.name}</p>
                )}
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMine
                      ? 'text-white rounded-br-sm'
                      : 'bg-white text-gray-900 border border-gray-100 rounded-bl-sm'
                  }`}
                  style={isMine ? { backgroundColor: 'var(--brand)' } : {}}
                >
                  {msg.content}
                </div>
                <p className="text-xs text-gray-300 px-1">
                  {new Date(msg.created_at).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── 입력창 ── */}
      <form
        onSubmit={handleSend}
        className="bg-white border-t border-gray-100 px-3 py-3 flex gap-2 items-end"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
        />
        {isEmployer && !room.interview_completed && (
          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-3 py-2.5 rounded-2xl hover:bg-orange-100 transition-all active:scale-95 flex-shrink-0"
          >
            📅 면접 제안
          </button>
        )}
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {sending ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 12V4M4 8l4-4 4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </form>

      {/* ── Schedule Interview Modal ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3 sm:items-center sm:pb-0">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-orange-500">면접 제안</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">면접 일정을 제안하세요</h2>
                <p className="mt-1 text-sm text-gray-500">날짜, 시간, 장소를 입력해주세요.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-500"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleProposeInterview} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-800">날짜</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-800">시간</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-800">장소 / 화상 링크</label>
                <input
                  type="text"
                  value={scheduleLocation}
                  onChange={e => setScheduleLocation(e.target.value)}
                  placeholder="예: 강남역 스타벅스 2층"
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <button
                type="submit"
                disabled={scheduling || !scheduleDate || !scheduleTime || !scheduleLocation.trim()}
                className="w-full rounded-2xl py-3.5 font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {scheduling ? '제안 중...' : '면접 제안하기'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3 sm:items-center sm:pb-0">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-orange-500">면접 후기</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">{otherName}님에게 후기를 남겨주세요</h2>
                <p className="mt-1 text-sm text-gray-500">후기는 프로필 하단의 매너 평점에 반영됩니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-500"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-5">
              <div>
                <label className="mb-3 block text-sm font-semibold text-gray-800">별점</label>
                <div className="flex items-center justify-between rounded-2xl bg-orange-50 px-4 py-3">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`text-4xl transition-all active:scale-90 ${star <= rating ? 'text-orange-400' : 'text-orange-200'}`}
                      aria-label={`${star}점`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-center text-sm font-medium text-orange-600">{RATING_LABELS[rating]}</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-800">한줄평</label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  maxLength={120}
                  rows={3}
                  placeholder="예: 시간 약속을 잘 지키고 대화가 편했어요."
                  className="w-full resize-none rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <p className="mt-1 text-right text-xs text-gray-400">{comment.length}/120</p>
              </div>

              {reviewError && (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-500">{reviewError}</p>
              )}

              <button
                type="submit"
                disabled={submittingReview || hasReview}
                className="w-full rounded-2xl py-3.5 font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {submittingReview ? '등록 중...' : '후기 등록하기'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}