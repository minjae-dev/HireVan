'use client'

 

import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'
import { subscribeWithReconnect } from '@/lib/realtime'
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
  reject_reason?: string
}

const RATING_LABELS = ['', '아쉬웠어요', '조금 아쉬웠어요', '보통이에요', '좋았어요', '최고였어요']
const MESSAGE_PAGE_SIZE = 30
const INTERVIEW_PREFIX = '[INTERVIEW_PROPOSAL]'
const STATUS_UPDATE_PREFIX = '[INTERVIEW_STATUS_UPDATE]'

function parseProposal(content: string): InterviewProposal | null {
  if (!content || !content.startsWith(INTERVIEW_PREFIX)) return null
  try {
    const jsonStr = content.slice(INTERVIEW_PREFIX.length).trim()
    const parsed = JSON.parse(jsonStr)
    if (parsed && typeof parsed === 'object') {
      return {
        date: parsed.date || '',
        time: parsed.time || '',
        location: parsed.location || '',
        status: parsed.status || 'pending',
        reject_reason: parsed.reject_reason
      }
    }
    return null
  } catch {
    return null
  }
}

function parseStatusUpdate(content: string) {
  if (!content || !content.startsWith(STATUS_UPDATE_PREFIX)) return null
  try {
    const jsonStr = content.slice(STATUS_UPDATE_PREFIX.length).trim()
    return JSON.parse(jsonStr) as { parent_id: string; status: InterviewProposal['status']; reject_reason?: string }
  } catch {
    return null
  }
}

