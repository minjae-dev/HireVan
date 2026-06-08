'use client'

/**
 * lib/notifications.ts
 *
 * 클라이언트 측 알림 시스템 — 타입/이벤트/훅.
 *
 * Provider 는 components/NotificationProvider.tsx 에 별도로 분리.
 * (Next 16 SWC 가 'use client' + useAuth/useRouter + JSX 가 같은 파일에
 * 있을 때 client/server 경계를 잘못 인식하는 케이스가 있어 분리한다.)
 *
 * ## 책임
 *  1) 타입 / 이벤트 버스 / unread 카운트 캐시 / 훅
 *  2) Supabase 읽기/쓰기 (read / mark / list)
 *  3) 메시지/채팅방 API helper
 */

import { supabase } from '@/lib/supabase'
import { useCallback, useEffect, useState } from 'react'

// ──────────────────────────────────────────────────────────────────────
// 타입 — 백엔드 notification_logs.payload 와 1:1
// ──────────────────────────────────────────────────────────────────────
export type ChatNotificationType = 'chat_room_created' | 'chat_new_message'

export interface ChatNotification {
  id: string
  type: ChatNotificationType
  title: string
  body: string | null
  chat_room_id: string
  counterpart_id: string
  counterpart_name: string
  message_id: string | null
  sender_id: string | null
  unread_count: number
  read_at: string | null
  created_at: string
}

interface RawLog {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

export function toChatNotification(row: RawLog): ChatNotification {
  const p = (row.payload ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    type: (row.type as ChatNotificationType) ?? 'chat_new_message',
    title: row.title,
    body: row.body ?? null,
    chat_room_id: String(p.chat_room_id ?? ''),
    counterpart_id: String(p.counterpart_id ?? ''),
    counterpart_name: String(p.counterpart_name ?? '사용자'),
    message_id: (p.message_id as string | undefined) ?? null,
    sender_id: (p.sender_id as string | undefined) ?? null,
    unread_count: Number(p.unread_count ?? 1),
    read_at: row.read_at,
    created_at: row.created_at,
  }
}

// ──────────────────────────────────────────────────────────────────────
// 이벤트 버스 — 컴포넌트 외부에서도 구독 가능
// ──────────────────────────────────────────────────────────────────────
type Listener<T> = (v: T) => void
function createEmitter<T>() {
  const set = new Set<Listener<T>>()
  return {
    subscribe(fn: Listener<T>): () => void {
      set.add(fn)
      return () => set.delete(fn)
    },
    emit(v: T) {
      set.forEach((fn) => {
        try {
          fn(v)
        } catch (e) {
          console.error('[notifications] listener error', e)
        }
      })
    },
    size: () => set.size,
  }
}

const newNotifEmitter = createEmitter<ChatNotification>()
const unreadEmitter = createEmitter<number>()
/** list 갱신 이벤트 — 한 항목 또는 전체 read 상태가 바뀌었음을 알림 */
const listChangedEmitter = createEmitter<void>()

export function onNewNotification(fn: Listener<ChatNotification>): () => void {
  return newNotifEmitter.subscribe(fn)
}
export function onUnreadCount(fn: Listener<number>): () => void {
  return unreadEmitter.subscribe(fn)
}
export function onListChanged(fn: Listener<void>): () => void {
  return listChangedEmitter.subscribe(fn)
}

/** 외부 모듈에서 새 알림을 발행 (NotificationProvider 가 호출) */
export function emitNewNotification(n: ChatNotification) {
  // 캐시에도 즉시 push
  initialCache = [n, ...initialCache].slice(0, 100)
  newNotifEmitter.emit(n)
  listChangedEmitter.emit()
}
function emitUnread(n: number) {
  unreadCountCache = n
  unreadEmitter.emit(n)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('hv:unread', { detail: n }))
  }
}

// ──────────────────────────────────────────────────────────────────────
// unread 카운트 캐시
// ──────────────────────────────────────────────────────────────────────
let unreadCountCache = 0
export function getUnreadCount(): number {
  return unreadCountCache
}

export async function refreshUnread(): Promise<number> {
  const { count } = await supabase
    .from('notification_logs')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  const n = count ?? 0
  emitUnread(n)
  return n
}

// ──────────────────────────────────────────────────────────────────────
// 초기 알림 fetch
// ──────────────────────────────────────────────────────────────────────
let initialCache: ChatNotification[] = []
export function getInitialCache(): ChatNotification[] {
  return initialCache
}

export async function fetchInitialNotifications(): Promise<ChatNotification[]> {
  const { data, error } = await supabase
    .from('notification_logs')
    .select('id, user_id, type, title, body, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.warn('[notifications] fetchInitialNotifications', error.message)
    return []
  }
  const rows = (data ?? []) as unknown as RawLog[]
  initialCache = rows.map(toChatNotification)
  const unread = initialCache.filter((n) => !n.read_at).length
  emitUnread(unread)
  listChangedEmitter.emit()
  return initialCache
}

// ──────────────────────────────────────────────────────────────────────
// 읽음 처리 — local cache 도 즉시 갱신
// ──────────────────────────────────────────────────────────────────────

