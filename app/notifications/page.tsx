'use client'

/**
 * app/notifications/page.tsx
 *
 * 알림 센터 (전체 알림 리스트).
 *
 * - useNotifications() 로 전체 알림 + unread 카운트
 * - 각 항목을 클릭하면 chat_room_id 로 이동 + mark as read
 * - 모두 읽음 버튼
 * - 빈 상태 UI
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import {
  useNotifications,
  markAllRead,
  markNotificationRead,
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

export default function NotificationsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { notifications, refresh, unreadCount } = useNotifications()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleClick = async (n: ChatNotification) => {
    try {
      await markNotificationRead(n.id)
    } catch (e) {
      console.warn('[notifications] mark read failed', e)
    }
    if (n.chat_room_id) router.push('/chat/' + n.chat_room_id)
  }

  const handleMarkAll = async () => {
    try {
      await markAllRead()
    } catch (e) {
      console.warn('[notifications] mark all failed', e)
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">불러오는 중...</div>
    )
  }
  if (!user) return null

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">알림</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {unreadCount > 0
              ? '읽지 않은 알림 ' + unreadCount + '개'
              : '모든 알림을 확인했어요'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAll}
            className="text-sm text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline"
          >
            모두 읽음
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="py-24 text-center text-sm text-gray-400 bg-white rounded-2xl ring-1 ring-gray-100">
          도착한 알림이 없어요
        </div>
      ) : (
        <ul className="bg-white rounded-2xl ring-1 ring-gray-100 divide-y divide-gray-100">
          {notifications.map((n) => {
            const isUnread = !n.read_at
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleClick(n)}
                  className={
                    'w-full text-left px-4 py-3.5 hover:bg-gray-50 transition ' +
                    (isUnread ? 'bg-orange-50/40' : '')
                  }
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={
                        'shrink-0 w-10 h-10 rounded-full flex items-center justify-center ' +
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
                        <span className="text-[11px] text-gray-400 shrink-0">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{n.title}</p>
                      {n.body && (
                        <p className="mt-1 text-sm text-gray-700 line-clamp-2">{n.body}</p>
                      )}
                    </div>
                    {isUnread && (
                      <span
                        className="shrink-0 mt-2 w-2 h-2 rounded-full"
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

      <div className="text-center text-xs text-gray-400 pt-2">
        <Link href="/chat" className="hover:text-gray-600">
          채팅 목록으로 →
        </Link>
      </div>
    </div>
  )
}
