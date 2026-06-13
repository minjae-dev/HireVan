'use client'

/**
 * components/NavbarNotificationBell.tsx
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import {
  useNotifications,
  useUnreadCount,
  markNotificationRead,
  markAllRead,
  type ChatNotification,
} from '@/lib/notifications'

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000) return '방금'
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + '분 전'
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + '시간 전'
  if (diff < 604_800_000) return Math.floor(diff / 86_400_000) + '일 전'
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

export default function NavbarNotificationBell() {
  const router = useRouter()
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const unread = useUnreadCount()
  const { notifications, refresh } = useNotifications()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleClickItem = async (n: ChatNotification) => {
    setOpen(false)
    try {
      await markNotificationRead(n.id)
    } catch (e) {
      console.warn('[bell] mark read failed', e)
    }
    if (n.chat_room_id) router.push('/chat/' + n.chat_room_id)
  }

  const handleMarkAll = async () => {
    try {
      await markAllRead()
    } catch (e) {
      console.warn('[bell] markAll failed', e)
    }
  }

  const recent = notifications.slice(0, 5)

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          void refresh()
        }}
        className="relative w-9 h-9 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100"
        aria-label={t('notifications.open_bell')}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ backgroundColor: 'var(--brand, #f97316)' }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.bell_label')}
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-xl ring-1 ring-gray-200 z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">{t('notifications.bell_label')}</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {t('notifications.mark_all_read')}
              </button>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              {t('notifications.no_notifications')}
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {recent.map((n) => {
                const isUnread = !n.read_at
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickItem(n)}
                      className={
                        'w-full text-left px-4 py-3 hover:bg-gray-50 transition ' +
                        (isUnread ? 'bg-orange-50/40' : '')
                      }
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={
                            'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ' +
                            (n.type === 'chat_room_created'
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-blue-100 text-blue-600')
                          }
                        >
                          {n.type === 'chat_room_created' ? '💬' : '✉️'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {n.counterpart_name}
                            </p>
                            <span className="text-[10px] text-gray-400 shrink-0">
                              {timeAgo(n.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{n.title}</p>
                          {n.body && (
                            <p className="mt-0.5 text-xs text-gray-600 line-clamp-1">
                              {n.body}
                            </p>
                          )}
                        </div>
                        {isUnread && (
                          <span
                            className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: 'var(--brand, #f97316)' }}
                          />
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-gray-500 hover:text-gray-700 px-4 py-3 border-t border-gray-100"
          >
            {t('nav.chat_list')} →
          </Link>
        </div>
      )}
    </div>
  )
}