import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/sms'

type AnySupabase = SupabaseClient

type ApplicationRecord = {
  id: string
  job_post_id: string
  seeker_id: string
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/application-submitted
 *
 * Supabase Database Webhook 가 구독하는 엔드포인트.
 * applications 테이블에 INSERT 발생 시 호출된다.
 *
 * ## 로직
 * 1) 공고가 `pending_activation` + employer_id 가 null 인 경우
 *    → "가상 지원" 으로 간주, contact_phone 으로 SMS 발송 + 알림 로그
 * 2) 일반 employer 의 공고인 경우 (기존 로직) → admin 알림
 */
export async function POST(req: Request) {
  const payload = await req.json()
  const record = payload.record as ApplicationRecord | undefined

  if (!record?.job_post_id || !record?.seeker_id) {
    return Response.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  const supabase = requireSupabaseAdmin() as AnySupabase

  const { data: jobPost, error: jobError } = await supabase
    .from('job_posts')
    .select('id, employer_id, title, contact_phone, contact_email, source, company_name, status')
    .eq('id', record.job_post_id)
    .maybeSingle()

  if (jobError) {
    return Response.json({ error: jobError.message }, { status: 500 })
  }
  if (!jobPost) {
    return Response.json({ ok: true })
  }

  // ──────────────────────────────────────────────────────────────────
  // CASE A: pending_activation + employer_id 가 null → 가상 지원 알림
  // ──────────────────────────────────────────────────────────────────
  if (jobPost.status === 'pending_activation' && !jobPost.employer_id) {
    const { data: applicant } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', record.seeker_id)
      .maybeSingle()

    const applicantName = (applicant as { name?: string } | null)?.name ?? '지원자'
    const jobTitle = jobPost.title ?? ''
    const companyName = jobPost.company_name ?? ''
    const claimUrl = `https://hire-van.com/auth/employer-claim?job_id=${jobPost.id}`

    // 1) SMS 발송 (contact_phone)
    if (jobPost.contact_phone) {
      const smsBody = `[HireVan] "${jobTitle}" 공고에 지원자(${applicantName})가 있습니다. 지금 가입하고 확인하세요: ${claimUrl}`
      await sendSMS({ to: jobPost.contact_phone, body: smsBody })
    }

    // 2) notification_logs 에 이력 저장
    const dedupeKey = `unclaimed_app:${jobPost.id}:${record.seeker_id}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('notification_logs')
      .insert({
        user_id: '__system__',
        type: 'unclaimed_application',
        title: `📩 [지원 발생] ${companyName || jobTitle}`,
        body: `${applicantName}님이 "${jobTitle}" 공고에 지원했습니다. 사장님께서 아직 가입하지 않으셨어요.`,
        payload: {
          job_post_id: jobPost.id,
          contact_phone: jobPost.contact_phone,
          contact_email: jobPost.contact_email,
          applicant_id: record.seeker_id,
          applicant_name: applicantName,
          deep_link: `/auth/employer-claim?job_id=${jobPost.id}`,
        },
        dedupe_key: dedupeKey,
        status: 'sent',
        attempts: 1,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

    console.log(`[webhook] 가상 지원 알림: job=${jobPost.id}, seeker=${record.seeker_id}`)
    return Response.json({ ok: true, claimed: false })
  }

  // ──────────────────────────────────────────────────────────────────
  // CASE B: 기존 로직 — source === 'banjosun' 이거나 @hire-van.com 이면
  //         admin 에게 알림 전송 (호환성 유지)
  // ──────────────────────────────────────────────────────────────────
  const adminUserId = process.env.ADMIN_USER_ID
  if (!adminUserId) {
    return Response.json({ error: 'ADMIN_USER_ID is not configured.' }, { status: 503 })
  }

  const { data: employer, error: employerError } = await supabase
    .from('profiles')
    .select('id, email, name')
    .eq('id', jobPost.employer_id)
    .maybeSingle()

  if (employerError) {
    return Response.json({ error: employerError.message }, { status: 500 })
  }

  const isBanjosun =
    jobPost.source === 'banjosun' || String(employer?.email ?? '').endsWith('@hire-van.com')

  if (!isBanjosun) {
    return Response.json({ ok: true })
  }

  const { data: applicant } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('id', record.seeker_id)
    .maybeSingle()

  if (!applicant) {
    return Response.json({ ok: true })
  }

  const applicantName = (applicant as { name?: string }).name || '지원자'
  const jobTitle = jobPost.title || ''
  const companyName = employer?.name || ''
  const contactPhone = jobPost.contact_phone || ''

  const { error: notificationError } = await supabase.from('notifications').insert({
    user_id: adminUserId,
    type: 'new_application',
    title: `[새 지원자] ${jobTitle}`,
    body: `${applicantName}님이 지원했습니다.`,
    link: '/admin/notifications',
    metadata: {
      job_post_id: record.job_post_id,
      applicant_id: record.seeker_id,
      contact_phone: contactPhone,
      company_name: companyName,
      applicant_name: applicantName,
    } as Record<string, unknown>,
    read_at: null,
  })

  if (notificationError) {
    return Response.json({ error: notificationError.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}