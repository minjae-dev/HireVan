'use client'

import { useAuth } from '@/lib/auth-context'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function ClaimContent() {
  const searchParams = useSearchParams()
  const jobId = searchParams.get('job_id')
  const { profile, user } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState<'loading' | 'phone' | 'claiming' | 'done' | 'error'>('loading')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    // 이미 로그인되어 있으면 phone 입력 단계로
    if (user && profile) {
      if (profile.role !== 'employer') {
        setError('채용자(employer) 계정으로 로그인해주세요.')
        setStep('error')
        return
      }
      setStep('phone')
    } else if (user === null) {
      // 로그인 안 됨 → 로그인 페이지로 리다이렉트 (job_id 유지)
      router.push(`/login?redirect=/auth/claim?job_id=${jobId}`)
    }
    // user가 undefined(로딩 중)이면 아무것도 안 함
  }, [user, profile, router, jobId])

  const handleClaim = async () => {
    if (!phone.trim()) return
    setStep('claiming')
    setError('')
    setMessage('')

    try {
      const res = await fetch('/api/auth/employer-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/[^0-9]/g, ''),
          job_id: jobId || undefined,
        }),
      })

      const data = await res.json()

      if (data.step === 'signup_required') {
        setMessage(data.message)
        setStep('phone')
        return
      }

      if (!data.ok) {
        setError(data.message || data.error || '활성화에 실패했습니다.')
        setStep('phone')
        return
      }

      setStep('done')
      setMessage(`${data.activated_count}개의 공고가 활성화되었습니다!`)
    } catch (err) {
      setError('서버 연결에 실패했습니다.')
      setStep('phone')
    }
  }

  if (step === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="max-w-md mx-auto mt-20 p-6">
        <div className="text-center py-10">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="rounded-xl bg-orange-500 text-white px-6 py-3 font-medium"
          >
            로그인하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-12 px-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🏪</p>
          <h1 className="text-xl font-bold text-gray-900">사장님 계정 활성화</h1>
          <p className="text-sm text-gray-500 mt-1">
            크롤링된 공고를 내 계정으로 가져옵니다
          </p>
          {jobId && (
            <p className="text-xs text-gray-400 mt-2">
              공고 ID: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{jobId}</code>
            </p>
          )}
        </div>

        {step === 'done' ? (
          <div className="text-center py-6">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-gray-800 font-medium mb-2">{message}</p>
            <p className="text-sm text-gray-500 mb-6">
              대시보드에서 지원자를 확인하고 채팅을 시작하세요.
            </p>
            <button
              onClick={() => router.push('/employer/dashboard')}
              className="w-full rounded-2xl bg-orange-500 text-white py-4 font-bold hover:bg-orange-600 active:scale-95 transition-all"
            >
              대시보드로 이동
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                공고에 등록된 전화번호
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="예: 6041234567"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                disabled={step === 'claiming'}
              />
              <p className="text-xs text-gray-400 mt-1.5">
                한인마트 게시판에 등록한 연락처와 동일한 번호를 입력하세요.
              </p>
            </div>

            {message && (
              <p className="mb-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-600">{message}</p>
            )}
            {error && (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>
            )}

            <button
              onClick={handleClaim}
              disabled={step === 'claiming' || !phone.trim()}
              className={`w-full rounded-2xl py-4 font-bold transition-all active:scale-95 ${
                step === 'claiming' || !phone.trim()
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-orange-500 text-white hover:bg-orange-600'
              }`}
            >
              {step === 'claiming' ? '처리 중...' : '사장님 계정 활성화하기'}
            </button>
          </>
        )}
      </div>
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