'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'

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

export default function ChatRoomPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const router = useRouter()
  const [room, setRoom] = useState<ChatRoom | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [completingInterview, setCompletingInterview] = useState(false)
  const [hasReview, setHasReview] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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
    setRoom(data as unknown as ChatRoom)
  }, [id, router])

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(name)')
      .eq('chat_room_id', id)
      .order('created_at', { ascending: true })
    setMessages((data as unknown as Message[]) ?? [])
  }, [id])

  useEffect(() => {
    fetchRoom()
    fetchMessages()
  }, [fetchRoom, fetchMessages])

  useEffect(() => {
    if (!user || !room?.interview_completed) return
    const checkReview = async () => {
      const { data } = await supabase
        .from('reviews')
        .select('id')
        .eq('chat_room_id', id)
        .eq('reviewer_id', user.id)
        .maybeSingle()
      setHasReview(!!data)
    }
    checkReview()
  }, [user, room, id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`room:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_room_id=eq.${id}` },
        async (payload) => {
          const { data } = await supabase
            .from('messages')
            .select('*, profiles(name)')
            .eq('id', payload.new.id)
            .maybeSingle()
          if (data) setMessages(prev => [...prev, data as unknown as Message])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !user) return
    setSending(true)
    await supabase.from('messages').insert({
      chat_room_id: id as string,
      sender_id: user.id,
      content: input.trim(),
    })
    setInput('')
    setSending(false)
  }

  const handleCompleteInterview = async () => {
    if (!room) return
    setCompletingInterview(true)
    await supabase
      .from('chat_rooms')
      .update({ interview_completed: true })
      .eq('id', id)
    setRoom({ ...room, interview_completed: true })
    setCompletingInterview(false)
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
      {/* Header */}
      <div className="bg-white border-b border-gray-100 rounded-t-2xl px-4 py-3 flex items-center gap-3 mb-0">
        <Link href="/chat" className="text-gray-400 hover:text-gray-600 mr-1">←</Link>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {otherName ? otherName[0] : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{otherName}</p>
          <p className="text-xs text-gray-400 truncate">{room.job_posts?.title}</p>
        </div>
        {room.interview_completed ? (
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full flex-shrink-0">
            면접완료
          </span>
        ) : (
          <button
            onClick={handleCompleteInterview}
            disabled={completingInterview}
            className="text-xs font-medium text-gray-500 border border-gray-200 px-3 py-1.5 rounded-full hover:bg-gray-50 transition-all flex-shrink-0 disabled:opacity-50"
          >
            {completingInterview ? '...' : '면접완료'}
          </button>
        )}
      </div>

      {/* Review prompt */}
      {room.interview_completed && !hasReview && (
        <div
          className="mx-0 px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: 'var(--brand-light)' }}
        >
          <p className="text-sm text-orange-700 font-medium">후기를 남겨주세요!</p>
          <Link
            href={`/reviews/new?room=${id}`}
            className="text-xs font-semibold text-white px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            후기 작성
          </Link>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            첫 메시지를 보내보세요!
          </p>
        )}
        {messages.map(msg => {
          const isMine = msg.sender_id === user?.id
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                {!isMine && (
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
                  {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="bg-white border-t border-gray-100 px-4 py-3 flex gap-2 items-end"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          ↑
        </button>
      </form>
    </div>
  )
}
