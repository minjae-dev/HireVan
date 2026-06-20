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
  const { profile, user } = useAuth()
  const router = useRouter()
  const [job, setJob] = useState<JobPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')
  const [jobError, setJobError] = useState('')

  // 1) URL의 job_id로 공고 정보를 불러온다 (로그인 여부와 무관하게 먼저 실행)
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

  // 2) 버튼 클릭 핸들러 — 로그인 상태에 따라 분기
  const handleClaim = async () => {
    // 비로그인 상태 → 로그인 페이지로 이동 (job_id 유지)
    if (!user) {
      router.push(`/login?redirect=/auth/claim?job_id=${jobId}`)
      return
    }

    // 로그인 상태 → claim API 호출
    if (!job) return
    setClaiming(true)
    setError('')

    try {
      const res = await fetch('/api/auth/employer-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: profile?.name, // fallback — 실제로는 signup 시 입력한 phone 사용
          job_id: job.id,
        }),
      })

      const data = await res.json()

      if (data.step === 'signup_required') {
        setError('해당 번호로 등록된 공고를 찾을 수 없습니다. 고객센터로 문의해주세요.')
        setClaiming(false)
        return
      }

      if (!data.ok) {
        setError(data.message || data.error || '활성화에 실패했습니다.')
        setClaiming(false)
        return
      }

      // 성공 → 해당 공고의 employer 대시보드로 이동
      router.push(`/employer/jobs/${job.id}`)
    } catch (err) {
      setError('서버 연결에 실패했습니다. 다시 시도해주세요.')
      setClaiming(false)
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

  // ── 공고 미리보기 + 활성화 ──
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
        {/* 헤더: 제목 + 상태 */}
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

        {/* 태그: 위치 · 급여 · 근무시간 */}
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

        {/* 상세 내용 (최대 3줄) */}
        {job.description && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 mb-2">
            {job.description}
          </p>
        )}

        {/* 등록일 */}
        <p className="text-xs text-gray-400">
          {new Date(job.created_at).toLocaleDateString('ko-KR')} 등록
        </p>
      </div>

      {/* ── 설명 문구 ── */}
      <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 mb-5">
        <p className="text-xs text-orange-700 leading-relaxed">
          <strong>✔️ 이 공고는 한인마트에서 크롤링된 공고입니다.</strong>
          <br />
          버튼을 누르면 이 공고가 내 계정에 등록되고, 지원자 확인 및 채팅이 가능해집니다.
        </p>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>
      )}

      {/* ── 활성화 버튼 ── */}
      <button
        onClick={handleClaim}
        disabled={claiming}
        className="w-full rounded-2xl bg-orange-500 text-white py-4 font-bold text-base hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      >
        {claiming ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            처리 중...
          </span>
        ) : user ? (
          '내 공고 지원자 확인하고 시작하기'
        ) : (
          '로그인하고 공고 활성화하기'
        )}
      </button>

      {/* 푸터 링크 */}
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