import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

/**
 * lib/applications.ts
 *
 * applications / chat_rooms 테이블과 관련된 로직을 모았다.
 * 구직자 지원, 업체 수락/거절, 채팅방 생성/조회, 매칭 추천 등이 여기서 이뤄진다.
 */

export type ApplicationRow = Database['public']['Tables']['applications']['Row']
export type ChatRoomRow = Database['public']['Tables']['chat_rooms']['Row']

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected'

export interface ApplicationWithSeeker extends ApplicationRow {
  profiles: { name: string; bio: string; visa_type: string; no_show_count: number } | null
}

export interface ApplicationWithRoom extends ApplicationRow {
  profiles: { name: string; bio: string; visa_type: string } | null
  chat_room_id: string | null
}

/** 특정 공고의 지원자 목록 (업체 시점). */
export async function fetchApplicationsForJob(jobId: string): Promise<ApplicationWithSeeker[]> {
  if (!jobId) return []
  const { data, error } = await supabase
    .from('applications')
    .select('*, profiles(name, bio, visa_type, no_show_count)')
    .eq('job_post_id', jobId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as ApplicationWithSeeker[]) ?? []
}

/**
 * 특정 공고의 지원자 + 각 지원자별 chat_room_id 매핑까지 한 번에 가져온다.
 * 두 번의 SELECT 를 N+1 회 피하기 위해 chat_rooms 도 함께 가져온다.
 */
export async function fetchApplicationsWithChatRoom(
  jobId: string,
): Promise<ApplicationWithRoom[]> {
  if (!jobId) return []
  const { data: rawAppData, error: appError } = await supabase
    .from('applications')
    .select('*, profiles(name, bio, visa_type)')
    .eq('job_post_id', jobId)
    .order('created_at', { ascending: false })
  if (appError) throw appError

  const { data: rawChatRooms, error: roomError } = await supabase
    .from('chat_rooms')
    .select('id, seeker_id')
    .eq('job_post_id', jobId)
  if (roomError) throw roomError

  const chatRoomMap = new Map<string, string>()
  for (const room of (rawChatRooms as unknown as { id: string; seeker_id: string }[]) ?? []) {
    chatRoomMap.set(room.seeker_id, room.id)
  }

  return ((rawAppData ?? []) as unknown as Omit<ApplicationWithRoom, 'chat_room_id'>[]).map(
    app => ({
      ...app,
      chat_room_id: chatRoomMap.get(app.seeker_id) ?? null,
    }),
  )
}

/** 현재 구직자가 특정 공고에 이미 지원했는지 확인. */
export async function checkAlreadyApplied(
  jobId: string,
  seekerId: string,
): Promise<boolean> {
  if (!jobId || !seekerId) return false
  const { data, error } = await supabase
    .from('applications')
    .select('id')
    .eq('job_post_id', jobId)
    .eq('seeker_id', seekerId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export interface NewApplicationInput {
  jobId: string
  seekerId: string
  resumeUrl: string | null
  customAnswers: { id: string; question: string; answer: string }[]
}

/**
 * 새 지원 row 를 INSERT 한다.
 * - 중복 지원(23505) 시 throw — 호출 측에서 분기 처리.
 */
export async function submitApplication(input: NewApplicationInput): Promise<void> {
  const { error } = await supabase
    .from('applications')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      job_post_id: input.jobId,
      seeker_id: input.seekerId,
      status: 'pending',
      resume_url: input.resumeUrl || null,
      custom_answers: input.customAnswers.length > 0 ? input.customAnswers : [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  if (error) throw error
}

/**
 * 지원 상태를 변경 + 수락 시 자동으로 채팅방을 확보한다.
 * - 기존 채팅방이 있으면 그 id, 없으면 새로 만든다.
 * - 채팅방 생성 실패 시 에러 throw.
 */
export async function acceptApplication(input: {
  appId: string
  jobId: string
  seekerId: string
  employerId: string
}): Promise<string> {
  // 1) 기존 채팅방 확인
  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('job_post_id', input.jobId)
    .eq('seeker_id', input.seekerId)
    .maybeSingle()

  let chatRoomId: string
  const existingRow = existing as unknown as { id: string } | null
  if (existingRow?.id) {
    chatRoomId = existingRow.id
  } else {
    const { data: newRoom, error: roomError } = await supabase
      .from('chat_rooms')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        job_post_id: input.jobId,
        employer_id: input.employerId,
        seeker_id: input.seekerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select('id')
      .single()
    if (roomError) throw roomError
    if (!newRoom) throw new Error('채팅방 생성에 실패했어요.')
    chatRoomId = (newRoom as { id: string }).id
  }

  // 2) 지원 status = 'accepted'
  const { error: updateError } = await supabase
    .from('applications')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: 'accepted' } as any)
    .eq('id', input.appId)
  if (updateError) throw updateError

  return chatRoomId
}

/** 지원 거절. */
export async function rejectApplication(appId: string): Promise<void> {
  const { error } = await supabase
    .from('applications')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: 'rejected' } as any)
    .eq('id', appId)
  if (error) throw error
}

/**
 * 채팅방에 시스템 메시지(수락 안내 등)를 전송한다.
 * custom_answers / resume URL 을 함께 노출하고 싶을 때 사용.
 */
export async function sendSystemMessage(
  chatRoomId: string,
  senderId: string,
  content: string,
): Promise<void> {
  if (!chatRoomId || !senderId) return
  const { error } = await supabase
    .from('messages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      chat_room_id: chatRoomId,
      sender_id: senderId,
      content,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  if (error) throw error
}