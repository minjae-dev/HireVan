import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'
import { safeString, parseQuestions } from '@/lib/safe'

/**
 * lib/jobPosts.ts
 *
 * job_posts / job_post_requirements 테이블 관련 로직을 한 곳에 모았다.
 * 페이지들은 이 모듈의 함수만 호출하면 된다.
 */

export type JobPostRow = Database['public']['Tables']['job_posts']['Row']

export type JobStatus = 'open' | 'closed'

export interface JobPostWithAuthor extends JobPostRow {
  profiles: { name: string; role: string } | null
}

/** 최신순으로 open 상태의 구인글을 가져온다. */
export async function fetchOpenJobs(
  options: { location?: string } = {},
): Promise<JobPostWithAuthor[]> {
  let query = supabase
    .from('job_posts')
    .select('*, profiles(name, role)')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (options.location && options.location !== '전체') {
    query = query.ilike('location', `%${options.location}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data as unknown as JobPostWithAuthor[]) ?? []
}

/** 특정 업체의 모든 구인글 (필터 옵션 포함). */
export async function fetchEmployerJobs(
  employerId: string,
  options: { status?: JobStatus | 'all' } = {},
): Promise<JobPostRow[]> {
  if (!employerId) return []
  let query = supabase
    .from('job_posts')
    .select('*')
    .eq('employer_id', employerId)
    .order('created_at', { ascending: false })

  if (options.status && options.status !== 'all') {
    query = query.eq('status', options.status)
  }

  const { data, error } = await query
  if (error) throw error
  return (data as JobPostRow[] | null) ?? []
}

/** 구인글 한 건 (작성자 프로필 JOIN 포함) */
export async function fetchJobWithAuthor(
  jobId: string | null | undefined,
): Promise<(JobPostRow & { profiles: { name: string; bio: string } | null }) | null> {
  if (!jobId) return null
  const { data, error } = await supabase
    .from('job_posts')
    .select('*, profiles(name, bio)')
    .eq('id', jobId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return data as unknown as JobPostRow & { profiles: { name: string; bio: string } | null }
}

/** 현재 사용자가 이미 지원한 job_id Set (구직자 전용) */
export async function fetchAppliedJobIds(seekerId: string): Promise<Set<string>> {
  if (!seekerId) return new Set()
  const { data, error } = await supabase
    .from('applications')
    .select('job_post_id')
    .eq('seeker_id', seekerId)
  if (error) throw error
  const rows = (data as { job_post_id: string }[] | null) ?? []
  return new Set(rows.map(r => r.job_post_id))
}

export interface NewJobInput {
  employerId: string
  title: string
  location: string
  category?: string
  salary: string
  workHours: string
  description: string
  deadline: string | null
  requireResume?: boolean
  customQuestions?: { id: string; question: string }[]
}

/**
 * 새 구인글을 INSERT 한다.
 * - 반환값은 생성된 row. id가 포함되어 있다.
 * - 실패 시 Supabase 에러를 그대로 throw.
 */
export async function createJobPost(input: NewJobInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('job_posts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      employer_id: input.employerId,
      title: input.title,
      location: input.location,
      category: input.category ?? null,
      salary: input.salary,
      work_hours: input.workHours,
      description: input.description,
      deadline: input.deadline,
      status: 'open',
      require_resume: input.requireResume ?? false,
      custom_questions: input.customQuestions ?? [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .select('id')
    .single()
  if (error) throw error
  if (!data) throw new Error('구인글 등록에 실패했어요. 데이터가 반환되지 않았어요.')
  return data as { id: string }
}

/** 공고의 open/closed 상태를 토글한다. */
export async function toggleJobStatus(jobId: string, currentStatus: JobStatus): Promise<JobStatus> {
  const next: JobStatus = currentStatus === 'open' ? 'closed' : 'open'
  const { error } = await supabase
    .from('job_posts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: next } as any)
    .eq('id', jobId)
  if (error) throw error
  return next
}

/** 공고를 삭제한다. */
export async function deleteJobPost(jobId: string): Promise<void> {
  if (!jobId) return
  const { error } = await supabase.from('job_posts').delete().eq('id', jobId)
  if (error) throw error
}

export interface UpdateJobRequirementsInput {
  jobId: string
  requireResume: boolean
  customQuestions: { id: string; question: string }[]
}

/** 사전질문/이력서 필수 여부 등 PRO 필터 조건을 업데이트. */
export async function updateJobRequirements(input: UpdateJobRequirementsInput): Promise<void> {
  const { error } = await supabase
    .from('job_posts')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      require_resume: input.requireResume,
      custom_questions: input.customQuestions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    .eq('id', input.jobId)
  if (error) throw error
}
/**
 * job_posts.description 안에 legacy 마커 (`[이력서필수]`, `[마감:YYYY-MM-DD]`,
 * `[사전질문] A, B, C`) 가 섞여 있을 때를 대비해 안전하게 파싱한다.
 */
export interface ParsedJobDescription {
  cleanDescription: string
  requireResume: boolean
  customQuestions: { id: string; question: string }[]
  deadline: string | null
  hasLegacyMarkers: boolean
}

export function parseJobDescription(description: string | null | undefined): ParsedJobDescription {
  const raw = safeString(description)
  const resumeMarker = /\[이력서필수\]/.test(raw)
  const deadlineMatch = raw.match(/\[마감:([0-9]{4}-[0-9]{2}-[0-9]{2})\]/)
  const pregMatch = raw.match(/\[사전질문\]\s*(.+)/)

  const legacyQuestions = pregMatch
    ? pregMatch[1]
        .split(/,\s*/)
        .map(s => s.trim())
        .filter(Boolean)
        .map((q, i) => ({ id: `descq_${i + 1}`, question: q }))
    : []

  const cleanDescription = raw
    .replace(/\[이력서필수\]\s*/g, '')
    .replace(/\[마감:[^\]]*\]\s*/g, '')
    .replace(/\[사전질문\][\s\S]*$/, '')
    .replace(/\[([^\]]+)\]\s*/g, '')
    .trim()

  return {
    cleanDescription,
    requireResume: resumeMarker,
    customQuestions: legacyQuestions,
    deadline: deadlineMatch ? deadlineMatch[1] : null,
    hasLegacyMarkers: resumeMarker || !!deadlineMatch || !!pregMatch,
  }
}

/**
 * custom_questions 컬럼(우선) + description legacy 마커를 합쳐서 최종 질문 목록 반환.
 */
export function resolveCustomQuestions(
  customQuestions: { id: string; question: string }[] | null | undefined,
  description: string | null | undefined,
): { id: string; question: string }[] {
  if (Array.isArray(customQuestions) && customQuestions.length > 0) {
    return customQuestions
  }
  return parseJobDescription(description).customQuestions
}
