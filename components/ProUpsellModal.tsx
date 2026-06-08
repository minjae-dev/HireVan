'use client'

import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ProUpsellModalProps {
  open: boolean
  onClose: () => void
  /**
   * 모달이 뜨게 된 사유. UI 카피를 분기한다.
   * - 'no_credit'   : 크레딧 소진
   * - 'pro_required': PRO 전용 기능 사용 시도
   * - 'payment_failed': 결제 실패
   * - 'unknown'
   */
  reason?: 'no_credit' | 'pro_required' | 'payment_failed' | 'unknown'
  /**
   * 표시할 기능 이름. 예: "목요일 오전 시프트", "Serving It Right 보유 구직자 검색"
   */
  featureLabel?: string
  /**
   * 결제 후 돌아올 경로. default: '/profile'
   */
  returnTo?: string
}

const REASON_COPY: Record<NonNullable<ProUpsellModalProps['reason']>, {
  title: string
  subtitle: string
  highlight: string
}> = {
  no_credit: {
    title: '웰컴 크레딧을 모두 사용했어요',
    subtitle: '추가 구직자 프로필을 열람하려면 PRO 플랜이 필요해요.',
    highlight: '월 $29 (CAD) · 언제든 해지 가능',
  },
  pro_required: {
    title: 'PRO 플랜 전용 기능이에요',
    subtitle: '스케줄 / 자격증 매칭 검색은 PRO 구독자에게만 제공됩니다.',
    highlight: '월 $29 (CAD) · 14일 무료 체험',
  },
  payment_failed: {
    title: '결제 처리에 실패했어요',
    subtitle: '카드를 다시 확인하시거나, 잠시 후 다시 시도해주세요.',
    highlight: '3일 유예기간 동안 PRO 혜택은 유지됩니다',
  },
  unknown: {
    title: 'PRO 플랜 구독이 필요해요',
    subtitle: 'HireVan PRO와 함께 더 많은 구직자를 만나보세요.',
    highlight: '월 $29 (CAD) · 언제든 해지 가능',
  },
}

/**
 * ProUpsellModal
 *
 * 고용주 대시보드에서 크레딧 소진 또는 PRO 전용 기능 사용 시 노출되는
 * 결제 유도 모달. Stripe Checkout API를 호출해 session URL을 받은 뒤
 * 브라우저를 그쪽으로 리다이렉트한다.
 *
 * 모달 자체는 시각적인 안내 + CTA 역할만 한다.
 * 결제 라우팅은 /api/stripe/checkout 으로 위임한다.
 */
export default function ProUpsellModal({
  open,
  onClose,
  reason = 'unknown',
  featureLabel,
  returnTo = '/profile',
}: ProUpsellModalProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ESC로 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // body 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const copy = REASON_COPY[reason]

  const handleSubscribe = async () => {
    setSubmitting(true)
    setError(null)
    try {
      // 1) Supabase 세션의 access_token 을 헤더로 동봉한다.
      //    서버 라우트는 Authorization: Bearer 헤더 또는 sb-* 쿠키 양쪽을
      //    모두 지원하지만, supabase-js 의 기본 storage 가 localStorage 이므로
      //    명시적으로 토큰을 전달해 401 Unauthorized 를 방지한다.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token

      if (sessionError) {
        throw new Error(`세션 확인 실패: ${sessionError.message}`)
      }
      if (!accessToken) {
        throw new Error('로그인이 필요해요. 다시 로그인한 후 시도해주세요.')
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      }

      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ returnTo }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to start checkout')
      }

      const data = (await response.json()) as { url?: string; error?: string }
      if (!data.url) throw new Error('No checkout URL returned')
      window.location.href = data.url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-upsell-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6 L18 18 M6 18 L18 6" />
          </svg>
        </button>

        {/* Badge */}
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          ✨ HireVan PRO
        </div>

        <h2
          id="pro-upsell-title"
          className="text-2xl font-extrabold leading-tight text-gray-900"
        >
          {copy.title}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-gray-600">{copy.subtitle}</p>

        {featureLabel && (
          <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-900">
            <span className="font-semibold">요청 기능:</span> {featureLabel}
          </div>
        )}

        {/* Benefits */}
        <ul className="mt-5 space-y-2.5 text-sm text-gray-700">
          {[
            '구직자 상세 프로필 무제한 열람',
            '스케줄 / 자격증 기반 스마트 매칭',
            '이력서, 비자 만료일, 거주 구역까지 한눈에',
          ].map(item => (
            <li key={item} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] font-bold text-green-700">
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {/* Price */}
        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold text-gray-900">$29</span>
          <span className="text-sm font-medium text-gray-500">CAD / 월</span>
        </div>
        <p className="mt-1 text-xs font-medium text-orange-600">{copy.highlight}</p>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={submitting}
          className="mt-6 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-pink-500 py-3.5 text-base font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? '결제 페이지로 이동 중...' : '🚀 PRO 플랜 구독하기'}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-2xl py-2.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
        >
          나중에 할게요
        </button>

        <p className="mt-3 text-center text-[11px] text-gray-400">
          모든 결제는 Stripe Checkout을 통해 안전하게 처리됩니다.<br></br>
서비스 특성상 결제 완료 후에는 환불이 어려우나, 구독 취소는 Billing Portal에서 언제든 직접 요청하실 수 있습니다.
구독을 취소하더라도 결제하신 기간까지는 프리미엄 서비스를 정상적으로 이용 가능합니다.
        </p>
      </div>
    </div>
  )
}
