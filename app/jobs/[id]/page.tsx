'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'

type JobPost = Database['public']['Tables']['job_posts']['Row'] & {
  profiles: { name: string; bio: string } | null
}

type Application = Database['public']['Tables']['applications']['Row'] & {
  profiles: { name: string; bio: string; visa_type: string } | null
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
    setApplying(true)
    const { error } = await supabase.from('applications').insert({
      job_post_id: id,
      seeker_id: user.id,
    })
    if (!error) setApplied(true)
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
        <button
          onClick={handleApply}
          disabled={applied || applying}
          className="w-full text-white font-semibold py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-60 mb-4"
          style={{ backgroundColor: applied ? '#9ca3af' : 'var(--brand)' }}
        >
          {applying ? '지원 중...' : applied ? '이미 지원했습니다' : '지원하기'}
        </button>
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
