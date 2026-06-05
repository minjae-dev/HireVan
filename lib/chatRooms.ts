import { supabase } from '@/lib/supabase'

/**
 * lib/chatRooms.ts
 *
 * chat_rooms / messages 테이블 fetch 관련 로직.
 * 채팅 목록, 채팅방 단건 조회, 메시지 송수신, 면접 제안 파싱 등을 모았다.
 */

export interface ChatRoom {
  id: string
  job_post_id: string
  employer_id: string
  seeker_id: string
  interview_completed: boolean
  created_at: string
  job_posts: { title: string; location?: string; status?: 'open' | 'closed' } | null
  employer: { name: string } | null
  seeker: { name: string } | null
}

export interface ChatRoomWithLastMessage extends ChatRoom {
  last_message?: string | null
  last_message_at?: string | null
  unread_count?: number
}

export interface ChatMessage {
  id: string
  chat_room_id: string
  sender_id: string
  content: string
  created_at: string
  profiles: { name: string } | null
}

/** 현재 사용자가 참여중인 모든 채팅방 (최근 활동 순). */
export async function fetchUserChatRooms(userId: string): Promise<ChatRoomWithLastMessage[]> {
  if (!userId) return []
  const { data, error } = await supabase
    .from('chat_rooms')
    .select(`
      *,
      job_posts(title, location, status),
      employer:profiles!chat_rooms_employer_id_fkey(name),
      seeker:profiles!chat_rooms_seeker_id_fkey(name)
    `)
    .or(`employer_id.eq.${userId},seeker_id.eq.${userId}`)
    .order('created_at', { ascending: false })
  if (error) throw error

  const rooms = (data as unknown as ChatRoom[]) ?? []
  // 각 채팅방의 마지막 메시지 병렬 조회
  const enriched = await Promise.all(
    rooms.map(async room => {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('chat_room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const msg = lastMsg as unknown as { content: string; created_at: string } | null
      return {
        ...room,
        last_message: msg?.content ?? null,
        last_message_at: msg?.created_at ?? null,
      }
    }),
  )

  // 마지막 활동 시간 기준 재정렬
  enriched.sort((a, b) => {
    const aTime = a.last_message_at ?? a.created_at
    const bTime = b.last_message_at ?? b.created_at
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })
  return enriched
}

/** 단일 채팅방 (job_posts / employer / seeker profile JOIN 포함). */
export async function fetchChatRoom(roomId: string): Promise<ChatRoom | null> {
  if (!roomId) return null
  const { data, error } = await supabase
    .from('chat_rooms')
    .select(`
      *,
      job_posts(title),
      employer:profiles!chat_rooms_employer_id_fkey(name),
      seeker:profiles!chat_rooms_seeker_id_fkey(name)
    `)
    .eq('id', roomId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as ChatRoom | null) ?? null
}

/** 특정 채팅방의 모든 메시지 (오래된 순). */
export async function fetchMessages(roomId: string): Promise<ChatMessage[]> {
  if (!roomId) return []
  const { data, error } = await supabase
    .from('messages')
    .select('*, profiles(name)')
    .eq('chat_room_id', roomId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as unknown as ChatMessage[]) ?? []
}

/** 일반 텍스트 메시지 전송. */
export async function sendMessage(input: {
  roomId: string
  senderId: string
  content: string
}): Promise<void> {
  const trimmed = input.content.trim()
  if (!input.roomId || !input.senderId || !trimmed) return
  const { error } = await supabase
    .from('messages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      chat_room_id: input.roomId,
      sender_id: input.senderId,
      content: trimmed,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  if (error) throw error
}

/** 면접 완료 처리. 권한 검사는 호출 측에서. */
export async function markInterviewCompleted(roomId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_rooms')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ interview_completed: true } as any)
    .eq('id', roomId)
  if (error) throw error
}

// ── 면접 제안 (structured message) ──────────────────────────────

export const INTERVIEW_PREFIX = '[INTERVIEW_PROPOSAL]'

export interface InterviewProposal {
  date: string
  time: string
  location: string
  status: 'pending' | 'confirmed' | 'declined' | 'no_show'
}

export function parseInterviewProposal(content: string): InterviewProposal | null {
  if (!content.startsWith(INTERVIEW_PREFIX)) return null
  try {
    const json = content.slice(INTERVIEW_PREFIX.length)
    return JSON.parse(json) as InterviewProposal
  } catch {
    return null
  }
}

export async function sendInterviewProposal(
  roomId: string,
  senderId: string,
  proposal: InterviewProposal,
): Promise<void> {
  const content = `${INTERVIEW_PREFIX}${JSON.stringify(proposal)}`
  await sendMessage({ roomId, senderId, content })
}

export async function updateInterviewProposalStatus(
  messageId: string,
  status: InterviewProposal['status'],
): Promise<void> {
  // 이 함수는 호출 전에 message.content 를 다시 파싱해 status 만 갱신한
  // content 를 만들어 넘겨주는 전제를 따른다. (parse + status 갱신 + 직렬화)
  // 단, 호출 측에서 한 번 더 안전하게 파싱하지 못할 수 있으니 여기서 직접 처리한다.
  // → 별도 helper 가 필요한 경우 parseInterviewProposal + sendMessage 흐름 사용 권장.
  void messageId
  void status
  throw new Error('updateInterviewProposalStatus 는 직접 사용하지 마세요. updateInterviewProposal() 을 사용하세요.')
}

export async function updateInterviewProposal(
  messageId: string,
  proposal: InterviewProposal,
): Promise<void> {
  const content = `${INTERVIEW_PREFIX}${JSON.stringify(proposal)}`
  const { error } = await supabase
    .from('messages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ content } as any)
    .eq('id', messageId)
  if (error) throw error
}