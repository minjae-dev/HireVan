'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'

type JobPost = Database['public']['Tables']['job_posts']['Row'] & {
  profiles: { name: string; role: string } | null
}

const LOCATIONS = ['전체', '다운타운', '버나비', '서리', '코퀴틀람', '리치몬드', '노스밴쿠버', '기타']

export default function JobsPage() {
  const { profile } = useAuth()
  const [jobs, setJobs] = useState<JobPost[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState('전체')
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('job_posts')
      .select('*, profiles(name, role)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (location !== '전체') {
      query = query.ilike('location', `%${location}%`)
    }

    const { data } = await query
    setJobs((data as unknown as JobPost[]) ?? [])
    setLoading(false)
  }, [location])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    if (!profile || profile.role !== 'seeker') return
    const fetchApplied = async () => {
      const { data } = await supabase
        .from('applications')
        .select('job_post_id')
        .eq('seeker_id', profile.id)
      if (data) setAppliedIds(new Set(data.map(a => a.job_post_id)))
    }
    fetchApplied()
  }, [profile])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">구인글 목록</h1>
        {profile?.role === 'employer' && (
          <Link
            href="/jobs/new"
            className="text-sm text-white font-semibold px-4 py-2 rounded-full"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            + 구인글 올리기
          </Link>
        )}
      </div>

      {/* Location filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {LOCATIONS.map(loc => (
          <button
            key={loc}
            onClick={() => setLocation(loc)}
            className={`flex-shrink-0 text-sm px-3 py-1.5 rounded-full border transition-all ${
              location === loc
                ? 'text-white border-transparent'
                : 'text-gray-600 border-gray-200 bg-white hover:border-gray-300'
            }`}
            style={location === loc ? { backgroundColor: 'var(--brand)', borderColor: 'var(--brand)' } : {}}
          >
            {loc}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">구인글이 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              applied={appliedIds.has(job.id)}
              isSeeker={profile?.role === 'seeker'}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({
  job,
  applied,
  isSeeker,
}: {
  job: JobPost
  applied: boolean
  isSeeker: boolean
}) {
  return (
    <Link href={`/jobs/${job.id}`}>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 transition-all active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 text-base mb-1 truncate">{job.title}</h2>
            <p className="text-sm text-gray-500 mb-2">{job.profiles?.name ?? '업체'}</p>
            <div className="flex flex-wrap gap-2">
              {job.location && (
                <Tag icon="📍" text={job.location} />
              )}
              {job.salary && (
                <Tag icon="💰" text={job.salary} />
              )}
              {job.work_hours && (
                <Tag icon="🕐" text={job.work_hours} />
              )}
            </div>
          </div>
          {isSeeker && applied && (
            <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
              지원완료
            </span>
          )}
        </div>
        {job.description && (
          <p className="text-sm text-gray-500 mt-3 line-clamp-2 leading-relaxed">
            {job.description}
          </p>
        )}
        <p className="text-xs text-gray-300 mt-3">
          {new Date(job.created_at).toLocaleDateString('ko-KR')}
        </p>
      </div>
    </Link>
  )
}

function Tag({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded-full px-2.5 py-1">
      <span>{icon}</span>
      <span>{text}</span>
    </span>
  )
}
