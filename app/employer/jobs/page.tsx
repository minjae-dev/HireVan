'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'

type JobPost = Database['public']['Tables']['job_posts']['Row']

export default function EmployerJobsPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const router = useRouter()

  const [jobs, setJobs] = useState<JobPost[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all')

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'employer')) {
      router.push('/login')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!user) return

    const fetchJobs = async () => {
      setLoading(true)
      let query = supabase
        .from('job_posts')
        .select('*')
        .eq('employer_id', user.id)
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data } = await query
      setJobs(data ?? [])
      setLoading(false)
    }

    fetchJobs()
  }, [user, filter])

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const openCount = jobs.filter(j => j.status === 'open').length
  const closedCount = jobs.filter(j => j.status === 'closed').length

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">내 구인글</h1>
          <p className="text-sm text-gray-500 mt-1">등록한 구인글을 관리하세요</p>
        </div>
        <Link
          href="/employer/jobs/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-white font-semibold text-sm transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <span>+</span>
          <span>새 구인글</span>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(
          [
            { value: 'all' as const, label: '전체', count: jobs.length },
            { value: 'open' as const, label: '모집중', count: openCount },
            { value: 'closed' as const, label: '마감', count: closedCount },
          ] as const
        ).map(({ value, label, count }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              filter === value
                ? 'text-white'
                : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
            }`}
            style={filter === value ? { backgroundColor: 'var(--brand)' } : {}}
          >
            {label} <span className="ml-1 text-xs opacity-75">({count})</span>
          </button>
        ))}
      </div>

      {/* Job list */}
      {jobs.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 text-sm mb-4">
            {filter === 'all'
              ? '아직 등록한 구인글이 없습니다'
              : `${filter === 'open' ? '모집 중인' : '마감된'} 구인글이 없습니다`}
          </p>
          <Link
            href="/employer/jobs/new"
            className="inline-block px-6 py-2.5 rounded-full text-white font-semibold text-sm transition-all active:scale-95"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            첫 구인글 등록하기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map(job => (
            <Link key={job.id} href={`/employer/jobs/${job.id}`}>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-2">
                      <h2 className="font-semibold text-gray-900 text-base truncate flex-1">{job.title}</h2>
                      <span
                        className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                          job.status === 'open'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {job.status === 'open' ? '모집중' : '마감'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-2">
                      {job.location && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded-full px-2.5 py-1">
                          📍 {job.location}
                        </span>
                      )}
                      {job.salary && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 rounded-full px-2.5 py-1">
                          💰 {job.salary}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-400">
                      {new Date(job.created_at).toLocaleDateString('ko-KR')} 등록
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
