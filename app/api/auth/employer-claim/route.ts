import { normalizePhone } from '@/lib/phone'
import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/employer-claim
 *
 * 사장님이 SMS 로 받은 링크를 통해 크롤링된 공고를 내 계정에 연결하는 API.
 * Service Role(requireSupabaseAdmin) 을 사용하므로 RLS 를 우회한다.
 *
 * ## 인증
 *   - Authorization: Bearer <access_token> — 공고를 받을 employer 본인
 *   - claim_token — SMS 로 contact_phone 에만 전달된 일회용 토큰.
 *     이 토큰을 가졌다는 것이 곧 전화번호 소유 증명이다.
 *     (job_id 나 phone 만으로는 누구나 호출할 수 있으므로 신뢰하지 않는다)
 *
 * ## 요청 본문
 *   { job_id: string, claim_token: string }
 *
 * ## 동작
 *   1) 토큰이 job_id 의 claim_token 과 일치하는지 확인
 *   2) 같은 contact_phone 의 모든 pending_activation 공고를
 *      employer_id = caller, status = 'open' 으로 업데이트
 *   3) profiles.phone 을 검증된 번호로 설정, 토큰 폐기
 *
 * ## 멱등성
 *   - UPDATE 에 employer_id IS NULL 조건이 있어 동시 요청이 와도 한 계정만 가져간다.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export async function POST(request: NextRequest) {
  const supabase = requireSupabaseAdmin()

  // 1) 호출자 인증
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { data: userRes, error: authErr } = await supabase.auth.getUser(auth.slice('Bearer '.length))
  if (authErr || !userRes?.user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  const userId = userRes.user.id

  // 2) 입력 파싱
  let body: { job_id?: string; claim_token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const { job_id, claim_token } = body
  if (!job_id || !claim_token) {
    return NextResponse.json({ error: 'job_id and claim_token are required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()
  if (!profile || profile.role !== 'employer') {
    return NextResponse.json({
      error: 'not_employer',
      message: '해당 계정은 채용자(employer) 계정이 아닙니다.',
    }, { status: 403 })
  }

  // 3) 토큰 검증 — 링크의 job 과 토큰이 일치해야 그 job 의 전화번호 소유를 인정
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow } = await (supabase as any)
    .from('job_claim_tokens')
    .select('token, job_posts(id, contact_phone)')
    .eq('job_post_id', job_id)
    .maybeSingle()

  const row = tokenRow as { token: string; job_posts: { id: string; contact_phone: string | null } | null } | null
  const job = row?.job_posts ?? null
  if (!row || !job || !timingSafeEqualStr(row.token, claim_token)) {
    return NextResponse.json({
      error: 'invalid_claim_token',
      message: '링크가 만료되었거나 올바르지 않습니다. support@hire-van.com 으로 문의해주세요.',
    }, { status: 403 })
  }

  const verifiedPhone = normalizePhone(job.contact_phone)
  if (!verifiedPhone) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
  }

  // 4) 같은 번호의 대기 공고 일괄 연결 (원자적: employer_id IS NULL 조건)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activated, error: updateError } = await (supabase as any)
    .from('job_posts')
    .update({ employer_id: userId, status: 'open' })
    .eq('contact_phone', verifiedPhone)
    .eq('status', 'pending_activation')
    .is('employer_id', null)
    .select('id, title')

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const jobs = (activated as { id: string; title: string }[] | null) ?? []

  // 토큰은 일회용 — 연결된 공고들의 토큰 폐기
  if (jobs.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('job_claim_tokens').delete().in('job_post_id', jobs.map(j => j.id))
  }

  // 5) 검증된 번호를 프로필에 기록
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('profiles').update({ phone: verifiedPhone }).eq('id', userId)

  if (jobs.length === 0) {
    return NextResponse.json({
      ok: true,
      message: '활성화할 대기 공고가 없습니다.',
      activated_count: 0,
    }, { status: 200 })
  }

  // 6) notification_logs 에 활성화 완료 로그 기록 (dedupe_key 충돌은 무시)
  const jobIds = jobs.map(j => j.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('notification_logs')
    .insert({
      user_id: userId,
      type: 'jobs_activated',
      title: `🎉 ${jobs.length}개의 공고가 활성화됐어요!`,
      body: `크롤링된 공고 ${jobs.length}개가 내 계정에 등록되었습니다. 대시보드에서 확인하고 지원자와 소통하세요.`,
      payload: {
        job_ids: jobIds,
        job_titles: jobs.map(j => j.title),
        deep_link: '/employer/dashboard',
      },
      dedupe_key: `jobs_activated:${userId}:${jobIds.sort().join(',')}`,
      status: 'queued',
      attempts: 0,
      created_at: new Date().toISOString(),
    })

  console.log(`[employer-claim] ${userId}: ${jobs.length}개 공고 활성화 완료`)

  return NextResponse.json({
    ok: true,
    user_id: userId,
    activated_count: jobs.length,
    activated_jobs: jobs.map(j => ({ id: j.id, title: j.title })),
  }, { status: 200 })
}
