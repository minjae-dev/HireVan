'use client'

import { useAuth } from '@/lib/auth-context'
import type { JobMatchResult, SeekerPreferences } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

const CATEGORIES = ['카페', '식당', '네일숍', '편의점', '소매점', '청소용역', '배송', '기타']
const LOCATIONS = ['다운타운', '버나비', '서리', '코퀴틀람', '리치몬드', '노스밴쿠버', '기타']

/**
 * 시급 문자열에서 최소/최대 숫자(CAD) 추출.
 * "시급 $17", "$17~$20", "17.50" 등 다양한 형식 지원.
 * 추출 실패 시 null 반환.
 */
function parseSalaryRange(salary: string | null | undefined): { min: number | null; max: number | null } {
  if (!salary) return { min: null, max: null }
  const numbers = salary.match(/\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length === 0) return { min: null, max: null }
  const values = numbers.map(n => parseFloat(n))
  if (values.length === 1) return { min: values[0], max: values[0] }
  return { min: Math.min(...values), max: Math.max(...values) }
}

export default function SeekerDashboardPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [matches, setMatches] = useState<JobMatchResult[]>([])
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<SeekerPreferences | null>(null)
  const [showPrefForm, setShowPrefForm] = useState(false)
  const [formCategories, setFormCategories] = useState<string[]>([])
  const [formLocations, setFormLocations] = useState<string[]>([])
  const [formSalaryMin, setFormSalaryMin] = useState('')
  const [formSalaryMax, setFormSalaryMax] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  const fetchMatches = useCallback(async () => {
    if (!user) return
    setMatchesLoading(true)
    setMatchError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/seeker/matches', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch matches')
      setMatches(data.matches ?? [])
      setPreferences(data.preferences ?? null)
      if (data.preferences) {
        setFormCategories(data.preferences.desired_categories ?? [])
        setFormLocations(data.preferences.desired_locations ?? [])
        setFormSalaryMin(data.preferences.desired_salary_min?.toString() ?? '')
        setFormSalaryMax(data.preferences.desired_salary_max?.toString() ?? '')
      }
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setMatchesLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!authLoading && user) fetchMatches()
  }, [authLoading, user, fetchMatches])

  const savePreferences = async () => {
    if (!user) return
    setFormSaving(true)
    try {
      const { error } = await supabase.from('seeker_preferences').upsert({
        seeker_id: user.id,
        desired_categories: formCategories,
        desired_locations: formLocations,
        desired_salary_min: formSalaryMin ? parseFloat(formSalaryMin) : null,
        desired_salary_max: formSalaryMax ? parseFloat(formSalaryMax) : null,
        desired_visa_types: [],
        desired_certificates: [],
        notifications_enabled: true,
      }, { onConflict: 'seeker_id' })
      if (error) throw error
      setShowPrefForm(false)
      fetchMatches()
    } catch (err) {
      alert('저장 중 오류가 발생했습니다: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setFormSaving(false)
    }
  }

  const toggleCategory = (cat: string) => {
    setFormCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }
  const toggleLocation = (loc: string) => {
    setFormLocations(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc])
  }

  // RPC match_jobs_to_seeker는 카테고리(desired_categories)만 필터링하고
  // 지역/시급은 평가에 포함되지 않으므로, 클라이언트에서 추가 필터링한다.
  const filteredMatches = useMemo(() => {
    if (!matches || matches.length === 0) return []
    if (!preferences) return matches

    const desiredLocations = preferences.desired_locations ?? []
    const desiredSalaryMin = preferences.desired_salary_min
    const desiredSalaryMax = preferences.desired_salary_max
    const hasLocationFilter = desiredLocations.length > 0
    const hasSalaryFilter = desiredSalaryMin != null || desiredSalaryMax != null
    if (!hasLocationFilter && !hasSalaryFilter) return matches

    return matches.filter(match => {
      // 지역 필터: 선택 지역 중 하나라도 location 문자열에 포함되면 매칭
      if (hasLocationFilter) {
        const jobLoc = (match.location || '').toLowerCase()
        const locHit = desiredLocations.some(loc => jobLoc.includes(loc.toLowerCase()))
        if (!locHit) return false
      }

      // 시급 필터: 공고 시급 범위가 희망 범위와 겹치는지 검사
      if (hasSalaryFilter) {
        const { min, max } = parseSalaryRange(match.salary)
        // 시급 정보가 없으면 필터 적용이 불가하므로 포함시킴
        if (min == null && max == null) return true
        const jobMin = min ?? max!
        const jobMax = max ?? min!
        // 겹침 조건: jobMin ≤ desiredMax && jobMax ≥ desiredMin
        if (desiredSalaryMax != null && jobMin > desiredSalaryMax) return false
        if (desiredSalaryMin != null && jobMax < desiredSalaryMin) return false
      }

      return true
    })
  }, [matches, preferences])

  if (authLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-300 border-t-orange-500" />
      </div>
    )
  }

  if (!user || profile?.role !== 'seeker') {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">접근할 수 없습니다</h1>
        <p className="mt-2 text-sm text-gray-500">구직자 계정으로 로그인해주세요.</p>
        <Link href="/login" className="mt-4 inline-block rounded-full bg-orange-500 px-6 py-2 text-sm font-bold text-white">로그인하기</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-gray-900">내 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">{profile.name}님, 맞춤 공고를 확인하고 지원해보세요.</p>
      </div>

      <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📋 내 희망 조건</h2>
            <p className="mt-1 text-sm text-gray-500">
              {preferences ? '희망 조건이 설정되어 있어요.' : '희망 조건을 설정하면 맞춤 공고를 추천해드려요.'}
            </p>
          </div>
          <button type="button" onClick={() => setShowPrefForm(!showPrefForm)}
            className="flex-shrink-0 rounded-full border border-orange-300 bg-white px-4 py-2 text-xs font-bold text-orange-600 transition-all active:scale-95"
          >
            {showPrefForm ? '취소' : preferences ? '✏️ 조건 수정' : '✨ 조건 설정'}
          </button>
        </div>

        {showPrefForm && (
          <div className="mt-6 space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-600">희망 업종 (중복 선택 가능)</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button key={cat} type="button" onClick={() => toggleCategory(cat)}
                    className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all ${formCategories.includes(cat) ? 'bg-orange-500 text-white shadow-md' : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'}`}
                  >{cat}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-600">희망 지역 (중복 선택 가능)</p>
              <div className="flex flex-wrap gap-2">
                {LOCATIONS.map(loc => (
                  <button key={loc} type="button" onClick={() => toggleLocation(loc)}
                    className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all ${formLocations.includes(loc) ? 'bg-orange-500 text-white shadow-md' : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'}`}
                  >{loc}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600">최소 시급 (CAD)</label>
                <input type="number" value={formSalaryMin} onChange={e => setFormSalaryMin(e.target.value)} placeholder="예: 17"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600">최대 시급 (CAD)</label>
                <input type="number" value={formSalaryMax} onChange={e => setFormSalaryMax(e.target.value)} placeholder="예: 25"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400"
                />
              </div>
            </div>
            <button type="button" onClick={savePreferences} disabled={formSaving}
              className="w-full rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-6 py-3 text-sm font-extrabold text-white shadow-md transition-all active:scale-95 disabled:opacity-60"
            >
              {formSaving ? '저장 중...' : '💾 조건 저장하고 맞춤 공고 보기'}
            </button>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-bold text-gray-900">📌 나를 위한 맞춤 공고</h2>

        {matchesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
          </div>
        ) : matchError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm text-red-600">{matchError}</p>
            <button type="button" onClick={fetchMatches} className="mt-3 rounded-full bg-red-500 px-4 py-2 text-xs font-bold text-white">다시 시도</button>
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-3xl">🔍</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">아직 맞춤 공고가 없어요</p>
            <p className="mt-1 text-xs text-gray-500">위에서 희망 조건을 설정하면 조건에 맞는 공고를 추천해드려요.</p>
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-3xl">📭</p>
            <p className="mt-2 text-sm font-semibold text-gray-700">희망 조건에 맞는 공고가 없어요</p>
            <p className="mt-1 text-xs text-gray-500">지역이나 시급 조건을 조정하면 더 많은 공고를 볼 수 있어요.</p>
            <p className="mt-3 text-[10px] text-gray-400">전체 맞춤 공고 {matches.length}개 중 조건에 맞는 0개</p>
          </div>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-400">총 {filteredMatches.length}개</p>
            <div className="space-y-3">
            {filteredMatches.map(match => (
              <Link key={match.job_id} href={`/jobs/${match.job_id}`}
                className="block rounded-2xl border border-gray-100 bg-white p-5 transition-all hover:border-orange-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-bold text-gray-900">{match.title}</h3>
                      <span className="flex-shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600">★{match.match_score}%</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{match.employer_name} · {match.location}{match.salary ? ' · ' + match.salary : ''}</p>
                    {match.matched_reasons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {match.matched_reasons.map(reason => (
                          <span key={reason} className="rounded-full bg-green-50 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">✓ {reason}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-white">지원하기 →</span>
                </div>
              </Link>
            ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
