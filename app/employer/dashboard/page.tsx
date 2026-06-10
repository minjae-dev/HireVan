'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import BlurredSeekerCard from '@/components/BlurredSeekerCard'
import GracePeriodBanner from '@/components/GracePeriodBanner'
import ProUpsellModal from '@/components/ProUpsellModal'
import { useAuth } from '@/lib/auth-context'
import type { Database, EmployerBillingStatus, PublicProfile } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { usePollProUpgrade } from '@/lib/usePollProUpgrade'
import { useSeekerAccess } from '@/lib/useSeekerAccess'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type JobPost = Database['public']['Tables']['job_posts']['Row']

// ---------------------------------------------------------------------------
// 필터 옵션 (한국 밴쿠버 채용 시장 기준)
// ---------------------------------------------------------------------------
const NEIGHBORHOOD_OPTIONS = [
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

const CERT_OPTIONS = [
  { code: 'sir', label: '🍷 Serving It Right' },
  { code: 'foodsafe', label: '🥗 FoodSafe' },
] as const

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function EmployerDashboardPage() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()
  const router = useRouter()

  // 인증 & 권한 가드
  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'employer')) {
      router.push('/login')
    }
  }, [user, profile, authLoading, router])

  // 결제 상태
  const [billing, setBilling] = useState<EmployerBillingStatus | null>(null)
  const [billingLoading, setBillingLoading] = useState(true)

  const fetchBillingOnce = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_employer_billing_status')
    if (data) setBilling(data as EmployerBillingStatus)
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setBillingLoading(true)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_employer_billing_status')
      if (cancelled) return
      if (!error) setBilling(data as EmployerBillingStatus)
      setBillingLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  // ---------------------------------------------------------------------
  // 결제 직후 Race Condition 방어
  // ---------------------------------------------------------------------
  const poll = usePollProUpgrade({ manual: true })
  const [upgradeJustCompleted, setUpgradeJustCompleted] = useState(false)

  // 폴링이 'active' / 'timeout' / 'error' 로 종료되면 billing 을 한 번 더 동기화
  useEffect(() => {
    if (poll.status === 'active' || poll.status === 'timeout') {
      fetchBillingOnce()
    }
  }, [poll.status, fetchBillingOnce])

  // 내 구인글
  const [jobs, setJobs] = useState<JobPost[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setJobsLoading(true)
      const { data } = await supabase
        .from('job_posts')
        .select('*')
        .eq('employer_id', user.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5)
      if (!cancelled) {
        setJobs((data as JobPost[] | null) ?? [])
        setJobsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  // 선택된 공고 (매칭 분석용)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].id)
    }
  }, [jobs, selectedJobId])

  // ---------------------------------------------------------------------
  // Seeker 브라우징
  // ---------------------------------------------------------------------
  const [seekers, setSeekers] = useState<PublicProfile[]>([])
  const [seekersLoading, setSeekersLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [filterNeighborhood, setFilterNeighborhood] = useState<string>('')
  const [filterCert, setFilterCert] = useState<string>('')

  const fetchSeekers = async () => {
    setSeekersLoading(true)
    setSearched(true)
    try {
      let query = supabase
        .from('profiles_public')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30)

      if (filterNeighborhood) {
        query = query.eq('neighborhood', filterNeighborhood)
      }

      if (filterCert === 'sir') {
        query = query.eq('has_sir', true)
      }

      if (filterCert === 'foodsafe') {
        query = query.eq('has_foodsafe', true)
      }

      const { data, error } = await query

      if (error) {
        console.warn('[dashboard] fetch seekers error:', error)
        setSeekers([])
      } else {
        let list = (data as PublicProfile[]) ?? []
        if (filterNeighborhood) {
          list = list.filter(s => s.neighborhood === filterNeighborhood)
        }
        if (filterCert === 'sir') {
          list = list.filter(s => s.has_sir === true)
        } else if (filterCert === 'foodsafe') {
          list = list.filter(s => s.has_foodsafe === true)
        }
        setSeekers(list)
      }
    } finally {
      setSeekersLoading(false)
    }
  }

  // 카드 클릭 → 상세 열람 (크레딧 차감)
  const access = useSeekerAccess()
  const [unlockedSeeker, setUnlockedSeeker] = useState<PublicProfile | null>(null)
  const [upsellOpen, setUpsellOpen] = useState(false)
  const [upsellReason, setUpsellReason] = useState<'no_credit' | 'pro_required' | 'payment_failed' | 'unknown'>('unknown')
  const [upsellFeature, setUpsellFeature] = useState<string | undefined>()

  const handleUnlockClick = async (seekerId: string) => {
    const result = await access.open(seekerId)
    if (result.status === 'blocked') {
      setUpsellReason(result.reason === 'no_credit' ? 'no_credit' : 'pro_required')
      setUpsellFeature('구직자 상세 프로필 열람')
      setUpsellOpen(true)
      return
    }
    if (result.profile) {
      setUnlockedSeeker(result.profile)
    }
  }

  // PRO 권한 체크
  const isPro = !!billing?.pro_subscriber || !!billing?.grace_period_active
  const creditsRemaining = billing?.credit_count ?? 0

  const filteredSeekers = useMemo(() => {
    return seekers
  }, [seekers])

  // 인증 로딩
  if (authLoading || !user || !profile) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 1. 인사 & 요약 헤더 */}
      <header className="rounded-3xl border border-gray-100 bg-white p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-orange-500">Employer Dashboard</p>
            <h1 className="mt-1 truncate text-2xl font-extrabold text-gray-900">
              {profile.name || '고용주'} 님, 안녕하세요 👋
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              오늘도 좋은 구직자를 만나보세요.
            </p>
          </div>
          <PlanBadge billing={billing} loading={billingLoading} />
        </div>

        <GracePeriodBanner initialStatus={billing} />
      </header>

      {/* 1.5 결제 직후 동기화 배너 */}
      <UpgradePendingBanner
        status={poll.status}
        elapsedMs={poll.elapsedMs}
        onRetry={() => {
          fetchBillingOnce()
          poll.start()
        }}
      />

      {/* 2. 결제/크레딧 상태 카드 (취소 예약 로직 통합 완) */}
      <BillingSummary
        billing={billing}
        loading={billingLoading}
        isPro={isPro}
        creditsRemaining={creditsRemaining}
        onUpgraded={async () => {
          await refreshProfile()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any).rpc('get_employer_billing_status')
          if (data) setBilling(data as EmployerBillingStatus)
          if ((data as EmployerBillingStatus | null)?.pro_subscriber) {
            setUpgradeJustCompleted(true)
          } else {
            setUpgradeJustCompleted(true)
            poll.start()
          }
        }}
        onRequestUpgrade={() => {
          setUpsellReason('pro_required')
          setUpsellFeature('무제한 구직자 열람 · 스마트 매칭 · 사전 질문 설정')
          setUpsellOpen(true)
        }}
      />


      {/* 3.5 PRO 전용: 사전 질문 & 서류 필터링 카드 */}
      <PreScreeningCard
        isPro={isPro}
        jobs={jobs}
        jobsLoading={jobsLoading}
        selectedJobId={selectedJobId}
        onSelectJob={setSelectedJobId}
        onRequireUpsell={() => {
          setUpsellReason('pro_required')
          setUpsellFeature('필수 서류·사전 질문 설정')
          setUpsellOpen(true)
        }}
      />

      {/* 4. 구직자 브라우저 */}
      <section className="rounded-3xl border border-gray-100 bg-white p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🔍 구직자 둘러보기</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              조건에 맞는 구직자를 검색하고 상세 프로필을 열어보세요.
            </p>
          </div>
          {!isPro && (
            <span className="rounded-full bg-orange-50 px-3 py-1 text-[11px] font-bold text-orange-600">
              {creditsRemaining} 크레딧 남음
            </span>
          )}
        </div>

        {/* 필터 바 */}
        <div className="mb-4 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-gray-500">
                거주 구역
              </label>
              <select
                value={filterNeighborhood}
                onChange={e => setFilterNeighborhood(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">전체 보기</option>
                {NEIGHBORHOOD_OPTIONS.map(n => (
                    <option key={n.value} value={n.value}>
                      {n.label}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold text-gray-500">
                보유 자격증
              </label>
              <select
                value={filterCert}
                onChange={e => setFilterCert(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">전체 보기</option>
                {CERT_OPTIONS.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchSeekers}
            disabled={seekersLoading}
            className="mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {seekersLoading ? '검색 중...' : searched ? '🔄 다시 검색' : '🔍 구직자 검색'}
          </button>
        </div>

        {/* 안내 배너: FREE 사용자 */}
        {!isPro && !searched && (
          <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 p-5 text-center">
            <p className="text-3xl">🔓</p>
            <p className="mt-2 text-sm font-semibold text-gray-800">
              가입 시 받은 {Math.max(creditsRemaining, 0)}개의 웰컴 크레딧으로 {Math.max(creditsRemaining, 0)}명의
              구직자 상세 프로필을 열어볼 수 있어요.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              그 이상은 PRO 플랜 ($29/월)에서 무제한으로 제공됩니다.
            </p>
            <button
              type="button"
              onClick={() => {
                setUpsellReason('pro_required')
                setUpsellFeature('무제한 구직자 열람 · 스케줄/자격증 매칭')
                setUpsellOpen(true)
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all active:scale-95"
            >
              ✨ PRO로 업그레이드
            </button>
          </div>
        )}

        {/* 결과 */}
        {searched && (
          <>
            {seekersLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredSeekers.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white py-10 text-center">
                <p className="text-3xl">😶</p>
                <p className="mt-2 text-sm font-semibold text-gray-700">
                  조건에 맞는 구직자가 없어요
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  필터를 조정하거나, 조금 더 기다려보세요.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredSeekers.map(seeker => (
                  <BlurredSeekerCard
                    key={seeker.id}
                    seeker={seeker}
                    isProEmployer={isPro}
                    canViewForFree={isPro}
                    creditsRemaining={isPro ? undefined : creditsRemaining}
                    interactive
                    onUnlockClick={() => handleUnlockClick(seeker.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* 5. PRO 업셀 모달 */}
      <ProUpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        reason={upsellReason}
        featureLabel={upsellFeature}
        returnTo="/employer/dashboard"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// PlanBadge — 우상단 FREE / PRO 라벨
// ---------------------------------------------------------------------------
function PlanBadge({
  billing,
  loading,
}: {
  billing: EmployerBillingStatus | null
  loading: boolean
}) {
  if (loading) {
    return <div className="h-7 w-20 animate-pulse rounded-full bg-gray-100" />
  }
  if (!billing?.ok) return null
  if (billing.pro_subscriber) {
    return (
      <span className="flex-shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-white">
        ✨ PRO
      </span>
    )
  }
  if (billing.grace_period_active) {
    return (
      <span className="flex-shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-700">
        ⏰ Grace
      </span>
    )
  }
  return (
    <span className="flex-shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-gray-600">
      FREE
    </span>
  )
}

// ---------------------------------------------------------------------------
// BillingSummary — 크레딧 / PRO 상태 요약 + 구독 만료 예약 UI 처리 완료
// ---------------------------------------------------------------------------
interface BillingSummaryProps {
  billing: EmployerBillingStatus | null
  loading: boolean
  isPro: boolean
  creditsRemaining: number
  onUpgraded: () => Promise<void>
  onRequestUpgrade: () => void
}

function BillingSummary({
  billing,
  loading,
  isPro,
  creditsRemaining,
  onUpgraded,
  onRequestUpgrade,
}: BillingSummaryProps) {
  const { session } = useAuth()
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('upgrade') === 'success') {
      onUpgraded()
      url.searchParams.delete('upgrade')
      window.history.replaceState({}, '', url.toString())
    }
  }, [onUpgraded])

  const openBillingPortal = async () => {
    setOpeningPortal(true)
    setPortalError(null)
    try {
      const accessToken = session?.access_token
      if (!accessToken) {
        throw new Error('로그인이 필요해요. 다시 로그인한 후 시도해주세요.')
      }
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? 'Failed to open billing portal')
      }
      window.location.href = data.url
    } catch (err) {
      console.log(err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setPortalError(msg)
      setOpeningPortal(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-gray-100 bg-white p-6">
        <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    )
  }

  // PRO 사용자 분기 내부 로직 수정 완료
  if (isPro) {
    const formattedEndDate = billing?.subscription_ends_at
      ? new Date(billing.subscription_ends_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
      : null
    
    // 💡 취소 여부 판별 가드 (Stripe webhook이 보낸 cancel_at_period_end가 참이거나 DB에 명시된 플래그 연동)
    const isScheduledToCancel = !!billing?.cancel_at_period_end

    return (
      <div className={`rounded-3xl border-2 p-6 transition-all ${
        isScheduledToCancel
          ? 'border-amber-300 bg-gradient-to-br from-amber-50/70 via-orange-50/30 to-white'
          : 'border-orange-200 bg-gradient-to-br from-orange-50/60 via-pink-50/20 to-white'
      }`}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-500">
                  HireVan PRO
                </p>
                {isScheduledToCancel && (
                  <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 animate-pulse">
                    해지 예약됨
                  </span>
                )}
              </div>
              
              {isScheduledToCancel ? (
                <>
                  <h2 className="mt-1.5 text-lg font-extrabold text-gray-900 tracking-tight">
                    ⏳ 멤버십이 곧 만료될 예정이에요
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {formattedEndDate ? (
                      <>이용 가능 기한: <strong className="text-amber-700 font-extrabold">{formattedEndDate}</strong>까지</>
                    ) : (
                      '멤버십이 곧 종료됩니다.'
                    )}
                  </p>
                  <p className="mt-1.5 text-xs font-medium text-amber-700/90 leading-relaxed">
                    해당 날짜 이후에는 FREE 플랜으로 자동 전환되며, 더 이상 구직자 프로필을 무제한으로 열람할 수 없게 됩니다.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-1.5 text-lg font-extrabold text-gray-900 tracking-tight">
                    🎉 PRO 플랜이 활성화되어 있어요
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    밴쿠버 모든 구직자 프로필을 제약 없이 무제한으로 열람할 수 있습니다.
                  </p>
                  {formattedEndDate && (
                    <p className="mt-2 text-xs text-gray-500 font-medium">
                      다음 정기 결제일: <strong className="text-gray-800 font-bold">{formattedEndDate}</strong>
                    </p>
                  )}
                </>
              )}
            </div>

            {isScheduledToCancel ? (
              <button
                type="button"
                onClick={onRequestUpgrade}
                className="flex-shrink-0 cursor-pointer rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-orange-500/20 transition-all hover:opacity-90 active:scale-95"
              >
                🔄 멤버십 유지하기
              </button>
            ) : (
              <button
                type="button"
                onClick={openBillingPortal}
                disabled={openingPortal}
                className="flex-shrink-0 cursor-pointer rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-bold text-orange-600 hover:bg-orange-50/50 transition-all active:scale-95 disabled:opacity-60"
              >
                {openingPortal ? '이동 중...' : '구독 관리'}
              </button>
            )}
          </div>

          {isScheduledToCancel && (
            <div className="rounded-2xl border border-amber-200 bg-white/80 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-700 leading-relaxed">
                💡 걱정하지 마세요! 아직 <strong className="text-gray-900">{formattedEndDate || '이번 달 결제 기간'}</strong>까지는 현재의 모든 PRO 기능과 혜택을 끊김 없이 정상적으로 이용하실 수 있습니다. 혜택 유지를 원하시면 만료 전에 언제든 다시 구독을 재개해보세요.
              </p>
            </div>
          )}

          {portalError && (
            <p className="rounded-xl bg-red-50 px-4 py-2 text-xs text-red-600 border border-red-100">{portalError}</p>
          )}
        </div>
      </div>
    )
  }

  // FREE 사용자
  return (
    <div className="rounded-3xl border-2 border-dashed border-orange-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Current Plan
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-gray-900">
            FREE 플랜 · 웰컴 크레딧 {creditsRemaining}개
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            PRO로 업그레이드하면 무제한 열람과 스마트 매칭을 이용할 수 있어요.
          </p>
        </div>
        <button
          type="button"
          onClick={onRequestUpgrade}
          className="flex-shrink-0 cursor-pointer rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-4 py-2 text-xs font-extrabold text-white shadow-md transition-all active:scale-95"
        >
          ✨ PRO 업그레이드
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-2xl bg-orange-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-orange-600">상세 프로필</p>
          <p className="mt-0.5 text-sm font-extrabold text-gray-900">
            {creditsRemaining}회
          </p>
        </div>
        <div className="rounded-2xl bg-gray-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-gray-500">스마트 매칭</p>
          <p className="mt-0.5 text-sm font-extrabold text-gray-400">🔒</p>
        </div>
        <div className="rounded-2xl bg-gray-50 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-gray-500">필터 검색</p>
          <p className="mt-0.5 text-sm font-extrabold text-gray-400">🔒</p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// UpgradePendingBanner — 결제 직후 webhook 동기화 대기 중 노출
// ---------------------------------------------------------------------------
import type { PollStatus as _PollStatus } from '@/lib/usePollProUpgrade'

interface UpgradePendingBannerProps {
  status: _PollStatus
  elapsedMs: number
  onRetry: () => void
}

function UpgradePendingBanner({ status, elapsedMs, onRetry }: UpgradePendingBannerProps) {
  if (status === 'idle' || status === 'active' || status === 'error') return null

  const remainingSec = Math.max(0, 5 - Math.ceil(elapsedMs / 1000))

  if (status === 'pending') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-3xl border border-orange-200 bg-gradient-to-r from-orange-50 to-pink-50 px-5 py-4"
      >
        <div className="h-6 w-6 flex-shrink-0 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">
            ✨ 결제 확인 중… (최대 5초)
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            Stripe가 구독 정보를 반영하는 중입니다. 보통 {remainingSec}초 안에 끝나요.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'timeout') {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-3xl border border-amber-300 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="text-2xl">⏰</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-900">
            결제가 완료되었는데 구독 상태가 아직 반영되지 않았어요.
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            잠시 후 자동으로 다시 확인하거나, 아래 버튼을 눌러 수동으로 동기화할 수 있어요.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="flex-shrink-0 rounded-full border border-amber-400 bg-white px-4 py-2 text-xs font-bold text-amber-700 transition-all active:scale-95"
        >
          🔄 다시 확인
        </button>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// PreScreeningCard — PRO 전용: 사전 질문 & 필수 서류 설정
// ---------------------------------------------------------------------------
const MAX_QUESTIONS_PRO = 5

interface PreScreeningCardProps {
  isPro: boolean
  jobs: JobPost[]
  jobsLoading: boolean
  selectedJobId: string | null
  onSelectJob: (id: string) => void
  onRequireUpsell: () => void
}

interface CustomQuestion {
  id: string
  question: string
}

function parseCustomQuestions(value: unknown): CustomQuestion[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null
      const id = typeof item.id === 'string' ? item.id : ''
      const question = typeof item.question === 'string' ? item.question.trim() : ''
      return id && question ? { id, question } : null
    })
    .filter((item): item is CustomQuestion => item !== null)
}

function PreScreeningCard({
  isPro,
  jobs,
  jobsLoading,
  selectedJobId,
  onSelectJob,
  onRequireUpsell,
}: PreScreeningCardProps) {
  const targetJob =
    jobs.find(j => j.id === selectedJobId) ?? jobs[0] ?? null

  const [requireResume, setRequireResume] = useState<boolean>(false)
  const [questions, setQuestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!targetJob) {
      setRequireResume(false)
      setQuestions([])
      return
    }
    setRequireResume(!!targetJob.require_resume)
    setQuestions(parseCustomQuestions(targetJob.custom_questions).map(q => q.question))
    setSavedAt(null)
    setError(null)
  }, [targetJob?.id, targetJob?.require_resume, targetJob?.custom_questions, targetJob])

  if (jobsLoading) {
    return (
      <div className="rounded-3xl border border-gray-100 bg-white p-6">
        <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <section className="rounded-3xl border-2 border-dashed border-orange-200 bg-gradient-to-br from-orange-50/60 to-pink-50/40 p-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">📄 사전 질문 & 필수 서류</h2>
          <span className="rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
            PRO
          </span>
        </div>
        <p className="mb-3 text-sm font-semibold text-gray-800">
          필요한 서류와 사전 질문을 받아 더 잘 맞는 지원자를 빠르게 확인하세요.
        </p>
        <p className="text-xs text-gray-500">
          먼저 공고를 하나 등록해주세요. 그 다음 이 카드에서 이력서/사전 질문 설정을 할 수 있습니다.
        </p>
        <Link
          href="/employer/jobs/new"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          ＋ 공고 등록하러 가기
        </Link>
      </section>
    )
  }

  if (!isPro) {
    return (
      <section
        aria-label="PRO 전용 기능: 사전 질문 및 서류 필터링"
        className="relative overflow-hidden rounded-3xl border-2 border-orange-200 bg-white p-6"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900">📄 사전 질문 & 필수 서류</h2>
              <span className="rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
                PRO
              </span>
            </div>
            <p className="text-xs text-gray-500">
              필요한 서류와 사전 질문을 받아 더 잘 맞는 지원자를 빠르게 확인하세요.
            </p>
          </div>
          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-600">
            🔒 잠금
          </span>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none select-none rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4"
        >
          <div className="mb-3 flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2.5">
            <span className="text-xs font-semibold text-gray-700">이력서 첨부 필수</span>
            <span className="h-5 w-9 rounded-full bg-gray-200" />
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5"
              >
                <span className="text-[10px] font-bold text-gray-300">Q{i}.</span>
                <span className="h-3 flex-1 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
          <div
            className="mt-4 h-32 rounded-xl bg-gradient-to-br from-gray-100 to-gray-50"
            style={{ filter: 'blur(6px)' }}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-white/40 to-white/90"
        />

        <div className="relative mt-4 flex flex-col items-center gap-2">
          <p className="text-center text-sm font-semibold text-gray-800">
            이 기능은 PRO 플랜에서 사용할 수 있어요.
          </p>
          <button
            type="button"
            onClick={onRequireUpsell}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all active:scale-95"
          >
            ✨ PRO로 업그레이드하고 사용하기
          </button>
          <p className="text-[11px] text-gray-400">월 $29 · 사전 질문 5개까지 · 이력서 필터</p>
        </div>
      </section>
    )
  }

  const handleAddQuestion = () => {
    if (!isPro) {
      onRequireUpsell()
      return
    }
    if (questions.length >= MAX_QUESTIONS_PRO) return
    setQuestions(prev => [...prev, ''])
  }
  const handleQuestionChange = (idx: number, value: string) => {
    if (!isPro) {
      onRequireUpsell()
      return
    }
    setQuestions(prev => prev.map((q, i) => (i === idx ? value : q)))
  }
  const handleRemoveQuestion = (idx: number) => {
    if (!isPro) {
      onRequireUpsell()
      return
    }
    setQuestions(prev => prev.filter((_, i) => i !== idx))
  }
  const handleToggleRequireResume = () => {
    if (!isPro) {
      onRequireUpsell()
      return
    }
    setRequireResume(prev => !prev)
  }

  const handleSave = async () => {
    if (!targetJob) return
    setSaving(true)
    setError(null)
    try {
      const cleanedQuestions = questions
        .map(q => q.trim())
        .filter(Boolean)
        .map((question, index) => ({ id: `q${index + 1}`, question }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('job_posts')
        .update({
          require_resume: requireResume,
          custom_questions: cleanedQuestions,
        })
        .eq('id', targetJob.id)

      if (updateError) throw updateError
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했어요')
    } finally {
      setSaving(false)
    }
  }

  const questionCount = questions.filter(q => q.trim()).length

  return (
    <section className="rounded-3xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/60 to-pink-50/40 p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">📄 사전 질문 & 필수 서류</h2>
            <span className="rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-white">
              ✨PRO
            </span>
            <span className="rounded-full border border-orange-200 bg-white px-2 py-0.5 text-[10px] font-bold text-orange-600">
              지원자 필터링 조건 설정
            </span>
          </div>
          <p className="text-xs text-gray-500">
            필요한 서류와 사전 질문을 받아 더 잘 맞는 지원자를 빠르게 확인하세요.
          </p>
        </div>
        <Link
          href="/employer/jobs"
          className="flex-shrink-0 text-xs font-semibold text-orange-500 hover:underline"
        >
          전체 보기 ›
        </Link>
      </div>

      {jobs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {jobs.map(job => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelectJob(job.id)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                (selectedJobId ?? jobs[0]?.id) === job.id
                  ? 'text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-orange-200'
              }`}
              style={
                (selectedJobId ?? jobs[0]?.id) === job.id
                  ? { backgroundColor: 'var(--brand)' }
                  : {}
              }
            >
              {job.title}
            </button>
          ))}
        </div>
      )}

      {targetJob && (
        <div className="space-y-4">
          <p className="text-[11px] font-semibold text-gray-500">
            적용 대상: <span className="text-gray-800">{targetJob.title}</span>
          </p>

          <button
            type="button"
            onClick={handleToggleRequireResume}
            disabled={!isPro}
            aria-disabled={!isPro}
            aria-pressed={requireResume}
            className={`flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left transition-all active:scale-[0.99] ${
              isPro ? '' : 'cursor-not-allowed opacity-60'
            }`}
            title={isPro ? undefined : 'PRO 플랜에서 사용 가능'}
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">
                📎 이력서 첨부 필수
                <span className="ml-1.5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-1.5 py-0.5 align-middle text-[9px] font-extrabold tracking-wider text-white">
                  PRO
                </span>
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                지원자가 이력서를 함께 제출해야 지원이 완료됩니다.
              </p>
            </div>
            <span
              className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                requireResume ? 'bg-orange-500' : 'bg-gray-200'
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  requireResume ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </button>

          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">💬 사전 질문</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  지원자에게 미리 답변을 받아 빠르게 솎아내세요. (최대 {MAX_QUESTIONS_PRO}개)
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddQuestion}
                disabled={!isPro || questions.length >= MAX_QUESTIONS_PRO}
                aria-disabled={!isPro}
                title={isPro ? undefined : 'PRO 플랜에서 사용 가능'}
                className="flex-shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-600 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-300"
              >
                + 추가
              </button>
            </div>

            {questions.length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-400">
                아직 질문이 없어요. 예: “밴쿠버 내에서 마감조 출퇴근이 원활하신가요?”
              </p>
            ) : (
              <div className="space-y-2">
                {questions.map((question, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={question}
                      onChange={event => handleQuestionChange(index, event.target.value)}
                      disabled={!isPro}
                      aria-disabled={!isPro}
                      maxLength={120}
                      placeholder={`질문 ${index + 1}. 예: 가능한 근무 시작일은 언제인가요?`}
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(index)}
                      disabled={!isPro}
                      aria-disabled={!isPro}
                      className="h-[42px] w-[42px] flex-shrink-0 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`질문 ${index + 1} 삭제`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
          )}
          {savedAt && !error && (
            <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
              ✅ 저장되었어요. 지원자에게 이력서 {requireResume ? '필수 + ' : ''}
              {questionCount > 0 ? `사전 질문 ${questionCount}개` : ''}가 노출됩니다.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {saving ? '저장 중...' : '사전 질문 / 서류 조건 저장'}
          </button>
        </div>
      )}
    </section>
  )
}