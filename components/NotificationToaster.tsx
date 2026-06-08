'use client'

/**
 * components/NotificationToaster.tsx
 */

import { markNotificationRead, onNewNotification, type ChatNotification } from '@/lib/notifications'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const TOAST_TTL_MS = 5000

interface ToastItem extends ChatNotification {
  toastId: number
}

let toastIdCounter = 0

export default function NotificationToaster() {
  const router = useRouter()
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((toastId: number) => {
    setItems((prev) => prev.filter((t) => t.toastId !== toastId))
  }, [])

  useEffect(() => {
    const off = onNewNotification((n) => {
      if (typeof window !== 'undefined' && window.location.pathname === '/chat/' + n.chat_room_id) {
        return
      }
      const toastId = ++toastIdCounter
      setItems((prev) => [{ ...n, toastId }, ...prev].slice(0, 4))
      setTimeout(() => dismiss(toastId), TOAST_TTL_MS)
    })
    return () => {
      off()
    }
  }, [dismiss])

  const handleClick = useCallback(
    async (item: ToastItem) => {
      dismiss(item.toastId)
      try {
        await markNotificationRead(item.id)
      } catch (e) {
        console.warn('[toaster] mark read failed', e)
      }
      if (item.chat_room_id) {
        router.push('/chat/' + item.chat_room_id)
      }
    },
    [dismiss, router],
  )

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed top-16 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {items.map((t) => (
        <button
          key={t.toastId}
          type="button"
          onClick={() => handleClick(t)}
          className="pointer-events-auto text-left w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-lg ring-1 ring-gray-200 px-4 py-3 hover:bg-gray-50 transition active:scale-[0.98]"
        >
          <div className="flex items-start gap-3">
            <div
              className={
                'shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base ' +
                (t.type === 'chat_room_created'
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-blue-100 text-blue-600')
              }
            >
              {t.type === 'chat_room_created' ? '💬' : '✉️'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {t.counterpart_name}
                </p>
                <span className="text-[11px] text-gray-400">· 방금</span>
              </div>
              <p className="text-xs text-gray-500 truncate">{t.title}</p>
              {t.body && (
                <p className="mt-1 text-sm text-gray-700 line-clamp-2">{t.body}</p>
              )}
            </div>
            {/* [수정됨] button 태그를 div로 변경하여 중첩 구조 해결 */}
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                dismiss(t.toastId)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') dismiss(t.toastId) }}
              className="shrink-0 text-gray-300 hover:text-gray-500 text-lg leading-none cursor-pointer"
              aria-label="닫기"
            >
              ×
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}