export default function ChatRoomPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : ''
  const router = useRouter()
  const { user } = useAuth()

  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({})

  // 모달 제어 상태들
  const [showProposalModal, setShowProposalModal] = useState(false)
  const [showNoShowConfirm, setShowNoShowConfirm] = useState<string | null>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  
  // 💡 prompt() 우회용 거절 모달 상태 추가
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null)
  const [rejectReasonInput, setRejectReasonInput] = useState('')

  const [proposalDate, setProposalDate] = useState('')
  const [proposalTime, setProposalTime] = useState('')
  const [proposalLocation, setProposalLocation] = useState('')

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [hasReview, setHasReview] = useState(false)
  const [reviewError, setReviewError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef<number>(0)

  const getProposalStatus = (msgId: string, originalProposal: InterviewProposal) => {
    let currentStatus = originalProposal.status
    let rejectReason = originalProposal.reject_reason

    messages.forEach(m => {
      const update = parseStatusUpdate(m.content)
      if (update && update.parent_id === msgId) {
        currentStatus = update.status
        if (update.reject_reason) {
          rejectReason = update.reject_reason
        }
      }
    })

    return { status: currentStatus, reject_reason: rejectReason }
  }

  useEffect(() => {
    if (!id || !user) return

    const fetchRoom = async () => {
      try {
        const { data, error } = await supabase
          .from('chat_rooms')
          .select(`
            id,
            job_post_id,
            employer_id,
            seeker_id,
            interview_completed,
            job_posts(title),
            employer:profiles!chat_rooms_employer_id_fkey(name),
            seeker:profiles!chat_rooms_seeker_id_fkey(name)
          `)
          .eq('id', id)
          .single()

        if (error) throw error
        if (data) {
          const formattedRoom: ChatRoom = {
            id: data.id,
            job_post_id: data.job_post_id,
            employer_id: data.employer_id,
            seeker_id: data.seeker_id,
            interview_completed: data.interview_completed,
            job_posts: Array.isArray(data.job_posts) ? data.job_posts[0] : data.job_posts,
            employer: Array.isArray(data.employer) ? data.employer[0] : data.employer,
            seeker: Array.isArray(data.seeker) ? data.seeker[0] : data.seeker,
          }
          setRoom(formattedRoom)

          const { count, error: checkError } = await supabase
            .from('reviews')
            .select('*', { count: 'exact', head: true })
            .eq('chat_room_id', data.id)
            .eq('reviewer_id', user.id)

          if (!checkError && count !== null && count > 0) {
            setHasReview(true)
          }
        }
      } catch (err) {
        console.error('Room fetch error:', err)
        router.push('/chat')
      }
    }
    fetchRoom()
  }, [id, user, router])

  useEffect(() => {
    if (!id) return
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select(`
            *,
            profiles(name)
          `)
          .eq('chat_room_id', id)
          .order('created_at', { ascending: false })
          .range(0, MESSAGE_PAGE_SIZE - 1)

        if (error) throw error
        if (data) {
          const list = (data as any[]).map(m => ({
            ...m,
            profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
          })) as Message[]
          setMessages(list.reverse())
          if (list.length < MESSAGE_PAGE_SIZE) {
            setHasMore(false)
          }
        }
      } catch (err) {
        console.error('Messages load error:', err)
      } finally {
        setLoading(false)
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        }, 50)
      }
    }
    fetchMessages()
  }, [id])

  const loadMoreMessages = useCallback(async () => {
    if (!id || loadingMore || !hasMore) return
    setLoadingMore(true)

    if (scrollRef.current) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight
    }

    try {
      const offset = messages.length
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          profiles(name)
        `)
        .eq('chat_room_id', id)
        .order('created_at', { ascending: false })
        .range(offset, offset + MESSAGE_PAGE_SIZE - 1)

      if (error) throw error
      if (data && data.length > 0) {
        const list = (data as any[]).map(m => ({
          ...m,
          profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
        })) as Message[]
        
        setMessages(prev => [...list.reverse(), ...prev])
        if (list.length < MESSAGE_PAGE_SIZE) {
          setHasMore(false)
        }
      } else {
        setHasMore(false)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingMore(false)
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight - prevScrollHeightRef.current
        }
      }, 30)
    }
  }, [id, messages.length, loadingMore, hasMore])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop === 0 && hasMore && !loadingMore) {
      loadMoreMessages()
    }
  }

  useEffect(() => {
    if (!id) return

    return subscribeWithReconnect({
      roomId: id,
      table: 'messages',
      filter: `chat_room_id=eq.${id}`,
      onInsert: async (payload) => {
        const newMsg = payload.new as Database['public']['Tables']['messages']['Row']
        const { data: profileData } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', newMsg.sender_id)
          .maybeSingle()

        const completeMsg: Message = {
          ...newMsg,
          profiles: profileData || null,
        }
        setMessages(prev => {
          if (prev.some(m => m.id === completeMsg.id)) return prev
          return [...prev, completeMsg]
        })
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        }, 50)
      },
    })
  }, [id])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !id || !user || sending) return

    setSending(true)
    try {
      const { error } = await supabase.from('messages').insert({
        chat_room_id: id as string,
        sender_id: user.id,
        content: newMessage.trim(),
      })
      if (error) throw error
      setNewMessage('')
    } catch (err) {
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  const handleSendProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proposalDate || !proposalTime || !proposalLocation || !id || !user) return

    const proposalObj: InterviewProposal = {
      date: proposalDate,
      time: proposalTime,
      location: proposalLocation,
      status: 'pending',
    }
    const content = `${INTERVIEW_PREFIX}${JSON.stringify(proposalObj)}`

    try {
      const { error } = await supabase.from('messages').insert({
        chat_room_id: id as string,
        sender_id: user.id,
        content,
      })
      if (error) throw error
      setShowProposalModal(false)
      setProposalDate('')
      setProposalTime('')
      setProposalLocation('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleProposalAction = async (
    msgId: string, 
    action: 'confirmed' | 'declined',
    rejectReason?: string
  ) => {
    if (isProcessing[msgId] || !user || !room) return
    setIsProcessing(prev => ({ ...prev, [msgId]: true }))

    try {
      const updatePayload = {
        parent_id: msgId,
        status: action,
        ...(action === 'declined' && rejectReason ? { reject_reason: rejectReason } : {})
      }
      const statusUpdateContent = `${STATUS_UPDATE_PREFIX}${JSON.stringify(updatePayload)}`

      const { error } = await supabase.from('messages').insert({
        chat_room_id: id as string,
        sender_id: user.id,
        content: statusUpdateContent,
      })

      if (error) throw error

      if (action === 'declined') {
        const noticeText = `🚨 [시스템 안내] 구직자가 면접 제안을 거절했습니다.${rejectReason ? ` (사유: ${rejectReason})` : ''}`
        await supabase.from('messages').insert({
          chat_room_id: id as string,
          sender_id: user.id,
          content: noticeText
        })
      }
    } catch (err: any) {
      console.error(err)
      alert('요청을 처리하지 못했습니다.')
    } finally {
      setIsProcessing(prev => ({ ...prev, [msgId]: false }))
    }
  }

  const handleReportNoShow = async (msg: Message) => {
    if (!user || !room || isProcessing[msg.id]) return
    setIsProcessing(prev => ({ ...prev, [msg.id]: true }))

    try {
      const updatePayload = {
        parent_id: msg.id,
        status: 'no_show' as const
      }
      const statusUpdateContent = `${STATUS_UPDATE_PREFIX}${JSON.stringify(updatePayload)}`

      const { data: seekerProfile } = await supabase
        .from('profiles')
        .select('no_show_count')
        .eq('id', room.seeker_id)
        .maybeSingle()

      const currentCount = seekerProfile?.no_show_count ?? 0

      await supabase
        .from('profiles')
        .update({ no_show_count: currentCount + 1 })
        .eq('id', room.seeker_id)

      await supabase.from('messages').insert({
        chat_room_id: id as string,
        sender_id: user.id,
        content: statusUpdateContent,
      })

      await supabase.from('messages').insert({
        chat_room_id: id as string,
        sender_id: user.id,
        content: 'System: 구직자의 노쇼(No-Show) 사건이 기록되었습니다.',
      })

      setShowNoShowConfirm(null)
    } catch (err) {
      console.error(err)
    } finally {
      setIsProcessing(prev => ({ ...prev, [msg.id]: false }))
    }
  }

  const handleCompleteInterview = async () => {
    if (!id) return
    try {
      const { error } = await supabase
        .from('chat_rooms')
        .update({ interview_completed: true })
        .eq('id', id)

      if (error) throw error
      setRoom(prev => prev ? { ...prev, interview_completed: true } : null)
      setShowReviewModal(true)
    } catch (err) {
      console.error(err)
    }
  }

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room || !user || rating === 0) {
      setReviewError('별점을 선택해 주세요.')
      return
    }
    setSubmittingReview(true)
    setReviewError('')

    const targetUserId = user.id === room.employer_id ? room.seeker_id : room.employer_id

    try {
      const { error } = await supabase.from('reviews').insert({
        chat_room_id: room.id,
        reviewer_id: user.id,
        reviewee_id: targetUserId,
        rating,
        comment: comment.trim(),
      })
      if (error) throw error
      setHasReview(true)
      setShowReviewModal(false)
      setReviewError('')
    } catch (err: any) {
      console.error(err)
      setReviewError('후기 등록 중 오류가 발생했습니다.')
    } finally {
      setSubmittingReview(false)
    }
  }

  const isEmployer = user?.id === room?.employer_id
  const opponentName = isEmployer ? room?.seeker?.name : room?.employer?.name

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-gray-50/60 shadow-inner">
      <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Link href="/chat" className="text-xl text-orange-500 active:scale-95">◀</Link>
          <div>
            <h2 className="text-base font-bold text-gray-900 tracking-tight">{opponentName || '대화방'}</h2>
            <p className="text-[11px] font-medium text-orange-500">{room?.job_posts?.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isEmployer && !room?.interview_completed && (
            <button
              onClick={() => setShowProposalModal(true)}
              className="rounded-full bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-600 active:scale-95"
            >
              📅 일정 제안
            </button>
          )}
          {!room?.interview_completed ? (
            <button
              onClick={handleCompleteInterview}
              className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 active:scale-95 transition-all shadow-sm"
            >
              ✅ 면접 완료
            </button>
          ) : (
            !hasReview && (
              <button
                onClick={() => setShowReviewModal(true)}
                className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
              >
                ⭐️ 후기 작성
              </button>
            )
          )}
        </div>
      </header>

      <main
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {loadingMore && (
          <p className="text-center text-xs text-gray-400 py-1">이전 대화 불러오는 중...</p>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_id === user?.id
          const rawProposal = parseProposal(msg.content)
          const isStatusLog = parseStatusUpdate(msg.content)

          if (isStatusLog) return null

          if (rawProposal) {
            const { status, reject_reason: rejectReason } = getProposalStatus(msg.id, rawProposal)
            const isPending = status === 'pending'
            const processing = isProcessing[msg.id] || false

            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div className="rounded-2xl border border-gray-100 bg-orange-50/50 p-4 shadow-sm w-full max-w-sm">
                  <div className="flex items-center gap-2 text-orange-600 mb-2.5">
                    <span className="text-base">📅</span>
                    <span className="font-bold text-xs tracking-tight">면접 제안서가 도착했습니다</span>
                  </div>
                  <div className="space-y-1 text-xs text-gray-700">
                    <p><span className="text-gray-400 font-medium mr-1.5">날짜:</span>{rawProposal.date}</p>
                    <p><span className="text-gray-400 font-medium mr-1.5">시간:</span>{rawProposal.time}</p>
                    <p><span className="text-gray-400 font-medium mr-1.5">장소:</span>{rawProposal.location}</p>
                  </div>
                  
                  <div className="mt-3.5 pt-2.5 border-t border-orange-100/60">
                    {isPending ? (
                      isMe ? (
                        <p className="text-center text-[11px] font-medium text-orange-400 animate-pulse">
                          ⏳ 구직자의 수락/거절을 기다리는 중입니다...
                        </p>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleProposalAction(msg.id, 'confirmed')}
                            disabled={processing}
                            className="flex-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-white transition-all disabled:opacity-50"
                          >
                            {processing ? '처리 중...' : '👍 수락하기'}
                          </button>
                          <button
                            onClick={() => {
                              // 💡 prompt() 에러 해결: 모달 창을 띄우도록 변경
                              setRejectReasonInput('')
                              setShowRejectModal(msg.id)
                            }}
                            disabled={processing}
                            className="flex-1 rounded-xl bg-white border border-gray-200 py-2 text-xs font-semibold text-gray-600 transition-all disabled:opacity-50"
                          >
                            👎 거절하기
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="text-center py-0.5">
                        {status === 'confirmed' && (
                          <div className="flex flex-col items-center gap-2">
                            <span className="inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                              ✅ 면접 약속 확정됨
                            </span>
                            {isEmployer && (
                              <button
                                onClick={() => setShowNoShowConfirm(msg.id)}
                                className="text-[10px] text-red-400 underline decoration-red-200 hover:text-red-500"
                              >
                                구직자가 면접에 안 왔나요? (노쇼 신고)
                              </button>
                            )}
                          </div>
                        )}
                        {status === 'declined' && (
                          <div className="space-y-2">
                            <span className="inline-block rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-500">
                              ❌ 면접 제안 거절됨
                            </span>
                            {rejectReason && (
                              <p className="rounded-xl bg-gray-50 border border-gray-100 p-2 text-left text-[11px] text-gray-500">
                                <strong className="text-gray-700">거절 사유:</strong> {rejectReason}
                              </p>
                            )}
                            {isMe && (
                              <button
                                onClick={() => {
                                  setProposalDate(rawProposal.date)
                                  setProposalLocation(rawProposal.location)
                                  setShowProposalModal(true)
                                }}
                                className="w-full rounded-xl bg-gray-900 py-1.5 text-[11px] font-semibold text-white transition-all hover:bg-gray-800"
                              >
                                🔄 면접 일정 다시 제안하기
                              </button>
                            )}
                          </div>
                        )}
                        {status === 'no_show' && (
                          <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
                            ⚠️ 노쇼 신고 완료
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="mb-1 text-[10px] font-bold text-orange-500 px-1">
                    {msg.profiles?.name || '상대방'}
                  </span>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-xs font-medium leading-relaxed shadow-sm ${
                    isMe
                      ? 'bg-orange-500 text-white rounded-br-none'
                      : 'bg-white text-gray-800 border border-orange-100 rounded-bl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          )
        })}
      </main>

      <footer className="border-t border-gray-100 bg-white px-4 py-3">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="메시지를 입력해 주세요..."
            className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="rounded-full py-2.5 px-4 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-40 bg-orange-500 hover:bg-orange-600"
          >
            전송
          </button>
        </form>
      </footer>

      {/* 💡 prompt() 완벽 대체: 거절 사유 입력용 커스텀 모달 구현 */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-xl">
            <h3 className="text-sm font-bold text-gray-900 mb-2">👎 면접 제안 거절</h3>
            <p className="text-[11px] text-gray-500 mb-3.5 leading-normal">
              고용주에게 전달할 거절 사유를 입력해 주세요. (예: 일정 변경 희망, 위치 조율 필요 등)
            </p>
            <textarea
              value={rejectReasonInput}
              onChange={e => setRejectReasonInput(e.target.value)}
              placeholder="사유를 입력하세요 (미입력 시 '일정 조율 필요'로 전송)"
              rows={3}
              maxLength={100}
              className="w-full resize-none rounded-xl border border-gray-200 p-2.5 text-xs focus:border-orange-400 focus:outline-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  const finalReason = rejectReasonInput.trim() || '일정 조율 필요'
                  handleProposalAction(showRejectModal, 'declined', finalReason)
                  setShowRejectModal(null)
                }}
                className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-bold text-white"
              >
                거절 확정
              </button>
              <button
                onClick={() => setShowRejectModal(null)}
                className="flex-1 rounded-xl bg-gray-100 py-2 text-xs font-semibold text-gray-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showProposalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
            <h3 className="mb-4 text-sm font-bold text-gray-900">📅 새로운 면접일정 제안</h3>
            <form onSubmit={handleSendProposal} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">날짜</label>
                <input
                  type="date"
                  value={proposalDate}
                  onChange={e => setProposalDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">시간</label>
                <input
                  type="time"
                  value={proposalTime}
                  onChange={e => setProposalTime(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">장소</label>
                <input
                  type="text"
                  value={proposalLocation}
                  onChange={e => setProposalLocation(e.target.value)}
                  placeholder="예: 매장 방문 또는 Zoom 주소"
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-orange-500 py-2.5 text-xs font-bold text-white shadow-sm"
                >
                  제안 보내기
                </button>
                <button
                  type="button"
                  onClick={() => setShowProposalModal(false)}
                  className="flex-1 rounded-xl bg-gray-100 py-2.5 text-xs font-semibold text-gray-600"
                >
                  닫기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNoShowConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-3xl bg-white p-5 shadow-xl text-center">
            <h3 className="text-sm font-bold text-gray-900 mb-2">⚠️ 노쇼(No-Show) 신고</h3>
            <p className="text-xs text-gray-500 leading-normal mb-5">
              구직자가 사전 연락 없이 약속된 면접에 불참했습니까? 이 액션은 번복할 수 없으며 구직자 프로필에 경고가 누적됩니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const msg = messages.find(m => m.id === showNoShowConfirm)
                  if (msg) handleReportNoShow(msg)
                }}
                className="flex-1 rounded-xl bg-red-500 py-2 text-xs font-bold text-white"
              >
                신고하기
              </button>
              <button
                onClick={() => setShowNoShowConfirm(null)}
                className="flex-1 rounded-xl bg-gray-100 py-2 text-xs font-semibold text-gray-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">⭐️ 면접 파트너 후기 작성</h3>
              <button
                onClick={() => setShowReviewModal(false)}
                className="text-gray-400 text-sm hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div className="text-center py-2">
                <label className="mb-2 block text-xs font-semibold text-gray-500">이번 면접 경험은 어떠셨나요?</label>
                <div className="flex justify-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`text-2xl transition-all ${star <= rating ? 'text-amber-400 scale-110' : 'text-gray-200'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold text-orange-600 h-4">{RATING_LABELS[rating]}</p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-800">한줄평</label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  maxLength={120}
                  rows={3}
                  placeholder="예: 시간 약속을 잘 지키고 대화가 편했어요."
                  className="w-full resize-none rounded-2xl border border-gray-200 px-3 py-2.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
                <p className="mt-1 text-right text-[10px] text-gray-400">{comment.length}/120</p>
              </div>

              {reviewError && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-500">{reviewError}</p>
              )}

              <button
                type="submit"
                disabled={submittingReview || hasReview}
                className="w-full rounded-2xl py-3 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60 bg-orange-500"
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