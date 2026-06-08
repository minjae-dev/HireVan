'use client'

/**
 * components/NotificationProvider.tsx
 *
 * lib/notifications.ts 가 useAuth() + useRouter() + JSX 를 같은 파일에
 * 두고 있어서 Next 16 SWC 가 client/server 경계를 잘못 인식하는 케이스가 있다.
 * 이를 막기 위해 Provider 만 별도 파일로 분리한다.
 *
 * 책임:
 *  1) Supabase Realtime 으로 notification_logs INSERT 구독
 *  2) Service Worker 메시지(NAVIGATE) 수신 → router.push
 *  3) Service Worker 등록 (prod only)
 *  4) FCM web push 토큰 등록
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  emitNewNotification,
  getUnreadCount,
  refreshUnread,
  fetchInitialNotifications,
  type ChatNotification,
} from '@/lib/notifications'

async function tryRegisterFcmToken(accessToken: string) {
  try {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || Notification.permission === 'denied') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const messaging = w.hvMessaging
    if (!messaging) return
    const token: string | null = await messaging.getToken?.()
    if (!token) return
    await fetch('/api/push/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer ' + accessToken,
      },
      body: JSON.stringify({
        token,
        platform: 'web',
        device_label: navigator.userAgent,
      }),
    })
  } catch (e) {
    console.warn('[notif-provider] FCM register failed', e)
  }
}

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const seenIds = useRef<Set<string>>(new Set())

  // 1) Service Worker 메시지
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; deepLink?: string } | undefined
      if (data?.type === 'NAVIGATE' && data.deepLink) {
        router.push(data.deepLink)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  // 2) Realtime 구독
  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      const { data: sessionRes } = await supabase.auth.getUser()
      if (cancelled) return
      const userId = sessionRes.user?.id
      if (!userId) return

      await refreshUnread()
      await fetchInitialNotifications()

      channel = supabase
        .channel('notif:' + userId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notification_logs',
            filter: 'user_id=eq.' + userId,
          },
          (payload) => {
            const row = (payload.new ?? {}) as {
              id?: string
              type?: string
              title?: string
              body?: string | null
              payload?: Record<string, unknown> | null
              read_at?: string | null
              created_at?: string
            }
            if (!row.id) return
            if (seenIds.current.has(row.id)) return
            seenIds.current.add(row.id)

            const p = row.payload ?? {}
            const notif: ChatNotification = {
              id: row.id,
              type: (row.type as ChatNotification['type']) ?? 'chat_new_message',
              title: row.title ?? '알림',
              body: row.body ?? null,
              chat_room_id: String(p.chat_room_id ?? ''),
              counterpart_id: String(p.counterpart_id ?? ''),
              counterpart_name: String(p.counterpart_name ?? '사용자'),
              message_id: (p.message_id as string | undefined) ?? null,
              sender_id: (p.sender_id as string | undefined) ?? null,
              unread_count: Number(p.unread_count ?? 1),
              read_at: row.read_at ?? null,
              created_at: row.created_at ?? new Date().toISOString(),
            }

            emitNewNotification(notif)
            // unread +1
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ev = new CustomEvent('hv:unread', { detail: getUnreadCount() + 1 })
            window.dispatchEvent(ev)
          },
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [])

  // 3) FCM 토큰 등록
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: sessionRes } = await supabase.auth.getSession()
      if (cancelled) return
      const token = sessionRes.session?.access_token
      if (!token) return
      await tryRegisterFcmToken(token)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 4) Service Worker 등록 (prod only)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[notif-provider] SW register failed', e)
    })
  }, [])

  return <>{children}</>
}
