import { randomBytes } from 'node:crypto'
import { sendSMS } from '@/lib/sms'
import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  // Supabase Database Webhook 에 HTTP header `x-webhook-secret` 을 설정해야 한다.
  // 없으면 누구나 payload 를 위조해 업체로 SMS 를 보낼 수 있다.
  const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET
  if (!expectedSecret || req.headers.get('x-webhook-secret') !== expectedSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    // SMS dedupe key — job_post_id 기준 최초 1회만 발송
    const smsDedupeKey = `sms_sent:${jobPost.id}`

    // 1) 선점 insert — notification_logs.dedupe_key unique 인덱스로 동시 요청 중 1건만 성공.
    //    (조회 후 발송하면 동시 지원/웹훅 재시도 시 SMS 가 여러 번 나간다)
    let alreadySentSms = true
    let smsLogId: string | null = null
    if (jobPost.contact_phone) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lock, error: lockError } = await (supabase as any)
        .from('notification_logs')
        .insert({
          user_id: null,
          type: 'new_application_sms',
          title: `SMS 발송: ${companyName || jobTitle}`,
          body: `To: ${jobPost.contact_phone} — 지원자 ${applicantName}`,
          payload: {
            job_post_id: jobPost.id,
            contact_phone: jobPost.contact_phone,
            applicant_id: record.seeker_id,
          },
          dedupe_key: smsDedupeKey,
          status: 'sending',
          attempts: 1,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .maybeSingle()
      if (lockError && lockError.code !== '23505') {
        return Response.json({ error: lockError.message }, { status: 500 })
      }
      alreadySentSms = !lock
      smsLogId = (lock as { id: string } | null)?.id ?? null
    }

    // 2) 선점에 성공한 요청만 SMS 발송. claim 링크에는 번호 소유 증명용 일회용 토큰을 넣는다.
    let smsSent = false
    let smsError: string | null = null
    if (smsLogId) {
      // job_claim_tokens 는 RLS 정책 없이 service role 만 접근 (job_posts 에 두면 anon select('*') 로 노출됨)
      const claimToken = randomBytes(24).toString('base64url')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: tokenError } = await (supabase as any)
        .from('job_claim_tokens')
        .upsert({ job_post_id: jobPost.id, token: claimToken })
      if (tokenError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notification_logs').delete().eq('id', smsLogId)
        return Response.json({ error: tokenError.message }, { status: 500 })
      }
      const claimUrl = `https://hire-van.com/auth/claim?job_id=${jobPost.id}&token=${claimToken}`
      const smsBody = `[HireVan] "${jobTitle}" 공고에 지원자(${applicantName})가 있습니다. 지금 가입하고 확인하세요: ${claimUrl}`
      const smsResult = await sendSMS({ to: jobPost.contact_phone!, body: smsBody })
      smsSent = smsResult.ok
      if (!smsResult.ok) smsError = smsResult.error ?? 'SMS send failed'

      if (smsSent) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notification_logs').update({ status: 'sent' }).eq('id', smsLogId)
      } else {
        // 실패 시 선점 해제 → 다음 지원 때 재시도
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notification_logs').delete().eq('id', smsLogId)
      }
      console.log(`[webhook] SMS 발송 결과: job=${jobPost.id}, ok=${smsSent}`)
    } else {
      console.log(`[webhook] SMS 발송 생략 (중복 방지): job=${jobPost.id}`)
    }

    // 3) notification_logs 에 이력 저장 (SMS 발송 여부와 무관하게 지원 이력은 기록)
    const dedupeKey = `unclaimed_app:${jobPost.id}:${record.seeker_id}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: appLogError } = await (supabase as any)
      .from('notification_logs')
      .insert({
        user_id: null,
        type: 'unclaimed_application',
        title: `📩 [지원 발생] ${companyName || jobTitle}`,
        body: `${applicantName}님이 "${jobTitle}" 공고에 지원했습니다. 사장님께서 아직 가입하지 않으셨어요.`,
        payload: {
          job_post_id: jobPost.id,
          contact_phone: jobPost.contact_phone,
          contact_email: jobPost.contact_email,
          applicant_id: record.seeker_id,
          applicant_name: applicantName,
          deep_link: `/auth/claim?job_id=${jobPost.id}`,
          sms_already_sent: alreadySentSms,
          sms_sent: smsSent,
          sms_error: smsError,
        },
        dedupe_key: dedupeKey,
        status: 'sent',
        attempts: 1,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()
    if (appLogError && appLogError.code !== '23505') {
      console.error('[webhook] unclaimed_application 로그 저장 실패:', appLogError.message)
    }

    return Response.json({ ok: true, claimed: false, sms_sent: smsSent })
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
