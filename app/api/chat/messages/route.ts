import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/messages
 *
 * 일반 텍스트 메시지 전송.
 *
 * Request:
 *   { chat_room_id: string, content: string }
 *
 * Response 200:
 *   { message: { id, chat_room_id, sender_id, content, created_at } }
 *
 * ## 동작
 *  1) Bearer 토큰 검증 → sender_id
 *  2) caller 가 chat_room 의 employer 또는 seeker 인지 확인
 *  3) messages INSERT → DB 트리거 `notify_chat_new_message` 가
 *     - 수신자 1명에 대한 notification_logs 1건 (status='queued')
 *     - pg_notify 'chat_push' 1회 발행
 *  4) 응답은 200 으로 message 반환. 푸시 발송은 비동기로 처리됨.
 *     → 클라이언트는 응답을 기다릴 필요 없음.
 *
 * ## 주의
 *  - 메시지 본문은 4000자 이하로 클램프 (DB 컬럼은 text 라지만
 *    푸시 body 사전보기에 120자 slice 만 들어가도록 빌더에서 처리).
 *  - 빈 content 거절, trim.
 *  - 인터뷰 제안 / 상태 업데이트는 별도 prefix ([INTERVIEW_PROPOSAL] 등) 가
 *    들어간 content 그대로 저장되며, 푸시는 "새 메시지" 와 동일하게 동작한다.
 */
export async function POST(request: NextRequest) {
  const supabase = requireSupabaseAdmin()

  // 1) 인증
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const token = auth.slice('Bearer '.length)
  const { data: userRes, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userRes?.user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  const senderId = userRes.user.id

  // 2) 입력 파싱
  let body: { chat_room_id?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const roomId = body.chat_room_id
  const rawContent = (body.content ?? '').trim()
  if (!roomId || !rawContent) {
    return NextResponse.json(
      { error: 'chat_room_id and content are required' },
      { status: 400 },
    )
  }
  if (rawContent.length > 4000) {
    return NextResponse.json({ error: 'content_too_long' }, { status: 400 })
  }

  // 3) 채팅방 멤버십 확인
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('id, employer_id, seeker_id')
    .eq('id', roomId)
    .maybeSingle()
  if (!room) {
    return NextResponse.json({ error: 'room_not_found' }, { status: 404 })
  }
  const r = room as { id: string; employer_id: string; seeker_id: string }
  if (r.employer_id !== senderId && r.seeker_id !== senderId) {
    return NextResponse.json({ error: 'not_a_member' }, { status: 403 })
  }

  // 4) 메시지 INSERT — 트리거가 자동 알림 큐잉
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      chat_room_id: roomId,
      sender_id: senderId,
      content: rawContent,
    })
    .select('*')
    .single()

  if (msgErr || !message) {
    return NextResponse.json(
      { error: 'message_insert_failed', detail: msgErr?.message },
      { status: 500 },
    )
  }

  // 5) 응답. 푸시 발송은 별도 워커가 pg_notify 받아 비동기로 처리.
  return NextResponse.json({ message }, { status: 200 })
}
