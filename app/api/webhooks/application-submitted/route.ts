import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSupabaseAdmin } from '@/lib/supabase-admin'

type AnySupabase = SupabaseClient

type ApplicationRecord = {
  id: string
  job_post_id: string
  seeker_id: string
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const adminUserId = process.env.ADMIN_USER_ID

  if (!adminUserId) {
    return Response.json({ error: 'ADMIN_USER_ID is not configured.' }, { status: 503 })
  }

  const payload = await req.json()
  const record = payload.record as ApplicationRecord | undefined

  if (!record?.job_post_id || !record?.seeker_id) {
    return Response.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  const supabase = requireSupabaseAdmin() as AnySupabase

  const { data: jobPost, error: jobError } = await supabase
    .from('job_posts')
    .select('id, employer_id, title, contact_phone, source')
    .eq('id', record.job_post_id)
    .maybeSingle()

  if (jobError) {
    return Response.json({ error: jobError.message }, { status: 500 })
  }
  if (!jobPost) {
    return Response.json({ ok: true })
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

  const { data: applicant, error: applicantError } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('id', record.seeker_id)
    .maybeSingle()

  if (applicantError) {
    return Response.json({ error: applicantError.message }, { status: 500 })
  }

  const applicantName = applicant?.name || '지원자'
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
    },
    read_at: null,
  })

  if (notificationError) {
    return Response.json({ error: notificationError.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
