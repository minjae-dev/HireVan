import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/chat/rooms
 *
 * 구직자가 "이 jobs 에 지원하면서 채팅 시작하기" 또는
 * employer가 "지원자 리스트에서 채팅 시작"을 누를 때 호출.
 *
 * Request:
 *   { job_post_id: string, seeker_id: string }
 *
 * Response 200:
 *   { room: { id, employer_id, seeker_id, job_post_id, created_at }, created: boolean }
 *
 * ## 동작
 *  1) caller = auth.uid() 이고, employer 또는 seeker 본인만 호출 가능
 *  2) (employer_id, seeker_id, job_post_id) 가 동일한 기존 chat_rooms 가 있으면
 *     그 row 를 그대로 반환 (멱등성) — 단, 같은 (employer, seeker, job) 조합이
 *     여러 개 있을 수 없도록 UNIQUE 제약을 추가하는 것이 안전.
 *  3) 없으면 INSERT → DB 트리거 `notify_chat_room_created` 가 자동으로
 *     notification_logs 2건 + pg_notify 'chat_push' 2회 발행.
 *     → 워커가 LISTEN 으로 받아 푸시 전송.
 *  4) status 200 / 201 로 room + created 플래그 반환.
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
  const callerId = userRes.user.id

  // 2) 입력 파싱 + 검증
  let body: { job_post_id?: string; seeker_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const { job_post_id: jobPostId, seeker_id: seekerId } = body
  if (!jobPostId || !seekerId) {
    return NextResponse.json(
      { error: 'job_post_id and seeker_id are required' },
      { status: 400 },
    )
  }

  // 3) caller 가 employer 또는 seeker 본인인지 확인
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', callerId)
    .maybeSingle()
  if (!callerProfile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 403 })
  }
  const callerRole = (callerProfile as { role: 'employer' | 'seeker' }).role

  let employerId: string
  if (callerRole === 'employer') {
    employerId = callerId
  } else if (callerRole === 'seeker') {
    if (callerId !== seekerId) {
      return NextResponse.json(
        { error: 'seekers can only create their own rooms' },
        { status: 403 },
      )
    }
    // job_post 의 employer_id 를 알아내야 함
    const { data: job } = await supabase
      .from('job_posts')
      .select('employer_id')
      .eq('id', jobPostId)
      .maybeSingle()
    if (!job) {
      return NextResponse.json({ error: 'job_not_found' }, { status: 404 })
    }
    employerId = (job as { employer_id: string }).employer_id
  } else {
    return NextResponse.json({ error: 'unsupported_role' }, { status: 403 })
  }

  // 4) 중복 room 조회 (idempotent)
  const { data: existing } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('employer_id', employerId)
    .eq('seeker_id', seekerId)
    .eq('job_post_id', jobPostId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ room: existing, created: false }, { status: 200 })
  }

  // 5) INSERT — 트리거가 notification_logs + pg_notify 발행
  const { data: room, error: insertErr } = await supabase
    .from('chat_rooms')
    .insert({
      employer_id: employerId,
      seeker_id: seekerId,
      job_post_id: jobPostId,
    })
    .select('*')
    .single()

  if (insertErr || !room) {
    return NextResponse.json(
      { error: 'room_create_failed', detail: insertErr?.message },
      { status: 500 },
    )
  }

  // 6) 발신자는 자신과의 채팅방 알림을 받으면 안 되므로,
  //    자기 자신에 대한 log 만 'skipped' 로 마킹하고 싶다면
  //    별도 RPC 가 필요하다. 현재 트리거는 발신자도 발송 대상으로 두지만
  //    push_tokens 가 없으면 자연스럽게 skip 됨.
  return NextResponse.json({ room, created: true }, { status: 201 })
}
