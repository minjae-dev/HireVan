'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'

type CustomQuestion = {
  id: string
  question: string
}

type CustomAnswer = CustomQuestion & {
  answer: string
}

type JobPost = Database['public']['Tables']['job_posts']['Row'] & {
  profiles: { name: string; bio: string } | null
}

type Application = Database['public']['Tables']['applications']['Row'] & {
  profiles: { name: string; bio: string; visa_type: string } | null
}

type Resume = Database['public']['Tables']['resumes']['Row']

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const router = useRouter()
  const [job, setJob] = useState<JobPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [applications, setApplications] = useState<Application[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [resume, setResume] = useState<Resume | null>(null)
  const [showApplyForm, setShowApplyForm] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [applyError, setApplyError] = useState('')

  useEffect(() => {
    const fetchJob = async () => {
      const { data } = await supabase
        .from('job_posts')
        .select('*, profiles(name, bio)')
        .eq('id', id)
        .maybeSingle()
      setJob(data as unknown as JobPost | null)
      setLoading(false)
    }
    fetchJob()
  }, [id])

  useEffect(() => {
    if (!profile) return
    if (profile.role === 'seeker') {
      const checkApplied = async () => {
        const { data } = await supabase
          .from('applications')
          .select('id')
          .eq('job_post_id', id)
          .eq('seeker_id', profile.id)
          .maybeSingle()
        setApplied(!!data)
      }
      checkApplied()

      const fetchResume = async () => {
        const { data } = await supabase
          .from('resumes')
          .select('*')
          .eq('seeker_id', profile.id)
          .maybeSingle()
        setResume(data)
      }
      fetchResume()
    } else if (profile.role === 'employer' && job?.employer_id === profile.id) {
      const fetchApplications = async () => {
        const { data } = await supabase
          .from('applications')
          .select('*, profiles(name, bio, visa_type)')
          .eq('job_post_id', id)
          .order('created_at', { ascending: false })
        setApplications((data as unknown as Application[]) ?? [])
      }
      fetchApplications()
    }
  }, [profile, id, job])

  const handleApply = async () => {
    if (!user || !profile) {
      router.push('/login')
      return
    }
    if (!job) return

    const customQuestions = parseCustomQuestions(job.custom_questions)

    if (job.require_resume && !resume) {
      setApplyError('지원하려면 이력서 등록이 필요합니다.')
      return
    }

    if (customQuestions.length > 0 && !showApplyForm) {
      setShowApplyForm(true)
      setApplyError('')
      return
    }

    const customAnswers: CustomAnswer[] = customQuestions.map(question => ({
      ...question,
      answer: (answers[question.id] ?? '').trim(),
    }))

    if (customAnswers.some(answer => !answer.answer)) {
      setApplyError('사전 질문 답변을 모두 입력해주세요.')
      return
    }

    setApplying(true)
    setApplyError('')
    const { error } = await supabase.from('applications').insert({
      job_post_id: id,
      seeker_id: user.id,
      resume_url: job.require_resume ? resume?.file_url ?? null : resume?.file_url ?? null,
      custom_answers: customAnswers,
    })
    if (!error) setApplied(true)
    if (error) setApplyError('지원 처리에 실패했습니다. 잠시 후 다시 시도해주세요.')
    setApplying(false)
  }

  const handleApplicationStatus = async (appId: string, status: 'accepted' | 'rejected', seekerId: string) => {
    if (!user || !job) return
    setActionLoading(appId)

    await supabase
      .from('applications')
      .update({ status })
      .eq('id', appId)

    if (status === 'accepted') {
      const existing = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('job_post_id', job.id)
        .eq('seeker_id', seekerId)
        .maybeSingle()

      if (!existing.data) {
        await supabase.from('chat_rooms').insert({
          job_post_id: job.id,
          employer_id: user.id,
          seeker_id: seekerId,
        })
      }
    }

    setApplications(prev =>
      prev.map(a => (a.id === appId ? { ...a, status } : a))
    )
    setActionLoading(null)
  }

  const handleToggleStatus = async () => {
    if (!job) return
    const newStatus = job.status === 'open' ? 'closed' : 'open'
    await supabase.from('job_posts').update({ status: newStatus }).eq('id', job.id)
    setJob({ ...job, status: newStatus })
  }

  const handleDelete = async () => {
    if (!confirm('구인글을 삭제하시겠습니까?')) return
    await supabase.from('job_posts').delete().eq('id', id)
    router.push('/jobs/my')
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-4xl mb-3">😕</p>
        <p className="text-sm">구인글을 찾을 수 없습니다.</p>
      </div>
    )
  }

  const isOwner = profile?.id === job.employer_id
  const isSeeker = profile?.role === 'seeker'
  const customQuestions = parseCustomQuestions(job.custom_questions)
  const needsResume = job.require_resume
  const cannotApplyBecauseResume = isSeeker && needsResume && !resume

  return (
    <div>
      <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        ← 목록으로
      </Link>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{job.title}</h1>
          <span
            className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
              job.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {job.status === 'open' ? '모집중' : '마감'}
          </span>
        </div>

        <p className="text-sm text-gray-500 font-medium mb-4">{job.profiles?.name ?? '업체'}</p>

        <div className="flex flex-wrap gap-2 mb-5">
          {job.location && <InfoChip icon="📍" text={job.location} />}
          {job.salary && <InfoChip icon="💰" text={job.salary} />}
          {job.work_hours && <InfoChip icon="🕐" text={job.work_hours} />}
        </div>

        {job.description && (
          <div className="border-t border-gray-100 pt-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">상세 내용</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{job.description}</p>
          </div>
        )}

        {(needsResume || customQuestions.length > 0) && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">지원 조건</h2>
            <div className="flex flex-col gap-2">
              {needsResume && (
                <div className="rounded-xl bg-orange-50 px-4 py-3">
                  <p className="text-sm font-semibold text-orange-700">이력서 첨부 필수</p>
                  <p className="text-xs text-orange-600/80 mt-0.5">프로필에 등록된 이력서가 함께 제출됩니다.</p>
                </div>
              )}
              {customQuestions.length > 0 && (
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800">사전 질문 {customQuestions.length}개</p>
                  <div className="mt-2 space-y-1">
                    {customQuestions.map((question, index) => (
                      <p key={question.id} className="text-xs text-gray-500">
                        {index + 1}. {question.question}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {job.profiles?.bio && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">업체 소개</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{job.profiles.bio}</p>
          </div>
        )}

        <p className="text-xs text-gray-300 mt-4">
          {new Date(job.created_at).toLocaleDateString('ko-KR')} 등록
        </p>
      </div>

      {/* Seeker: Apply button */}
      {isSeeker && job.status === 'open' && (
        <div className="mb-4">
          {cannotApplyBecauseResume && (
            <div className="mb-3 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
              <p className="text-sm font-semibold text-orange-700">지원하려면 이력서 등록이 필요합니다.</p>
              <p className="text-xs text-orange-600/80 mt-1">프로필에서 이력서를 업로드한 뒤 다시 지원해주세요.</p>
              <Link
                href="/profile"
                className="mt-3 inline-flex rounded-xl bg-white px-4 py-2 text-xs font-bold text-orange-600 shadow-sm"
              >
                프로필에서 등록하기
              </Link>
            </div>
          )}

          {showApplyForm && customQuestions.length > 0 && !applied && (
            <div className="mb-3 rounded-2xl border border-gray-100 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">사전 질문 답변</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">업체가 확인할 수 있도록 모든 질문에 답변해주세요.</p>
              <div className="space-y-4">
                {customQuestions.map((question, index) => (
                  <div key={question.id}>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-800">
                      {index + 1}. {question.question}
                    </label>
                    <input
                      type="text"
                      value={answers[question.id] ?? ''}
                      onChange={event => setAnswers(prev => ({ ...prev, [question.id]: event.target.value }))}
                      placeholder="답변을 입력해주세요"
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {applyError && (
            <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{applyError}</p>
          )}

          <button
            onClick={handleApply}
            disabled={applied || applying || cannotApplyBecauseResume}
            className="w-full text-white font-semibold py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: applied || cannotApplyBecauseResume ? '#9ca3af' : 'var(--brand)' }}
          >
            {applying ? '지원 중...' : applied ? '이미 지원했습니다' : showApplyForm && customQuestions.length > 0 ? '답변 제출하고 지원하기' : '지원하기'}
          </button>
        </div>
      )}

      {/* Owner: Manage buttons */}
      {isOwner && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={handleToggleStatus}
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all active:scale-95"
          >
            {job.status === 'open' ? '모집 마감하기' : '다시 모집하기'}
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 py-3 rounded-2xl border border-red-200 text-sm font-medium text-red-500 bg-white hover:bg-red-50 transition-all active:scale-95"
          >
            삭제
          </button>
        </div>
      )}

      {/* Owner: Applicant list */}
      {isOwner && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">
            지원자 목록 <span className="text-orange-500">({applications.length})</span>
          </h2>
          {applications.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">아직 지원자가 없습니다</p>
          ) : (
            <div className="flex flex-col gap-3">
              {applications.map(app => (
                <div key={app.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{app.profiles?.name ?? '이름 없음'}</p>
                      {app.profiles?.visa_type && (
                        <p className="text-xs text-gray-400">{app.profiles.visa_type}</p>
                      )}
                    </div>
                    <StatusBadge status={app.status} />
                  </div>
                  {app.profiles?.bio && (
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{app.profiles.bio}</p>
                  )}
                  {renderApplicationDetails(app)}
                  {app.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApplicationStatus(app.id, 'accepted', app.seeker_id)}
                        disabled={actionLoading === app.id}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
                        style={{ backgroundColor: 'var(--brand)' }}
                      >
                        수락 + 채팅
                      </button>
                      <button
                        onClick={() => handleApplicationStatus(app.id, 'rejected', app.seeker_id)}
                        disabled={actionLoading === app.id}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold text-red-500 border border-red-200 bg-white hover:bg-red-50 transition-all active:scale-95 disabled:opacity-60"
                      >
                        거절
                      </button>
                    </div>
                  )}
                  {app.status === 'accepted' && (
                    <Link
                      href="/chat"
                      className="block text-center py-2 rounded-xl text-xs font-semibold text-orange-500 border border-orange-200 bg-orange-50 hover:bg-orange-100 transition-all"
                    >
                      채팅방으로 이동
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function parseCustomQuestions(value: Database['public']['Tables']['job_posts']['Row']['custom_questions']): CustomQuestion[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const question = typeof item.question === 'string' ? item.question.trim() : ''
      const id = typeof item.id === 'string' ? item.id : `q${index + 1}`
      return question ? { id, question } : null
    })
    .filter((item): item is CustomQuestion => item !== null)
    .slice(0, 3)
}

function parseCustomAnswers(value: Database['public']['Tables']['applications']['Row']['custom_answers']): CustomAnswer[] {
  if (!Array.isArray(value)) return []

  return value
    .map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const id = typeof item.id === 'string' ? item.id : ''
      const question = typeof item.question === 'string' ? item.question.trim() : ''
      const answer = typeof item.answer === 'string' ? item.answer.trim() : ''
      return question && answer ? { id, question, answer } : null
    })
    .filter((item): item is CustomAnswer => item !== null)
}

function renderApplicationDetails(app: Application) {
  const customAnswers = parseCustomAnswers(app.custom_answers)

  if (!app.resume_url && customAnswers.length === 0) return null

  return (
    <div className="mb-3 space-y-3 rounded-xl bg-gray-50 p-3">
      {app.resume_url && (
        <a
          href={app.resume_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-xl bg-white px-3 py-2 text-xs font-bold text-orange-600 shadow-sm"
        >
          제출 이력서 보기
        </a>
      )}
      {customAnswers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-gray-700">사전 질문 답변</p>
          {customAnswers.map((answer, index) => (
            <div key={`${answer.id}-${index}`} className="rounded-xl bg-white px-3 py-2">
              <p className="text-xs font-semibold text-gray-700">{index + 1}. {answer.question}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{answer.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoChip({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-3 py-1.5">
      <span>{icon}</span>
      <span>{text}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '검토중', cls: 'bg-yellow-100 text-yellow-700' },
    accepted: { label: '수락됨', cls: 'bg-green-100 text-green-700' },
    rejected: { label: '거절됨', cls: 'bg-red-100 text-red-500' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  )
}
