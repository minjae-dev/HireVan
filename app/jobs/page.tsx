'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/context/LanguageContext'
import type { Database } from '@/lib/database.types'

type JobPost = Database['public']['Tables']['job_posts']['Row'] & {
  profiles: { name: string; role: string } | null
}

const LOCATIONS = ['전체', '다운타운', '버나비', '서리', '코퀴틀람', '리치몬드', '노스밴쿠버', '기타']
const JOB_TYPES = ['전체', '카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타']

export default function JobsPage() {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [jobs, setJobs] = useState<JobPost[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState('전체')
  const [jobType, setJobType] = useState('전체')
  const [sortBy, setSortBy] = useState<'latest' | 'title'>('latest')
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('job_posts')
      .select('*, profiles(name, role)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    setJobs((data as unknown as JobPost[]) ?? [])
    setLoading(false)
  }, [])

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
      if (data) setAppliedIds(new Set((data as unknown as { job_post_id: string }[]).map(a => a.job_post_id)))
    }
    fetchApplied()
  }, [profile])

  const filteredJobs = useMemo(() => {
    let result = [...jobs]
    if (location !== '전체') {
      const locKeyword = location.toLowerCase()
      result = result.filter(job => {
        const jobLocation = (job.location || '').toLowerCase()
        const description = (job.description || '').toLowerCase()
        const title = (job.title || '').toLowerCase()
        return jobLocation.includes(locKeyword) || description.includes(locKeyword) || title.includes(locKeyword)
      })
    }
    if (jobType !== '전체') {
      result = result.filter(job => {
        const description = (job.description || '').toLowerCase()
        const title = (job.title || '').toLowerCase()
        const typeKeyword = jobType.toLowerCase()
        return description.includes(typeKeyword) || title.includes(typeKeyword)
      })
    }
    if (sortBy === 'title') {
      result.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'))
    }
    return result
  }, [jobs, location, jobType, sortBy])

  const activeFilterCount = (location !== '전체' ? 1 : 0) + (jobType !== '전체' ? 1 : 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('jobs.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('jobs.subtitle')}</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">{t('jobs.filter_location')}</p>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {LOCATIONS.map(loc => (
            <button
              key={loc}
              onClick={() => setLocation(loc)}
              className={`flex-shrink-0 text-sm px-3.5 py-2 rounded-full border transition-all ${
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
      </div>

      <div className="mb-4 flex gap-2 items-center">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex-shrink-0 px-3.5 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
        >
          ⚙️ {t('jobs.filter_btn')} {activeFilterCount > 0 && <span className="ml-1 text-xs bg-orange-500 text-white rounded-full px-1.5">({activeFilterCount})</span>}
        </button>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'latest' | 'title')}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
        >
          <option value="latest">{t('jobs.sort_latest')}</option>
          <option value="title">{t('jobs.sort_title')}</option>
        </select>
      </div>

      {showFilters && (
        <div className="mb-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">{t('jobs.filter_category')}</p>
          <div className="flex flex-wrap gap-2">
            {JOB_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setJobType(type)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  jobType === type
                    ? 'text-white border-transparent'
                    : 'text-gray-600 border-gray-200 bg-white hover:border-gray-300'
                }`}
                style={jobType === type ? { backgroundColor: 'var(--brand)', borderColor: 'var(--brand)' } : {}}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">{t('jobs.no_jobs')}</p>
          {(location !== '전체' || jobType !== '전체') && (
            <button
              onClick={() => {
                setLocation('전체')
                setJobType('전체')
              }}
              className="mt-3 text-sm text-orange-500 hover:text-orange-600 font-medium"
            >
              {t('jobs.reset_filter')}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">{t('jobs.total_count', { count: filteredJobs.length })}</p>
          <div className="flex flex-col gap-3">
            {filteredJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                applied={appliedIds.has(job.id)}
                isSeeker={profile?.role === 'seeker'}
                t={t}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function JobCard({
  job,
  applied,
  isSeeker,
  t,
}: {
  job: JobPost
  applied: boolean
  isSeeker: boolean
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  return (
    <Link href={`/jobs/${job.id}`}>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-orange-200 hover:shadow-md transition-all active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900 text-base truncate">{job.title}</h2>
            <p className="text-sm text-gray-500">{job.profiles?.name ?? t('jobs.employer_name_fallback')}</p>
          </div>
          {isSeeker && applied && (
            <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 whitespace-nowrap">
              {t('common.applied')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {job.location && <Tag icon="📍" text={job.location} />}
          {job.salary && <Tag icon="💰" text={job.salary} />}
          {job.work_hours && <Tag icon="🕐" text={job.work_hours} />}
        </div>

        {job.description && (
          <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed mb-2">
            {job.description}
          </p>
        )}

        <p className="text-xs text-gray-400">
          {new Date(job.created_at).toLocaleDateString('ko-KR')}
        </p>
      </div>
    </Link>
  )
}

function Tag({ icon, text }: { icon: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1.5">
      <span>{icon}</span>
      <span>{text}</span>
    </span>
  )
}