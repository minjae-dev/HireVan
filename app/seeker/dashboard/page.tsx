'use client'

import { useAuth } from '@/lib/auth-context'
import type { JobMatchResult, SeekerPreferences } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CATEGORIES = [
  { value: '식당', label: '식당' },
  { value: '카페', label: '카페' },
  { value: 'office-accounting', label: '사무/회계' },
  { value: 'sales-consultation', label: '영업/상담' },
  { value: 'retail-dealership', label: '유통/판매' },
  { value: 'shipping-logistics', label: '배송/물류' },
  { value: 'production-tech', label: '생산/기술' },
  { value: 'construction', label: '건설/토목' },
  { value: 'care-cleaning', label: '돌봄/청소' },
  { value: 'it-design', label: 'IT/디자인' },
  { value: 'beauty-ceremony', label: '미용/예식' },
  { value: 'healthcare', label: '간호/의료' },
  { value: 'teaching-lecturer', label: '교육/강사' },
  { value: 'etc', label: '기타' },
] as const
const LOCATIONS = [
  { value: '5', label: '밴쿠버' },
  { value: '1', label: '버나비' },
  { value: '2', label: '코퀴틀람' },
  { value: '4', label: '써리' },
  { value: '11', label: '랭리' },
  { value: '14', label: '포트코퀴틀람' },
  { value: '6', label: '노스밴쿠버' },
  { value: '7', label: '웨스트밴쿠버' },
  { value: '3', label: '포트무디' },
  { value: '9', label: '리치몬드' },
  { value: '12', label: '델타' },
  { value: '15', label: '뉴웨스터민스터' },
  { value: '8', label: '메이플릿지' },
  { value: '10', label: '화이트락' },
  { value: '16', label: '핏메도우' },
  { value: '17', label: '재스퍼' },
  { value: '19', label: '아보츠포드' },
  { value: '20', label: '킬로나' },
  { value: '13', label: '기타' },
] as const

const LOCATION_ALIASES: Record<string, string[]> = {
  '다운타운': ['다운타운', 'downtown', 'dt', 'vancouver downtown', 'downtown vancouver', '시내'],
  '버나비': ['버나비', 'burnaby', 'metrotown'],
  '서리': ['서리', 'surrey'],
  '코퀴틀람': ['코퀴틀람', 'coquitlam', 'coq', 'port coquitlam', '포트코퀴틀람'],
  '리치몬드': ['리치몬드', 'richmond'],
  '노스밴쿠버': ['노스밴쿠버', 'north vancouver', 'north van', 'n van'],
  '기타': ['기타', 'other', '기타지역'],
}

function parseSalaryRange(salary: string | null | undefined): { min: number | null; max: number | null } {
  if (!salary) return { min: null, max: null }
  const numbers = salary.match(/\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length === 0) return { min: null, max: null }
  const values = numbers.map(n => parseFloat(n))
  if (values.length === 1) return { min: values[0], max: values[0] }
  return { min: Math.min(...values), max: Math.max(...values) }
}

