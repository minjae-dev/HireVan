import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/notify/pro-activated
 *
 * employer 가 첫 공고 등록으로 Pro 체험이 활성화될 때,
 * notification_logs 에 1 row 를 INSERT 해서 인앱 알림함에 표시한다.
 * (선택적 푸시는 chat_push 워커가 status='queued' → 'sending' 으로 자동 처리)
 *
 * 멱등성:
 *   - dedupe_key = 'pro_trial_activated:{user_id}:{job_id}' 로 unique 제약 가정.
 *   - 동일 (user, job) 조합으로 두 번 호출되어도 한 번만 발송된다.
 *     (unique 위반은 무시하고 200 반환)
 *
 * Request:
 *   { job_id: string }
 *   Authorization: Bearer <access_token>
 *
 * Response 200:
 *   { ok: true, log_id?: string, deduped: boolean }
 */
export async function POST(request: NextRequest) {
  const supabase = requireSupabaseAdmin()

  // 1) 인증
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tokenStr = auth.slice('Bearer '.length)
  const { data: userRes, error: authErr } = await supabase.auth.getUser(tokenStr)
  if (authErr || !userRes?.user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  const userId = userRes.user.id

  // 2) 입력 파싱
  let body: { job_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const jobId = body.job_id
  if (!jobId) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  }

  // 3) dedupe_key 로 멱등 INSERT.
  //    notification_logs.dedupe_key 는 text 컬럼 + unique 인덱스 가정.
  //    충돌(23505)이면 "이미 발송 큐에 있음" 으로 보고 200 + deduped:true 반환.
  const dedupeKey = `pro_trial_activated:${userId}:${jobId}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('notification_logs')
    .insert({
      user_id: userId,
      type: 'pro_trial_activated',
      title: '🎉 Pro 플랜이 활성화됐어요!',
      body: '공고가 등록되었습니다. 앞으로 30일간 HireVan Pro의 모든 기능을 무료로 사용하실 수 있어요.',
      payload: {
        // 클라이언트 알림 카드에서 사용할 deep_link / 카테고리 힌트
        deep_link: '/employer/dashboard',
        // 푸시 워커가 notification type 으로 사용
        notification_type: 'pro_trial_activated',
        // dedupe 용 키
        job_id: jobId,
      },
      dedupe_key: dedupeKey,
      status: 'queued',
      attempts: 0,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // 23505 = unique_violation. 이미 같은 dedupe_key 가 있으면 deduped 처리.
    const code = (error as { code?: string }).code
    if (code === '23505') {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 })
    }
    console.error('[notify/pro-activated] insert error', error)
    return NextResponse.json(
      { error: 'insert_failed', detail: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json(
    { ok: true, log_id: (data as { id: string } | null)?.id ?? null, deduped: false },
    { status: 200 },
  )
}
