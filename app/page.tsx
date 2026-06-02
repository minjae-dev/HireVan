'use client'

import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

type JobPost = Database['public']['Tables']['job_posts']['Row'] & {
  profiles: { name: string; role: string } | null
}

const LOCATIONS = ['전체', '다운타운', '버나비', '서리', '코퀴틀람', '리치몬드', '노스밴쿠버', '기타']
const CATEGORIES = ['전체', '카페', '식당', '네일숍', '편의점', '기타']

const CATEGORY_EMOJI: Record<string, string> = {
  카페: '☕',
  식당: '🍽️',
  네일숍: '💅',
  편의점: '🏪',
  기타: '📦',
}

export default function JobsPage() {
  const { profile } = useAuth()
  const [jobs, setJobs] = useState<JobPost[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState('전체')
  const [category, setCategory] = useState('전체')
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
    if (category !== '전체') {
      query = query.eq('category', category)
    }

    const { data } = await query
    setJobs((data as unknown as JobPost[]) ?? [])
    setLoading(false)
  }, [location, category])

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

  const activeFilters = (location !== '전체' ? 1 : 0) + (category !== '전체' ? 1 : 0)

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">구인글 목록</h1>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {jobs.length}개의 공고
              {activeFilters > 0 && (
                <button
                  onClick={() => { setLocation('전체'); setCategory('전체') }}
                  className="ml-2 text-orange-500 underline underline-offset-2"
                >
                  필터 초기화
                </button>
              )}
            </p>
          )}
        </div>
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

      {/* 지역 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-2 scrollbar-hide">
        {LOCATIONS.map(loc => (
          <FilterChip
            key={loc}
            label={loc}
            active={location === loc}
            onClick={() => setLocation(loc)}
          />
        ))}
      </div>

      {/* 업종 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {CATEGORIES.map(cat => (
          <FilterChip
            key={cat}
            label={cat === '전체' ? cat : `${CATEGORY_EMOJI[cat] ?? ''} ${cat}`}
            active={category === cat}
            onClick={() => setCategory(cat)}
          />
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/3 mb-3" />
              <div className="flex gap-2">
                <div className="h-6 bg-gray-100 rounded-full w-16" />
                <div className="h-6 bg-gray-100 rounded-full w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">
            {activeFilters > 0 ? '해당 조건의 구인글이 없습니다' : '구인글이 없습니다'}
          </p>
          {activeFilters > 0 && (
            <button
              onClick={() => { setLocation('전체'); setCategory('전체') }}
              className="mt-3 text-sm text-orange-500 font-medium hover:underline"
            >
              전체 보기
            </button>
          )}
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

// ── FilterChip ────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 text-sm px-3 py-1.5 rounded-full border transition-all ${
        active
          ? 'text-white border-transparent'
          : 'text-gray-600 border-gray-200 bg-white hover:border-gray-300'
      }`}
      style={active ? { backgroundColor: 'var(--brand)', borderColor: 'var(--brand)' } : {}}
    >
      {label}
    </button>
  )
}

// ── JobCard ───────────────────────────────────────────────

function JobCard({
  job,
  applied,
  isSeeker,
}: {
  job: JobPost
  applied: boolean
  isSeeker: boolean
}) {
  const isExpiringSoon = (() => {
    if (!job.deadline) return false
    const diff = new Date(job.deadline).getTime() - Date.now()
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000 // 3일 이내
  })()

  const isExpired = job.deadline ? new Date(job.deadline) < new Date() : false

  return (
    <Link href={`/jobs/${job.id}`}>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 transition-all active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* 업종 배지 */}
            {job.category && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 rounded-full px-2 py-0.5 mb-1.5">
                {CATEGORY_EMOJI[job.category] ?? '🏪'} {job.category}
              </span>
            )}

            <h2 className="font-semibold text-gray-900 text-base mb-1 truncate">
              {job.title}
            </h2>
            <p className="text-sm text-gray-500 mb-2">{job.profiles?.name ?? '업체'}</p>

            <div className="flex flex-wrap gap-1.5">
              {job.location && <Tag icon="📍" text={job.location} />}
              {job.salary && <Tag icon="💰" text={job.salary} />}
              {job.work_hours && <Tag icon="🕐" text={job.work_hours} />}
              {job.deadline && !isExpired && (
                <Tag
                  icon="📅"
                  text={`~${new Date(job.deadline).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`}
                  highlight={isExpiringSoon}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {isSeeker && applied && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                지원완료
              </span>
            )}
            {isExpiringSoon && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-500">
                마감임박
              </span>
            )}
          </div>
        </div>

        {job.description && (
          <p className="text-sm text-gray-400 mt-3 line-clamp-2 leading-relaxed">
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

// ── Tag ───────────────────────────────────────────────────

function Tag({ icon, text, highlight }: { icon: string; text: string; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 ${
        highlight
          ? 'text-red-500 bg-red-50'
          : 'text-gray-500 bg-gray-50'
      }`}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </span>
  )
}
