import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastTone = 'success' | 'info' | 'error'

export interface ToastState {
  id: number
  message: string
  tone: ToastTone
}

export interface UseToastReturn {
  toast: ToastState | null
  showToast: (message: string, tone?: ToastTone) => void
  clearToast: () => void
}

const DEFAULT_DURATION_MS = 3000

/**
 * useToast — 전역 토스트 알림을 위한 경량 훅.
 *
 * - 동일한 `id` 를 기반으로 큐잉하므로 빠른 연속 호출에서도 마지막 메시지만 표시된다.
 * - 컴포넌트 unmount 시 타이머를 정리하여 "state update on unmounted component" 경고를 막는다.
 *
 * 사용 예:
 *   const { toast, showToast } = useToast()
 *   <ToastBanner toast={toast} />
 *   showToast('저장되었어요!', 'success')
 */
export function useToast(durationMs: number = DEFAULT_DURATION_MS): UseToastReturn {
  const [toast, setToast] = useState<ToastState | null>(null)
  const toastIdRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setToast(null)
  }, [])

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = ++toastIdRef.current
      setToast({ id, message, tone })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setToast(prev => (prev && prev.id === id ? null : prev))
        timerRef.current = null
      }, durationMs)
    },
    [durationMs],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { toast, showToast, clearToast }
}