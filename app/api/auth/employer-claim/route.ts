import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/employer-claim
 *
 * 사장님이 SMS/Email 로 받은 링크를 통해 계정을 활성화하는 API.
 * Service Role(requireSupabaseAdmin) 을 사용하므로 RLS 를 우회한다.
 *
 * ## 요청 본문
 *   { phone: string, job_id?: string }
 *
 *   - phone: 본인 인증된 전화번호 (profiles.phone 과 비교)
 *   - job_id: (선택) 특정 공고만 활성화. 없으면 phone 기준 전체
 *
 * ## 동작
 *   1) phone 으로 기존 profiles 조회 (role = 'employer')
 *   2) 없으면 → { step: 'signup_required', pending_count } 반환
 *   3) 있으면 → 해당 phone 의 모든 pending_activation 공고를
 *      employer_id = profile.id, status = 'open' 으로 업데이트
 *   4) notification_logs 에 완료 로그 기록
 *
 * ## 멱등성
 *   - 이미 claim 된 공고는 employer_id 가 이미 설정되어 있어
 *     WHERE employer_id IS NULL 조건으로 제외되므로 중복 실행 안전
 *   - status = 'open' 인 공고는 다시 open 으로 업데이트되어도 무해
 */
export async function POST(request: NextRequest) {
  const supabase = requireSupabaseAdmin()

  // 1) 입력 파싱
  let body: { phone?: string; job_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const { phone, job_id } = body
  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }

  // 2) 전화번호 정규화 (+1 prefix 제거 등)
  const normalizedPhone = phone.replace(/[^0-9]/g, '')
  if (normalizedPhone.length < 10) {
    return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })
  }

  // 3) 해당 전화번호로 이미 가입된 employer 계정이 있는지 확인
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingProfiles } = await (supabase as any)
    .from('profiles')
    .select('id, name, role')
    .eq('phone', normalizedPhone)
    .limit(1)

  const existingProfile = (existingProfiles as { id: string; name: string; role: string }[] | null)?.[0] ?? null

  if (!existingProfile) {
    // 3a) 가입되지 않은 번호 → 사장님 회원가입 유도
    //     pending 공고 개수를 알려준다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('job_posts')
      .select('id', { count: 'exact', head: true })
      .eq('contact_phone', normalizedPhone)
      .eq('status', 'pending_activation')
      .is('employer_id', null)

    return NextResponse.json({
      step: 'signup_required',
      message: `해당 번호로 등록된 계정이 없습니다. 회원가입 후 다시 시도해주세요.`,
      pending_count: count ?? 0,
    }, { status: 200 })
  }

  if (existingProfile.role !== 'employer') {
    return NextResponse.json({
      error: 'not_employer',
      message: '해당 계정은 채용자(employer) 계정이 아닙니다.',
    }, { status: 403 })
  }

  const userId = existingProfile.id

  // 4) 매칭될 pending_activation 공고 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('job_posts')
    .select('id, title')
    .eq('contact_phone', normalizedPhone)
    .eq('status', 'pending_activation')
    .is('employer_id', null)

  if (job_id) {
    query = query.eq('id', job_id)
  }

  const { data: pendingJobs, error: fetchError } = await query

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const jobs = (pendingJobs as { id: string; title: string }[]) ?? []

  if (jobs.length === 0) {
    return NextResponse.json({
      ok: true,
      message: '활성화할 대기 공고가 없습니다.',
      activated_count: 0,
    }, { status: 200 })
  }

  // 5) employer_id 업데이트 + status → 'open'
  const jobIds = jobs.map(j => j.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('job_posts')
    .update({
      employer_id: userId,
      status: 'open',
    })
    .in('id', jobIds)
    .eq('status', 'pending_activation')
    .is('employer_id', null)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // 6) notification_logs 에 활성화 완료 로그 기록
  const dedupeKey = `jobs_activated:${userId}:${normalizedPhone}`
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
      dedupe_key: dedupeKey,
      status: 'queued',
      attempts: 0,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle()

  console.log(`[employer-claim] ${userId}: ${jobs.length}개 공고 활성화 완료`)

  return NextResponse.json({
    ok: true,
    user_id: userId,
    activated_count: jobs.length,
    activated_jobs: jobs.map(j => ({ id: j.id, title: j.title })),
  }, { status: 200 })
}