/**
 * 단일 알림 읽음 처리.
 * - update 후 변경된 row 의 read_at 로 local cache 갱신
 * - 실패 시 throw (UI 에서 catch)
 */
export async function markNotificationRead(id: string): Promise<void> {
  const now = new Date().toISOString()
   
  const { data, error } = await supabase
    .from('notification_logs')
    .update({ read_at: now } as any)
    .eq('id', id)
    .is('read_at', null)
    .select('id, read_at')
    .maybeSingle()

  if (error) {
    console.warn('[notifications] markNotificationRead error', error.message)
    throw error
  }
  if (data) {
    // local cache 갱신
    initialCache = initialCache.map((n) => (n.id === id ? { ...n, read_at: now } : n))
    listChangedEmitter.emit()
  }
  await refreshUnread()
}

/**
 * 모든 unread 알림을 한 번에 읽음 처리.
 * - update 는 RLS 가 anon key 의 self-update 를 허용해야 동작한다
 *   (migration 20260608000004_notification_logs_self_update.sql 참고)
 * - local cache 도 즉시 전체 read_at 갱신
 */
export async function markAllRead(): Promise<void> {
  const now = new Date().toISOString()
  // 1) self RLS 가 있는 경우 anon key 로 자기 row 만 일괄 업데이트
   
  const { data, error } = await supabase
    .from('notification_logs')
    .update({ read_at: now } as any)
    .is('read_at', null)
    .select('id')

  if (error) {
    console.warn('[notifications] markAllRead error', error.message)
    throw error
  }

  const updatedCount = (data as { id: string }[] | null)?.length ?? 0

  // 2) local cache 갱신 — 모든 unread 항목을 now 로 마킹
  initialCache = initialCache.map((n) => (n.read_at ? n : { ...n, read_at: now }))
  listChangedEmitter.emit()
  // 3) unread 카운트 0 으로 즉시 emit + 서버에서 재확인
  emitUnread(0)
  void refreshUnread()

  return
}

// ──────────────────────────────────────────────────────────────────────
// hooks
// ──────────────────────────────────────────────────────────────────────
export function useUnreadCount(): number {
  const [n, setN] = useState<number>(getUnreadCount())
  useEffect(() => {
    const off = onUnreadCount(setN)
    return () => {
      off()
    }
  }, [])
  return n
}

export interface UseNotificationsReturn {
  notifications: ChatNotification[]
  unreadCount: number
  markRead: (id: string) => Promise<void>
  markAll: () => Promise<void>
  refresh: () => Promise<void>
}

export function useNotifications(): UseNotificationsReturn {
  const [list, setList] = useState<ChatNotification[]>(getInitialCache())
  const unreadCount = useUnreadCount()

  // 새 알림 도착
  useEffect(() => {
    const off = onNewNotification((n) => {
      setList((prev) => {
        if (prev.some((p) => p.id === n.id)) return prev
        return [n, ...prev].slice(0, 100)
      })
    })
    return () => {
      off()
    }
  }, [])

  // list 가 무효화된 경우 (markAllRead, fetchInitialNotifications 등) 재동기화
  useEffect(() => {
    const off = onListChanged(() => {
      setList([...getInitialCache()])
    })
    return () => {
      off()
    }
  }, [])

  const refresh = useCallback(async () => {
    await fetchInitialNotifications()
    setList([...getInitialCache()])
  }, [])

  return {
    notifications: list,
    unreadCount,
    markRead: markNotificationRead,
    markAll: markAllRead,
    refresh,
  }
}

// ──────────────────────────────────────────────────────────────────────
// 메시지/채팅방 전송 API helper
// ──────────────────────────────────────────────────────────────────────
export async function sendChatMessage(input: {
  roomId: string
  content: string
}): Promise<{ id: string; created_at: string }> {
  const { data: sessionRes } = await supabase.auth.getSession()
  const accessToken = sessionRes.session?.access_token
  if (!accessToken) throw new Error('로그인이 필요합니다.')

  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: 'Bearer ' + accessToken,
    },
    body: JSON.stringify({
      chat_room_id: input.roomId,
      content: input.content,
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? '메시지 전송 실패 (' + res.status + ')')
  }
  const json = (await res.json()) as { message: { id: string; created_at: string } }
  return { id: json.message.id, created_at: json.message.created_at }
}

export async function ensureChatRoom(input: {
  jobPostId: string
  seekerId: string
}): Promise<{ id: string; created: boolean }> {
  const { data: sessionRes } = await supabase.auth.getSession()
  const accessToken = sessionRes.session?.access_token
  if (!accessToken) throw new Error('로그인이 필요합니다.')

  const res = await fetch('/api/chat/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: 'Bearer ' + accessToken,
    },
    body: JSON.stringify({
      job_post_id: input.jobPostId,
      seeker_id: input.seekerId,
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? '채팅방 생성 실패 (' + res.status + ')')
  }
  const data = (await res.json()) as { room: { id: string }; created: boolean }
  return { id: data.room.id, created: data.created }
}
