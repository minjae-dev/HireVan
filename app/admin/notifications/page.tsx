'use client'

import { useEffect, useMemo, useState } from 'react'
import { redirect } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type NotificationMetadata = {
  company_name?: string
  applicant_name?: string
  contact_phone?: string
}

type AdminNotification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  metadata: NotificationMetadata | null
  read_at: string | null
  created_at: string
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diff / 60000))

  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`

  const days = Math.floor(hours / 24)
  return `${days}일 전`
}

export default function AdminNotificationsPage() {
  const { profile, loading: authLoading } = useAuth()
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [showUnreadOnly, setShowUnreadOnly] = useState(true)

  useEffect(() => {
    if (!profile?.is_admin) return

    const fetchNotifications = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, body, link, metadata, read_at, created_at')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setNotifications(data as unknown as AdminNotification[])
      }
      setLoading(false)
    }

    fetchNotifications()
  }, [profile])

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications],
  )

  const visibleNotifications = useMemo(() => {
    if (!showUnreadOnly) return notifications
    return notifications.filter((notification) => !notification.read_at)
  }, [notifications, showUnreadOnly])

  const markAsRead = async (notification: AdminNotification) => {
    if (notification.read_at) return

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('id', notification.id)

    if (!error) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: now } : item,
        ),
      )
    }
  }

  if (!authLoading && !profile?.is_admin) {
    redirect('/')
  }

  if (authLoading || loading) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        <p className="text-sm text-gray-500">알림을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">관리자 알림</h1>
          <p className="mt-1 inline-flex rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-600">
            미확인 {unreadCount}건
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setShowUnreadOnly(true)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              showUnreadOnly ? 'bg-orange-50 text-orange-600' : 'text-gray-500'
            }`}
          >
            미읽음만 보기
          </button>
          <button
            type="button"
            onClick={() => setShowUnreadOnly(false)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              !showUnreadOnly ? 'bg-orange-50 text-orange-600' : 'text-gray-500'
            }`}
          >
            전체 보기
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {visibleNotifications.map((notification) => {
          const metadata = notification.metadata ?? {}
          const isUnread = !notification.read_at

          return (
            <div
              key={notification.id}
              role="button"
              tabIndex={0}
              onClick={() => markAsRead(notification)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  markAsRead(notification)
                }
              }}
              className="w-full rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isUnread && <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />}
                    <h2 className="truncate text-base font-bold text-gray-900">
                      {notification.title}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {relativeTime(notification.created_at)}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    isUnread ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {isUnread ? '미읽음' : '읽음'}
                </span>
              </div>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-gray-400">업체명</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-800">
                    {metadata.company_name || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-gray-400">지원자명</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-800">
                    {metadata.applicant_name || '-'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-gray-400">사장님 연락처</dt>
                  <dd className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className="break-all text-2xl font-bold text-gray-950">
                      {metadata.contact_phone || '-'}
                    </span>
                    {metadata.contact_phone && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          navigator.clipboard.writeText(metadata.contact_phone ?? '')
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            event.stopPropagation()
                            navigator.clipboard.writeText(metadata.contact_phone ?? '')
                          }
                        }}
                        className="w-fit rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-white"
                      >
                        복사
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {isUnread && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    markAsRead(notification)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      markAsRead(notification)
                    }
                  }}
                  className="mt-4 inline-flex rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
                >
                  확인 완료
                </span>
              )}
            </div>
          )
        })}

        {visibleNotifications.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white py-16 text-center text-sm text-gray-400">
            표시할 알림이 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
