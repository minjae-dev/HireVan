'use client'

import { useAuth } from '@/lib/auth-context'
import type { Database, Json } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type CustomQuestion = {
  id: string
  question: string
}

type CustomAnswer = {
  id: string
  question: string
  answer: string
}

type JobPost = Database['public']['Tables']['job_posts']['Row'] & {
  profiles?: { name: string; bio: string } | null
  company_name?: string | null
}

type Application = Database['public']['Tables']['applications']['Row'] & {
  profiles: { name: string; bio: string; visa_type: string; no_show_count: number } | null
}

type Resume = Database['public']['Tables']['resumes']['Row']

type AIScore = {
  score: number
  summary: string[]
}

// ── Simulated AI matching engine (MVP) ──
function computeAIScore(job: JobPost, app: Application, customAnswers: CustomAnswer[]): AIScore {
  let score = 50
  const points: string[] = []

  // Bonus for resume attached
  if (app.resume_url) {
    score += 10
    points.push('이력서 제출 완료')
  }

  // Bonus for filled custom answers
  if (customAnswers.length > 0) {
    score += 10
    const allAnswered = customAnswers.every(a => a.answer.trim().length > 0)
    if (allAnswered) {
      score += 5
      points.push(`사전 질문 ${customAnswers.length}개 모두 성실히 답변`)
    } else {
      points.push(`사전 질문 ${customAnswers.filter(a => a.answer.trim()).length}/${customAnswers.length}개 답변`)
    }

    // Extract key snippets from answers
    const longAnswers = customAnswers.filter(a => a.answer.trim().length > 15)
    longAnswers.slice(0, 2).forEach(a => {
      const snippet = a.answer.trim().slice(0, 40)
      points.push(`"${snippet}..."`)
    })
  }

  // Bonus for bio presence
  if (app.profiles?.bio && app.profiles.bio.length > 20) {
    score += 10
    const bioSnippet = app.profiles.bio.slice(0, 40)
    points.push(`자기소개: "${bioSnippet}..."`)
  }

  // Bonus for visa info
  if (app.profiles?.visa_type) {
    score += 5
    points.push(`비자: ${app.profiles.visa_type}`)
  }

  // Clamp
  score = Math.min(100, Math.max(0, score))

  return { score, summary: points.slice(0, 3) }
}

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
  const [answers, setAnswers] = useState<{ [key: string]: string }>({})
  const [applyError, setApplyError] = useState('')
  const [showProModal, setShowProModal] = useState(false)
  const [showAIDraftModal, setShowAIDraftModal] = useState(false)
  const [aiDraftMessage, setAiDraftMessage] = useState('')
  const [aiDraftAppId, setAiDraftAppId] = useState<string | null>(null)
  const [aiDraftSeekerId, setAiDraftSeekerId] = useState<string | null>(null)

  useEffect(() => {
    const fetchJob = async () => {
      const { data } = await supabase
        .from('job_posts')
        .select('*, profiles(name, bio)')
        .eq('id', id)
        .maybeSingle()
      const jobData = data as unknown as JobPost | null
      setJob(jobData)
      setLoading(false)
      if (jobData) {
        const fromDb = parseCustomQuestions(jobData.custom_questions)
        const desc = jobData.description ?? ''
        const pregMatch = desc.match(/\[사전질문\]\s*(.+)/)
        const fromDesc = pregMatch
          ? pregMatch[1].split(/,\s*/).filter(Boolean).map((q, i) => ({ id: `descq_${i + 1}`, question: q.trim() }))
          : []
        const questions = fromDb.length > 0 ? fromDb : fromDesc
        const initialized: { [questionId: string]: string } = {}
        for (const q of questions) {
          initialized[q.id] = ''
        }
        setAnswers(initialized)
      }
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
          .select('*, profiles(name, bio, visa_type, no_show_count)')
          .eq('job_post_id', id)
          .order('created_at', { ascending: false })
        setApplications((data as unknown as Application[]) ?? [])
      }
      fetchApplications()
    }
  }, [profile, id, job])

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const handleApplicationStatus = async (appId: string, status: 'accepted' | 'rejected', seekerId: string) => {
    if (!user || !job) return
    setActionLoading(appId)

    if (status === 'accepted') {
      // For PRO users: show AI draft modal first
      if (isPro) {
        const appData = applications.find(a => a.id === appId)
        const customAnswers = parseCustomAnswers(appData?.custom_answers ?? null)
        const seekerName = appData?.profiles?.name ?? '지원자'
        const keySnippet = customAnswers.length > 0
          ? customAnswers[0].answer.trim().slice(0, 30)
          : '지원 내용'

        const draft = `안녕하세요 ${seekerName}님! HireVan을 통해 지원해주신 [${job.title}] 공고 검토 후, 경력이 인상 깊어 면접을 제안드리고자 연락드렸습니다. 특히 사전질문에서 작성해주신 "${keySnippet}..." 부분이 저희 방향성과 잘 맞는다고 판단되었습니다. 하단의 면접 조율 스케줄러를 통해 편하신 일정을 선택해주시면 감사하겠습니다!`

        setAiDraftMessage(draft)
        setAiDraftAppId(appId)
        setAiDraftSeekerId(seekerId)
        setShowAIDraftModal(true)
        setActionLoading(null)
        return
      }

      // FREE users: immediate redirect with default message
      await proceedAcceptance(appId, seekerId, null)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('applications')
      .update({ status })
      .eq('id', appId)

    setApplications(prev =>
      prev.map(a => (a.id === appId ? { ...a, status } : a))
    )
    setActionLoading(null)
  }

  // Shared acceptance logic
  const proceedAcceptance = async (appId: string, seekerId: string, customMessage: string | null) => {
    if (!user || !job) return
    const appData = applications.find(a => a.id === appId)
    const { data: existing } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('job_post_id', job.id)
      .eq('seeker_id', seekerId)
      .maybeSingle()

    let chatRoomId: string
    if ((existing as unknown as { id: string } | null)?.id) {
      chatRoomId = (existing as unknown as { id: string }).id
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newRoom, error: roomError } = await (supabase as any)
        .from('chat_rooms')
        .insert({
          job_post_id: job.id,
          employer_id: user.id,
          seeker_id: seekerId,
        })
        .select('id')
        .single()
      if (roomError || !newRoom) {
        setActionLoading(null)
        return
      }
      chatRoomId = (newRoom as { id: string }).id
    }

    const message = customMessage ?? (() => {
      const resumeUrl = appData?.resume_url ?? '미첨부'
      const customAnswers = parseCustomAnswers(appData?.custom_answers ?? null)
      const qaText = customAnswers.length > 0
        ? '\n' + customAnswers.map(a => `❓ Q: ${a.question}\n➡️ A: ${a.answer}`).join('\n\n')
        : ''
      return `📢 지원이 수락되었습니다! 대화를 시작합니다.\n\n📄 이력서 URL: ${resumeUrl}${qaText}`
    })()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('applications').update({ status: 'accepted' }).eq('id', appId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('messages').insert({
      chat_room_id: chatRoomId,
      sender_id: user.id,
      content: message,
    })

    router.push(`/chat/${chatRoomId}`)
  }

  const handleSendAIDraft = async () => {
    if (!aiDraftAppId || !aiDraftSeekerId) return
    setActionLoading(aiDraftAppId)
    setShowAIDraftModal(false)
    await proceedAcceptance(aiDraftAppId, aiDraftSeekerId, aiDraftMessage.trim())
    setAiDraftMessage('')
    setAiDraftAppId(null)
    setAiDraftSeekerId(null)
  }

  const handleToggleStatus = async () => {
    if (!job) return
    const newStatus = job.status === 'open' ? 'closed' : 'open'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('job_posts').update({ status: newStatus }).eq('id', job.id)
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
  const isPro = profile?.plan === 'pro'

  const descriptionText = job.description ?? ''
  const hasResumeMarker = /\[이력서필수\]/.test(descriptionText)
  const needsResume = job.require_resume === true || hasResumeMarker

  const pregMatch = descriptionText.match(/\[사전질문\]\s*(.+)/)
  const pregQuestionsFromDesc: CustomQuestion[] = pregMatch
    ? pregMatch[1]
        .split(/,\s*/)
        .filter(Boolean)
        .map((q, i) => ({ id: `descq_${i + 1}`, question: q.trim() }))
    : []
  const customQuestions =
    parseCustomQuestions(job.custom_questions).length > 0
      ? parseCustomQuestions(job.custom_questions)
      : pregQuestionsFromDesc

  const cleanDescription = descriptionText
    .replace(/\[이력서필수\]\s*/g, '')
    .replace(/\[마감:[^\]]*\]\s*/g, '')
    .replace(/\[사전질문\][\s\S]*$/, '')
    .replace(/\[([^\]]+)\]\s*/g, '')
    .trim()

  const cannotApplyBecauseResume = isSeeker && needsResume && !resume
  const isQuestionsValid =
    customQuestions.length === 0 ||
    customQuestions.every(q => (answers[q.id] ?? '').trim() !== '')
  const canSubmit = isQuestionsValid && !applying

  // ── handleApply ──
  const handleApplyWrapper = async () => {
    if (!user || !profile) {
      router.push('/login')
      return
    }
    if (!job) return

    const { data: existingApp } = await supabase
      .from('applications')
      .select('id')
      .eq('job_post_id', id)
      .eq('seeker_id', profile.id)
      .maybeSingle()

    if (existingApp) {
      setApplyError('이미 지원한 구인글입니다.')
      setApplied(true)
      return
    }

    if (needsResume && !resume) {
      setApplyError('이 구인글은 이력서 등록이 필수입니다. 프로필에서 이력서를 업로드해주세요.')
      return
    }

    const customAnswers: CustomAnswer[] = customQuestions.map(q => ({
      id: q.id,
      question: q.question,
      answer: (answers[q.id] ?? '').trim(),
    }))

    const unanswered = customAnswers.filter(a => !a.answer)
    if (unanswered.length > 0) {
      setApplyError(`모든 질문에 답해야 지원할 수 있습니다. (${unanswered.length}개 미답변)`)
      return
    }

    setApplying(true)
    setApplyError('')

    const resumeUrl = resume?.file_url ?? null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: appError } = await (supabase as any)
      .from('applications')
      .insert({
        job_post_id: id,
        seeker_id: profile.id,
        status: 'pending',
        resume_url: resumeUrl || undefined,
        custom_answers: customAnswers.length > 0 ? customAnswers : undefined,
      })

    if (appError) {
      if (appError.code === '23505') {
        setApplyError('이미 지원한 구인글입니다.')
        setApplied(true)
      } else {
        setApplyError('지원 처리에 실패했습니다. 잠시 후 다시 시도해주세요.')
      }
      setApplying(false)
      return
    }

    setApplied(true)
    setApplying(false)
  }

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
              job.status === 'open' || job.status === 'pending_activation' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {job.status === 'open' || job.status === 'pending_activation' ? '모집중' : '마감'}
          </span>
        </div>

        <p className="text-sm text-gray-500 font-medium mb-4">{job.company_name ?? job.profiles?.name ?? '업체'}</p>

        <div className="flex flex-wrap gap-2 mb-5">
          {job.location && <InfoChip icon="📍" text={job.location} />}
          {job.salary && <InfoChip icon="💰" text={job.salary} />}
          {job.work_hours && <InfoChip icon="🕐" text={job.work_hours} />}
        </div>

        {cleanDescription && (
          <div className="border-t border-gray-100 pt-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">상세 내용</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{cleanDescription}</p>
          </div>
        )}

        {needsResume && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">지원 조건</h2>
            <div className="rounded-xl bg-orange-50 px-4 py-3">
              <p className="text-sm font-semibold text-orange-700">이력서 첨부 필수</p>
              <p className="text-xs text-orange-600/80 mt-0.5">프로필에 등록된 이력서가 함께 제출됩니다.</p>
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

      {/* Seeker: Apply section */}
      {isSeeker && (job.status === 'open' || job.status === 'pending_activation') && (
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

          {customQuestions.length > 0 && !applied && (
            <div className="mb-3 rounded-2xl border border-gray-100 bg-white p-5">
              <h2 className="text-base font-bold text-gray-900">사전 질문 답변</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">업체가 확인할 수 있도록 모든 질문에 답변해주세요.</p>
              <div className="space-y-4">
                {customQuestions.map((question, index) => (
                  <div key={question.id} className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-gray-700">
                      {index + 1}. {question.question}
                    </label>
                    <textarea
                      value={answers[question.id] ?? ''}
                      onChange={e => handleAnswerChange(question.id, e.target.value)}
                      placeholder="답변을 입력해주세요."
                      rows={3}
                      className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
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
            onClick={handleApplyWrapper}
            disabled={!canSubmit || applied || cannotApplyBecauseResume}
            className={`w-full font-bold py-4 rounded-2xl transition-all mt-6 ${
              canSubmit && !applied && !cannotApplyBecauseResume
                ? 'bg-orange-500 text-white cursor-pointer hover:bg-orange-600 active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {applying
              ? '지원 중...'
              : applied
              ? '이미 지원했습니다'
              : customQuestions.length > 0 && !isQuestionsValid
              ? '사전 질문을 모두 입력해주세요'
              : '지원하기'}
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
              {applications.map(app => {
                const customAnswers = parseCustomAnswers(app.custom_answers)
                const aiScore = job ? computeAIScore(job, app, customAnswers) : null
                return (
                  <div key={app.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{app.profiles?.name ?? '이름 없음'}</p>
                        {app.profiles?.visa_type && (
                          <p className="text-xs text-gray-400">{app.profiles.visa_type}</p>
                        )}
                        {(app.profiles?.no_show_count ?? 0) > 0 && (
                          <p className="text-xs font-semibold text-red-500 mt-1">🚨 노쇼 이력 {app.profiles?.no_show_count ?? 0}회</p>
                        )}
                      </div>
                      <StatusBadge status={app.status} />
                    </div>
                    {app.profiles?.bio && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3 leading-relaxed">{app.profiles.bio}</p>
                    )}

                    {/* ── AI Candidate Insights ── */}
                    {aiScore && (
                      <div className="mb-3 relative">
                        {/* Blur overlay for FREE plan */}
                        {!isPro && (
                          <div
                            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl cursor-pointer"
                            onClick={() => setShowProModal(true)}
                          >
                            <span className="text-lg mb-1">🔒</span>
                            <span className="text-xs font-semibold text-gray-500">Unlock AI Matching with PRO</span>
                          </div>
                        )}
                        <div className={`rounded-xl p-3 ${isPro ? 'bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100' : ''}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm">🤖</span>
                            <span className="text-xs font-bold text-gray-700">AI Candidate Insights</span>
                            {isPro && (
                              <span
                                className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                                  aiScore.score >= 80 ? 'bg-green-100 text-green-700' :
                                  aiScore.score >= 50 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-600'
                                }`}
                              >
                                {aiScore.score}% Match
                              </span>
                            )}
                          </div>

                          {isPro && (
                            <div className="space-y-1">
                              {aiScore.summary.map((point, pi) => (
                                <div key={pi} className="flex items-start gap-1.5">
                                  <span className="text-orange-400 text-xs mt-0.5">✦</span>
                                  <span className="text-xs text-gray-600 leading-relaxed">{point}</span>
                                </div>
                              ))}
                              {aiScore.summary.length === 0 && (
                                <p className="text-xs text-gray-400">추가 정보가 충분하지 않습니다.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
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
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── AI Draft Modal ── */}
      {showAIDraftModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3 sm:items-center sm:pb-0">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-orange-500">AI 면접 제안 초안</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">AI가 생성한 초대장을 확인하세요</h2>
                <p className="mt-1 text-sm text-gray-500">원하는 대로 수정한 뒤 전송할 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAIDraftModal(false)}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-500"
              >
                닫기
              </button>
            </div>
            <textarea
              value={aiDraftMessage}
              onChange={e => setAiDraftMessage(e.target.value)}
              rows={8}
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const appData = aiDraftAppId ? applications.find(a => a.id === aiDraftAppId) : null
                  const customAnswers = parseCustomAnswers(appData?.custom_answers ?? null)
                  const seekerName = appData?.profiles?.name ?? '지원자'
                  const keySnippet = customAnswers.length > 0
                    ? customAnswers[0].answer.trim().slice(0, 30)
                    : '지원 내용'
                  setAiDraftMessage(`안녕하세요 ${seekerName}님! HireVan을 통해 지원해주신 [${job?.title ?? ''}] 공고 검토 후, 경력이 인상 깊어 면접을 제안드리고자 연락드렸습니다. 특히 사전질문에서 작성해주신 "${keySnippet}..." 부분이 저희 방향성과 잘 맞는다고 판단되었습니다. 하단의 면접 조율 스케줄러를 통해 편하신 일정을 선택해주시면 감사하겠습니다!`)
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 transition-all active:scale-95"
              >
                템플릿 초기화
              </button>
              <button
                onClick={handleSendAIDraft}
                disabled={!aiDraftMessage.trim()}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                수정 완료 및 전송
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upgrade to PRO Modal ── */}
      {showProModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-3 pb-3 sm:items-center sm:pb-0">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-orange-500">PRO 업그레이드</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">🔒 AI 매칭 기능을 사용하려면</h2>
                <p className="mt-1 text-sm text-gray-500">PRO 플랜으로 업그레이드하면 AI가 분석한 맞춤 지원자 평가를 확인할 수 있습니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowProModal(false)}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-500"
              >
                닫기
              </button>
            </div>
            <Link
              href="/profile"
              className="block w-full rounded-2xl py-3.5 font-semibold text-white text-center transition-all active:scale-95"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              PRO 업그레이드하기
            </Link>
          </div>
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