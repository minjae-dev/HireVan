'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useAuth } from '@/lib/auth-context'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

type JobPost = Database['public']['Tables']['job_posts']['Row'] & {
  company_name?: string | null
}

function ClaimContent() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get('job_id')
  const { profile, user, refreshProfile } = useAuth()
  const router = useRouter()
  const [job, setJob] = useState<JobPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState<'preview' | 'signup' | 'claiming' | 'done'>('preview')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [jobError, setJobError] = useState('')

  // 자동 생성될 값들
  const autoEmail = job
    ? (job.company_name || 'business').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() + '@hire-van.com'
    : ''
  const autoName = job?.company_name || ''

  // 1) URL의 job_id로 공고 정보를 불러온다 (로그인 불필요)
  useEffect(() => {
    if (!jobId) {
      setJobError('공고 ID가 없습니다. 링크를 다시 확인해주세요.')
      setLoading(false)
      return
    }
    const fetchJob = async () => {
      const { data } = await supabase
        .from('job_posts')
        .select('*')
        .eq('id', jobId)
        .maybeSingle()
      if (!data) {
        setJobError('공고를 찾을 수 없습니다.')
      } else {
        setJob(data as unknown as JobPost)
      }
      setLoading(false)
    }
    fetchJob()
  }, [jobId])

  // 2) 이미 로그인된 상태면 바로 claim 시도
  useEffect(() => {
    if (!loading && !jobError && user && profile && step === 'preview') {
      // 이미 employer 계정으로 로그인되어 있으면 바로 claim
      if (profile.role === 'employer') {
        handleClaim()
      }
    }
  }, [user, profile, loading])

  // 3) 버튼 클릭 → 비로그인이면 signup 폼 표시, 로그인 상태면 claim API 호출
  const handleActivateClick = () => {
    if (!user) {
      setStep('signup')
      return
    }
    handleClaim()
  }

  const handleClaim = async () => {
    if (!job) return
    setStep('claiming')
    setError('')

    try {
      const res = await fetch('/api/auth/employer-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
        }),
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.message || data.error || '활성화에 실패했습니다.')
        setStep('preview')
        return
      }

      setStep('done')
      // 1초 후 대시보드로 이동
      setTimeout(() => router.push(`/employer/jobs/${job.id}`), 1000)
    } catch (err) {
      setError('서버 연결에 실패했습니다. 다시 시도해주세요.')
      setStep('preview')
    }
  }

  // 4) 3초 가입: 비밀번호만 입력받아 회원가입 + claim
  const handleQuickSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!job || password.length < 6) return
    setError('')
    setStep('claiming')

    try {
      // 1) Supabase Auth 회원가입
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: authData, error: signUpError } = await (supabase.auth as any).signUp({
        email: autoEmail,
        password,
      })

      if (signUpError || !authData.user) {
        throw new Error(signUpError?.message || '회원가입에 실패했습니다.')
      }

      // 2) profiles 테이블에 employer 계정 생성 (service role 경유)
      const { error: profileError } = await supabase.from('profiles').insert({
        id: authData.user.id,
        role: 'employer',
        name: autoName,
      })

      if (profileError) {
        throw new Error(profileError.message)
      }

      // 3) 프로필 리프레시
      await refreshProfile()

      // 4) claim API 호출
      const res = await fetch('/api/auth/employer-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
        }),
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.message || data.error || '공고 연결에 실패했습니다.')
        setStep('signup')
        return
      }

      setStep('done')
      setTimeout(() => router.push(`/employer/jobs/${job.id}`), 1000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.'
      setError(msg)
      setStep('signup')
    }
  }

  // ── 로딩 중 ──
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── 공고 로딩 실패 ──
  if (jobError) {
    return (
      <div className="max-w-md mx-auto mt-20 px-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-gray-600 mb-2">{jobError}</p>
          <p className="text-sm text-gray-400">SMS에 포함된 링크를 정확히 클릭했는지 확인해주세요.</p>
        </div>
      </div>
    )
  }

  if (!job) return null

  // ── 가입/처리 중 ──
  if (step === 'claiming') {
    return (
      <div className="flex justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-sm">공고를 활성화하는 중...</p>
        </div>
      </div>
    )
  }

  // ── 완료 ──
  if (step === 'done') {
    return (
      <div className="max-w-md mx-auto mt-20 px-4 text-center">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">공고가 활성화되었습니다!</h2>
        <p className="text-sm text-gray-500">잠시 후 대시보드로 이동합니다.</p>
      </div>
    )
  }

  // ── 3초 가입 폼 ──
  if (step === 'signup') {
    return (
      <div className="max-w-lg mx-auto mt-8 px-4 pb-16">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          {/* 안내 문구 */}
          <div className="text-center mb-6">
            <p className="text-3xl mb-1">🚀</p>
            <h1 className="text-lg font-bold text-gray-900">3초 만에 가입하고 시작하기</h1>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              사장님! 이미 등록된 공고 정보로 <strong>3초 만에 가입</strong>하세요.
              <br />
              비밀번호만 설정하면 바로 지원자 관리가 가능합니다.
            </p>
          </div>

          {/* 자동 채워진 정보 요약 */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">업체명</span>
              <span className="font-medium text-gray-800">{autoName || '(정보 없음)'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">이메일</span>
              <span className="font-medium text-gray-800">{autoEmail}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">연동될 공고</span>
              <span className="font-medium text-gray-800">{job.title}</span>
            </div>
          </div>

          <form onSubmit={handleQuickSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                비밀번호 설정 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="6자 이상 입력해주세요"
                required
                minLength={6}
                className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">6자 이상의 비밀번호를 입력하세요.</p>
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={password.length < 6}
              className="w-full rounded-2xl bg-orange-500 text-white py-4 font-bold text-base hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              3초 만에 가입하고 지원자 확인하기
            </button>
          </form>

          {/* 로그인 링크 */}
          <p className="text-center mt-5 text-sm text-gray-400">
            이미 계정이 있으신가요?{' '}
            <button
              onClick={() => router.push(`/login?redirect=/auth/claim?job_id=${jobId}`)}
              className="text-orange-500 font-medium hover:underline"
            >
              로그인
            </button>
          </p>
        </div>
      </div>
    )
  }

  // ── 공고 미리보기 (기본 step: preview) ──
  return (
    <div className="max-w-lg mx-auto mt-8 px-4 pb-16">
      {/* 페이지 타이틀 */}
      <div className="text-center mb-6">
        <p className="text-3xl mb-1">📋</p>
        <h1 className="text-xl font-bold text-gray-900">공고를 확인하고 활성화하세요</h1>
        <p className="text-sm text-gray-500 mt-1">
          한인마트에 올리신 공고입니다. 계정과 연동하여 지원자를 관리하세요.
        </p>
      </div>

      {/* ── 공고 카드 (미리보기) ── */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-lg leading-snug">{job.title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {job.company_name ?? '업체명 미등록'}
            </p>
          </div>
          <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            모집중
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {job.location && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1.5">
              <span>📍</span>
              <span>{job.location}</span>
            </span>
          )}
          {job.salary && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1.5">
              <span>💰</span>
              <span>{job.salary}</span>
            </span>
          )}
          {job.work_hours && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1.5">
              <span>🕐</span>
              <span>{job.work_hours}</span>
            </span>
          )}
        </div>

        {job.description && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-2">
            {job.description}
          </p>
        )}

        <p className="text-xs text-gray-400">
          {new Date(job.created_at).toLocaleDateString('ko-KR')} 등록
        </p>
      </div>

      {/* ── 설명 문구 ── */}
      <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-5">
        <p className="text-xs text-orange-700 leading-relaxed">
          <strong>✔️ 이 공고는 한인마트에서 크롤링된 공고입니다.</strong>
          <br />
          아래 버튼을 누르면 이 공고가 내 계정에 등록되고, 지원자 확인 및 채팅이 가능해집니다.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>
      )}

      {/* ── 활성화 버튼 ── */}
      <button
        onClick={handleActivateClick}
        className="w-full rounded-2xl bg-orange-500 text-white py-4 font-bold text-base hover:bg-orange-600 active:scale-[0.98] transition-all shadow-sm"
      >
        {user ? '내 공고 지원자 확인하고 시작하기' : '3초 만에 가입하고 지원자 확인하기'}
      </button>

      <p className="text-center mt-6 text-xs text-gray-400">
        도움이 필요하시면{' '}
        <a href="mailto:support@hire-van.com" className="text-orange-500 underline">
          support@hire-van.com
        </a>
        으로 문의해주세요.
      </p>
    </div>
  )
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ClaimContent />
    </Suspense>
  )
}