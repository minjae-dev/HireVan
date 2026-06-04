'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { EmployerBillingStatus } from '@/lib/database.types'

interface GracePeriodBannerProps {
  /**
   * Optional: 상위에서 이미 로드한 billing 상태를 주입하고 싶을 때 사용.
   * 주입하지 않으면 자체적으로 RPC를 호출한다.
   */
  initialStatus?: EmployerBillingStatus | null
}

/**
 * GracePeriodBanner
 *
 * 대시보드 상단에 노출되는 경고 배너.
 * 표시 조건:
 *  - `grace_period_active=true` (결제 실패 후 유예기간 3일 진행 중)
 *  - `last_payment_failed_at` (방금 결제 실패)
 *  - `plan='pro'` 인데 `pro_subscriber=false` (취소 후 유예 만료 임박)
 *
 * `expire_grace_periods()` RPC가 주기적으로 실행되어야 정상 동작하지만,
 * 배너 자체는 클라이언트에서 표시만 담당한다.
 */
export default function GracePeriodBanner({ initialStatus }: GracePeriodBannerProps) {
  const [status, setStatus] = useState<EmployerBillingStatus | null>(initialStatus ?? null)
  const [now, setNow] = useState(() => Date.now())
  const [loading, setLoading] = useState(!initialStatus)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (initialStatus) return // initialStatus는 useState 초기값으로 적용됨
    let cancelled = false
    ;(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_employer_billing_status')
      if (cancelled) return
      if (error) {
        console.warn('[GracePeriodBanner] RPC error:', error)
        setStatus(null)
      } else {
        setStatus(data as EmployerBillingStatus)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [initialStatus])

  // 매 30초마다 시간 갱신 → 카운트다운이 정확하게 동작
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  if (loading || !status || !status.ok || dismissed) return null
  // status.ok=false 인 경우 (e.g. not_employer)는 위 if에서 이미 null 반환됨

  // 유예기간 활성 → 가장 경각심 있는 배너
  if (status.grace_period_active && status.grace_period_ends_at) {
    const endsAt = new Date(status.grace_period_ends_at).getTime()
    const msLeft = Math.max(0, endsAt - now)
    const hoursLeft = Math.floor(msLeft / (60 * 60 * 1000))
    const daysLeft = Math.floor(hoursLeft / 24)
    const remainingLabel =
      daysLeft > 0
        ? `${daysLeft}일 ${hoursLeft % 24}시간`
        : hoursLeft > 0
          ? `${hoursLeft}시간`
          : '곧 종료'

    return (
      <div className="mb-4 flex items-start gap-3 rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm">
        <span className="text-2xl">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">
            결제에 실패해 PRO 혜택이 곧 종료됩니다
          </p>
          <p className="mt-1 text-xs text-amber-800">
            카드 정보를 업데이트하지 않으면 <strong>{remainingLabel} 뒤</strong>에 PRO 혜택이
            종료되고 무료 플랜으로 전환됩니다.
          </p>
        </div>
        <Link
          href="/profile"
          className="flex-shrink-0 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-95 hover:bg-amber-700"
        >
          결제 수단 변경
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="배너 닫기"
          className="flex-shrink-0 rounded-lg p-1 text-amber-700 transition-colors hover:bg-amber-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 6 L18 18 M6 18 L18 6" />
          </svg>
        </button>
      </div>
    )
  }

  // 결제 실패 이력은 있지만 grace_period 비활성 (이미 만료되었거나 결제 정상화됨)
  if (status.last_payment_failed_at && !status.pro_subscriber) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <span className="text-xl">ℹ️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">PRO 구독이 종료되었습니다</p>
          <p className="mt-0.5 text-xs text-gray-600">
            언제든 다시 구독하여 PRO 혜택을 누리세요.
          </p>
        </div>
        <Link
          href="/profile"
          className="flex-shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          다시 구독하기
        </Link>
      </div>
    )
  }

  return null
}