function matchLocation(jobLocation: string, selectedLocations: string[]): boolean {
  if (selectedLocations.length === 0) return true
  const jobLoc = (jobLocation || '').toLowerCase().trim()
  if (!jobLoc) return false
  
  return selectedLocations.some(selectedId => {
    // 1. 선택된 숫자 ID(예: '1')에 해당하는 한글 이름(예: '버나비')을 찾습니다.
    const locationObj = LOCATIONS.find(l => l.value === selectedId)
    const krName = locationObj ? locationObj.label : ''
    
    // 2. 한글 이름으로 맵에서 Alias 배열을 꺼내고, 없다면 고유 ID 혹은 한글 이름 자체를 배열로 둡니다.
    const aliases = LOCATION_ALIASES[krName] ?? [selectedId.toLowerCase()]
    
    // 3. 공고 텍스트에 포함되어 있는지 비교 검증
    return aliases.some(alias => jobLoc.includes(alias.toLowerCase()))
  })
}
export default function SeekerDashboardPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [matches, setMatches] = useState<JobMatchResult[]>([])
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<SeekerPreferences | null>(null)
  const latestPreferencesRef = useRef<SeekerPreferences | null>(null)
  const [showPrefForm, setShowPrefForm] = useState(false)
  const [formCategories, setFormCategories] = useState<string[]>([])
  const [formLocations, setFormLocations] = useState<string[]>([])
  const [formSalaryMin, setFormSalaryMin] = useState('')
  const [formSalaryMax, setFormSalaryMax] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  const getValidAccessToken = useCallback(async (): Promise<string | null> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (!userErr && userData.user) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) return session.access_token
    }
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (!refreshErr && refreshed.session?.access_token) {
      return refreshed.session.access_token
    }
    return null
  }, [])

  const fetchMatches = useCallback(async () => {
    if (!user) return
    setMatchesLoading(true)
    setMatchError(null)
    try {
      const accessToken = await getValidAccessToken()
      if (!accessToken) {
        throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해주세요.')
      }
      const res = await fetch('/api/seeker/matches', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch matches')

      const fetchedPrefs = data.preferences ?? null
      setMatches(data.matches ?? [])
      setPreferences(fetchedPrefs)
      latestPreferencesRef.current = fetchedPrefs

      if (fetchedPrefs) {
        setFormCategories(fetchedPrefs.desired_categories ?? [])
        setFormLocations(fetchedPrefs.desired_locations ?? [])
        setFormSalaryMin(fetchedPrefs.desired_salary_min?.toString() ?? '')
        setFormSalaryMax(fetchedPrefs.desired_salary_max?.toString() ?? '')
      }
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setMatchesLoading(false)
    }
  }, [user, getValidAccessToken])

  useEffect(() => {
    if (!authLoading && user) fetchMatches()
  }, [authLoading, user, fetchMatches])

  const savePreferences = async () => {
    if (!user) return
    setFormSaving(true)
    try {
      const newPrefs = {
        seeker_id: user.id,
        desired_categories: formCategories,
        desired_locations: formLocations,
        desired_salary_min: formSalaryMin ? parseFloat(formSalaryMin) : null,
        desired_salary_max: formSalaryMax ? parseFloat(formSalaryMax) : null,
        desired_visa_types: [],
        desired_certificates: [],
        notifications_enabled: true,
      }
      const { error } = await supabase.from('seeker_preferences').upsert(newPrefs, { onConflict: 'seeker_id' })
      if (error) throw error
      // 저장 즉시 ref/state 업데이트 → useMemo가 최신값으로 필터링
      latestPreferencesRef.current = newPrefs as unknown as SeekerPreferences;
      setPreferences(newPrefs as unknown as SeekerPreferences);
      setShowPrefForm(false)
      await fetchMatches()
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

  const filteredMatches = useMemo(() => {
    if (!matches || matches.length === 0) return []

    const prefs = latestPreferencesRef.current ?? preferences

    // preferences row 자체가 없으면 전체 표시
    if (!prefs) return matches

    const desiredLocations = prefs.desired_locations ?? []
    const desiredSalaryMin = prefs.desired_salary_min
    const desiredSalaryMax = prefs.desired_salary_max
    const hasLocationFilter = desiredLocations.length > 0
    const hasSalaryFilter = desiredSalaryMin != null || desiredSalaryMax != null

    // 조건이 하나도 없으면 전체 표시
    if (!hasLocationFilter && !hasSalaryFilter) return matches

    if (process.env.NODE_ENV === 'development') {
      console.log('[location filter] 선택된 지역:', desiredLocations)
      console.log('[location filter] 공고 location 값:', matches.map(m => m.location))
    }

    return matches.filter(m => {
      if (hasLocationFilter && !matchLocation(m.location ?? '', desiredLocations)) {
        return false
      }
      if (hasSalaryFilter) {
        const { min, max } = parseSalaryRange(m.salary)
        if (min == null && max == null) return true
        const jobMin = min ?? max!
        const jobMax = max ?? min!
        const overlapMax = desiredSalaryMax ?? Number.POSITIVE_INFINITY
        const overlapMin = desiredSalaryMin ?? 0
        if (jobMin > overlapMax || jobMax < overlapMin) return false
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
                <button 
                  key={cat.value} 
                  type="button" 
                  onClick={() => toggleCategory(cat.value)}
                  className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all ${
                    formCategories.includes(cat.value) 
                      ? 'bg-orange-500 text-white shadow-md' 
                      : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-600">희망 지역 (중복 선택 가능)</p>
              <div className="flex flex-wrap gap-2">
                {LOCATIONS.map(loc => (
                <button 
                  key={loc.value} 
                  type="button" 
                  onClick={() => toggleLocation(loc.value)}
                  className={`rounded-full px-3.5 py-2 text-xs font-bold transition-all ${
                    formLocations.includes(loc.value) 
                      ? 'bg-orange-500 text-white shadow-md' 
                      : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {loc.label}
                </button>
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