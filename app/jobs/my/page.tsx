'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'

type JobPost = Database['public']['Tables']['job_posts']['Row']

export default function MyJobsPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [jobs, setJobs] = useState<JobPost[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && (!user || profile?.role !== 'employer')) {
      router.push('/')
    }
  }, [user, profile, loading, router])

  useEffect(() => {
    if (!user) return
    const fetchJobs = async () => {
      const { data } = await supabase
        .from('job_posts')
        .select('*')
        .eq('employer_id', user.id)
        .order('created_at', { ascending: false })
      setJobs(data ?? [])
      setFetching(false)
    }
    fetchJobs()
  }, [user])

  if (loading || fetching) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">내 구인글</h1>
        <Link
          href="/jobs/new"
          className="text-sm text-white font-semibold px-4 py-2 rounded-full"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          + 새 구인글
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm mb-4">아직 등록한 구인글이 없습니다</p>
          <Link
            href="/jobs/new"
            className="inline-block text-white font-semibold text-sm px-6 py-2.5 rounded-full"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            첫 구인글 올리기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map(job => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900 text-base mb-1">{job.title}</h2>
                    <p className="text-xs text-gray-400">{job.location} · {new Date(job.created_at).toLocaleDateString('ko-KR')}</p>
                  </div>
                  <span
                    className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                      job.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {job.status === 'open' ? '모집중' : '마감'}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
