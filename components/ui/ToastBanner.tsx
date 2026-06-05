'use client'

import type { ToastState, ToastTone } from '@/lib/useToast'

interface ToastBannerProps {
  toast: ToastState | null
  /** 위치 (기본: 화면 하단 중앙) */
  position?: 'bottom' | 'top'
}

const TONE_STYLES: Record<ToastTone, { container: string; icon: string }> = {
  success: {
    container: 'bg-green-50 text-green-800 ring-green-200',
    icon: '✅',
  },
  info: {
    container: 'bg-gray-50 text-gray-800 ring-gray-200',
    icon: 'ℹ️',
  },
  error: {
    container: 'bg-red-50 text-red-800 ring-red-200',
    icon: '⚠️',
  },
}

/**
 * ToastBanner
 *
 * useToast 훅이 만들어낸 토스트 상태를 받아 화면에 띄우는 프레젠테이션 컴포넌트.
 * 토스트가 null 이면 아무것도 렌더하지 않는다.
 *
 * 사용 예:
 *   const { toast, showToast } = useToast()
 *   <ToastBanner toast={toast} />
 *   <button onClick={() => showToast('저장되었어요', 'success')}>저장</button>
 */
export default function ToastBanner({ toast, position = 'bottom' }: ToastBannerProps) {
  if (!toast) return null
  const tone = TONE_STYLES[toast.tone] ?? TONE_STYLES.info
  const positionClass = position === 'top' ? 'top-6' : 'bottom-6'

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 ${positionClass} z-50 flex justify-center px-4 pointer-events-none`}
    >
      <div
        className={`pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ring-1 ${tone.container}`}
      >
        <span className="mr-1">{tone.icon}</span>
        {toast.message}
      </div>
    </div>
  )
}