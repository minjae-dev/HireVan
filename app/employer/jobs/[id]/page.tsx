'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'

type CustomAnswer = {
  id: string
  question: string
  answer: string
}

type JobPost = Database['public']['Tables']['job_posts']['Row']
type Application = Database['public']['Tables']['applications']['Row'] & {
  profiles: { name: string; bio: string; visa_type: string } | null
}

export default function EmployerJobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const router = useRouter()

  const [job, setJob] = useState<JobPost | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    title: '',
    location: '',
    salary: '',
    work_hours: '',
    description: '',
  })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchJobAndApplications = async () => {
      setLoading(true)

      // 구인글 정보 조회
      const { data: jobData } = await supabase
        .from('job_posts')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      setJob(jobData as JobPost | null)

      // 권한 확인
      if (jobData && jobData.employer_id !== user?.id) {
        router.push('/employer/jobs')
        return
      }

      // 지원자 목록 조회
      const { data: appData } = await supabase
        .from('applications')
        .select('*, profiles(name, bio, visa_type)')
        .eq('job_post_id', id)
        .order('created_at', { ascending: false })

      setApplications((appData as unknown as Application[]) ?? [])

      if (jobData) {
        setEditForm({
          title: jobData.title,
          location: jobData.location,
          salary: jobData.salary,
          work_hours: jobData.work_hours,
          description: jobData.description,
        })
      }

      setLoading(false)
    }

    if (user) fetchJobAndApplications()
  }, [id, user, router])

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setEditForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveEdit = async () => {
    if (!job) return
    setActionLoading('edit')
    setError('')

    const { error: updateError } = await supabase
      .from('job_posts')
      .update(editForm)
      .eq('id', job.id)

    if (updateError) {
      setError('수정 실패')
      setActionLoading(null)
      return
    }

    setJob({ ...job, ...editForm })
    setIsEditing(false)
    setActionLoading(null)
  }

  const handleToggleStatus = async () => {
    if (!job) return
    setActionLoading('status')

    const newStatus = job.status === 'open' ? 'closed' : 'open'
    await supabase.from('job_posts').update({ status: newStatus }).eq('id', job.id)

    setJob({ ...job, status: newStatus })
    setActionLoading(null)
  }

  const handleDelete = async () => {
    if (!confirm('정말 이 구인글을 삭제하시겠습니까?')) return

    setActionLoading('delete')
    await supabase.from('job_posts').delete().eq('id', id)
    router.push('/employer/jobs')
  }

  const handleApplicationStatus = async (appId: string, status: 'accepted' | 'rejected', seekerId: string) => {
    if (!user || !job) return
    setActionLoading(appId)

    try {
      await supabase.from('applications').update({ status }).eq('id', appId)

      if (status === 'accepted') {
        const { data: existing } = await supabase
          .from('chat_rooms')
          .select('id')
          .eq('job_post_id', job.id)
          .eq('seeker_id', seekerId)
          .maybeSingle()

        let chatRoomId: string

        if (existing?.id) {
          chatRoomId = existing.id
        } else {
          const { data: newRoom, error: insertError } = await supabase
            .from('chat_rooms')
            .insert({
              job_post_id: job.id,
              employer_id: user.id,
              seeker_id: seekerId,
            })
            .select('id')
            .single()

          if (insertError) throw insertError
          chatRoomId = newRoom.id
        }

        setApplications(prev => prev.map(a => (a.id === appId ? { ...a, status } : a)))
        setActionLoading(null)

        // 채팅방으로 이동
        router.push(`/chat/${chatRoomId}`)
      } else {
        setApplications(prev => prev.map(a => (a.id === appId ? { ...a, status } : a)))
        setActionLoading(null)
      }
    } catch (err) {
      console.error('Error:', err)
      setActionLoading(null)
    }
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
      <div className="text-center py-20">
        <p className="text-4xl mb-3">😕</p>
        <p className="text-gray-500 text-sm">구인글을 찾을 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <Link href="/employer/jobs" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        ← 목록으로
      </Link>

      {/* Job details */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6 mb-4">
        {!isEditing ? (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 leading-snug">{job.title}</h1>
                <p className="text-sm text-gray-500 mt-2">
                  {new Date(job.created_at).toLocaleDateString('ko-KR')} 등록
                </p>
              </div>
              <span
                className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full ${
                  job.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {job.status === 'open' ? '모집중' : '마감'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b border-gray-100">
              {job.location && (
                <span className="inline-flex items-center gap-1 text-sm text-gray-700 bg-gray-50 rounded-full px-3 py-1.5 border border-gray-100">
                  📍 {job.location}
                </span>
              )}
              {job.salary && (
                <span className="inline-flex items-center gap-1 text-sm text-gray-700 bg-gray-50 rounded-full px-3 py-1.5 border border-gray-100">
                  💰 {job.salary}
                </span>
              )}
              {job.work_hours && (
                <span className="inline-flex items-center gap-1 text-sm text-gray-700 bg-gray-50 rounded-full px-3 py-1.5 border border-gray-100">
                  🕐 {job.work_hours}
                </span>
              )}
            </div>

            {(job.require_resume || getQuestionCount(job.custom_questions) > 0) && (
              <div className="mb-6 rounded-2xl bg-orange-50 px-4 py-3">
                <p className="text-sm font-bold text-orange-700">지원 조건</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {job.require_resume && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-600">
                      이력서 필수
                    </span>
                  )}
                  {getQuestionCount(job.custom_questions) > 0 && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-600">
                      사전 질문 {getQuestionCount(job.custom_questions)}개
                    </span>
                  )}
                </div>
              </div>
            )}

            {job.description && (
              <div className="mb-6 pb-6 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">상세 내용</h2>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{job.description}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-all"
              >
                수정하기
              </button>
              <button
                onClick={handleToggleStatus}
                disabled={actionLoading === 'status'}
                className="flex-1 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all"
                style={{ backgroundColor: 'var(--brand)', opacity: actionLoading === 'status' ? 0.6 : 1 }}
              >
                {job.status === 'open' ? '모집 마감' : '다시 모집'}
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading === 'delete'}
                className="flex-1 px-4 py-3 rounded-xl border border-red-200 bg-white text-red-600 font-semibold text-sm hover:bg-red-50 transition-all"
              >
                삭제
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-4">구인글 수정</h2>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">제목</label>
                <input
                  type="text"
                  name="title"
                  value={editForm.title}
                  onChange={handleEditChange}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">위치</label>
                  <input
                    type="text"
                    name="location"
                    value={editForm.location}
                    onChange={handleEditChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">급여</label>
                  <input
                    type="text"
                    name="salary"
                    value={editForm.salary}
                    onChange={handleEditChange}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">근무 시간</label>
                <input
                  type="text"
                  name="work_hours"
                  value={editForm.work_hours}
                  onChange={handleEditChange}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">상세 내용</label>
                <textarea
                  name="description"
                  value={editForm.description}
                  onChange={handleEditChange}
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading === 'edit'}
                className="flex-1 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all"
                style={{ backgroundColor: 'var(--brand)', opacity: actionLoading === 'edit' ? 0.6 : 1 }}
              >
                저장하기
              </button>
            </div>
          </>
        )}
      </div>

      {/* Applications */}
      <div className="bg-white rounded-3xl border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          지원자 <span className="text-orange-500">({applications.length})</span>
        </h2>
        <p className="text-sm text-gray-500 mb-4">지원한 사람들의 정보를 확인하고 수락/거절할 수 있습니다</p>

        {applications.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">아직 지원자가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map(app => (
              <div key={app.id} className="border border-gray-100 rounded-2xl p-4 hover:border-gray-200 transition-all">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{app.profiles?.name ?? '이름 없음'}</p>
                    {app.profiles?.visa_type && (
                      <p className="text-xs text-gray-500">{app.profiles.visa_type}</p>
                    )}
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                {app.profiles?.bio && (
                  <p className="text-xs text-gray-600 line-clamp-2 mb-3 leading-relaxed">{app.profiles.bio}</p>
                )}

                <ApplicationSubmission app={app} requireResume={job.require_resume} />

                {app.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApplicationStatus(app.id, 'accepted', app.seeker_id)}
                      disabled={actionLoading === app.id}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                      style={{ backgroundColor: 'var(--brand)', opacity: actionLoading === app.id ? 0.6 : 1 }}
                    >
                      수락 + 채팅
                    </button>
                    <button
                      onClick={() => handleApplicationStatus(app.id, 'rejected', app.seeker_id)}
                      disabled={actionLoading === app.id}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold text-red-600 border border-red-200 bg-white hover:bg-red-50 transition-all"
                    >
                      거절
                    </button>
                  </div>
                )}

                {app.status === 'accepted' && (
                  <Link
                    href="/chat"
                    className="block text-center py-2 rounded-lg text-xs font-semibold text-orange-600 border border-orange-200 bg-orange-50"
                  >
                    채팅방 보기
                  </Link>
                )}

                {app.status === 'rejected' && (
                  <div className="text-center py-2 rounded-lg text-xs font-semibold text-gray-400">
                    거절됨
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getQuestionCount(value: Database['public']['Tables']['job_posts']['Row']['custom_questions']) {
  if (!Array.isArray(value)) return 0
  return value.filter(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    return typeof item.question === 'string' && item.question.trim().length > 0
  }).length
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

function ApplicationSubmission({
  app,
  requireResume,
}: {
  app: Application
  requireResume: boolean
}) {
  const customAnswers = parseCustomAnswers(app.custom_answers)

  if (!requireResume && customAnswers.length === 0) return null

  return (
    <div className="mb-4 rounded-2xl bg-gray-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-gray-700">제출 자료</p>
        {app.resume_url ? (
          <a
            href={app.resume_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-orange-600 shadow-sm"
          >
            이력서 보기
          </a>
        ) : requireResume ? (
          <span className="text-xs font-semibold text-red-500">이력서 없음</span>
        ) : null}
      </div>

      {customAnswers.length > 0 ? (
        <div className="space-y-2">
          {customAnswers.map((answer, index) => (
            <div key={`${answer.id}-${index}`} className="rounded-xl bg-white px-3 py-2">
              <p className="text-xs font-semibold leading-relaxed text-gray-700">
                {index + 1}. {answer.question}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500">{answer.answer}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-white px-3 py-2 text-xs text-gray-400">제출된 사전 질문 답변이 없습니다.</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: '검토중', cls: 'bg-yellow-100 text-yellow-700' },
    accepted: { label: '수락됨', cls: 'bg-green-100 text-green-700' },
    rejected: { label: '거절됨', cls: 'bg-red-100 text-red-600' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${s.cls}`}>
      {s.label}
    </span>
  )
}
