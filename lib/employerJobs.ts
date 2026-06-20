/**
 * lib/employerJobs.ts
 *
 * 사장님 계정과 크롤링된 공고를 contact_phone 기준으로 자동 매칭한다.
 *
 * syncEmployerJobs(userId, userPhone)
 *   - userPhone: Supabase Auth user의 phone 메타 또는 profiles.phone
 *   - job_posts의 contact_phone과 일치하는 pending_activation 공고를
 *     employer_id = userId 로 연결하고 status를 'open'으로 변경
 */

import { supabase } from '@/lib/supabase'

export async function syncEmployerJobs(userId: string, userPhone: string | null | undefined): Promise<void> {
  if (!userId || !userPhone) return

  const phoneString = String(userPhone).replace(/[^0-9]/g, '')

  if (phoneString.length < 10) {
    console.warn('[syncEmployerJobs] phone too short, skipping:', phoneString)
    return
  }

  // 기존 연결되지 않은 공고를 userId로 연결 + status open으로 변경
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('job_posts')
    .update({
      employer_id: userId,
      status: 'open',
    })
    .eq('contact_phone', phoneString)
    .eq('status', 'pending_activation')
    .is('employer_id', null)
    .select('id, title')

  if (error) {
    console.error('[syncEmployerJobs] 매칭 실패:', error)
  } else {
    const count = (data as unknown[] | null)?.length ?? 0
    if (count > 0) {
      console.log(`[syncEmployerJobs] ${count}개 공고 매칭 완료 (user=${userId}, phone=${phoneString})`)
    }
  }
}