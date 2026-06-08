/**
 * lib/chatPush.ts
 *
 * 비동기 푸시 알림 워커.
 *
 * ## 책임
 *  - Postgres LISTEN 'chat_push' 채널 구독
 *  - 수신한 notification_logs.id 를 FCM 으로 전송
 *  - 성공/실패 status 업데이트 + attempts 증가
 *  - 실패한 토큰은 is_active=false 로 비활성화
 *  - 디바운싱: 동일 (chat_room_id, user_id) + 10초 윈도우는 skip (노이즈 방지)
 *
 * ## 진입점
 *  - `startChatPushWorker()`     : standalone Node 프로세스에서 1회 호출
 *  - `dispatchLogById(logId)`    : 즉시 1건 처리 (테스트 / 재처리 / API 핸들러에서 사용)
 *
 * ## 환경변수
 *  - FCM_SERVER_KEY         : FCM legacy 또는 v1 access token
 *  - SUPABASE_DB_URL        : postgres:// 로 직접 LISTEN 가능 (service role 키 대신 사용)
 *
 * ## 멱등성
 *  - notification_logs.dedupe_key unique 제약으로 동일 알림 중복 발송 차단
 *  - status='sending' → 'sent' 전이에서만 실제 FCM 호출
 *  - 'sent' 상태로 두 번 이상 호출돼도 status 가 sent 면 즉시 반환
 */

import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import {
  buildChatNewMessageNotification,
  buildChatRoomCreatedNotification,
  toFcmPayload,
  type BuiltChatNotification,
} from '@/lib/chatNotifications'
import type { Database } from '@/lib/database.types'

type Log = Database['public']['Tables']['notification_logs']['Row']
type Token = Database['public']['Tables']['push_tokens']['Row']
type Room = Database['public']['Tables']['chat_rooms']['Row']
type Message = Database['public']['Tables']['messages']['Row']

// ──────────────────────────────────────────────────────────────────────
// 노이즈 방지 — 같은 방에서 10초 이내 도착한 동일 사용자 알림은 스킵
// ──────────────────────────────────────────────────────────────────────
const DEDUPE_WINDOW_MS = 10_000
const recentSent = new Map<string, number>() // key = `${userId}:${chatRoomId}` -> timestamp

function shouldSkipDedup(userId: string, roomId: string): boolean {
  const key = `${userId}:${roomId}`
  const now = Date.now()
  const last = recentSent.get(key)
  if (last && now - last < DEDUPE_WINDOW_MS) return true
  recentSent.set(key, now)
  // map cleanup
  if (recentSent.size > 5000) {
    for (const [k, t] of recentSent) {
      if (now - t > DEDUPE_WINDOW_MS * 10) recentSent.delete(k)
    }
  }
  return false
}

// ──────────────────────────────────────────────────────────────────────
// 단건 dispatch (수동 재처리 / 테스트 / API 핸들러에서 사용)
// ──────────────────────────────────────────────────────────────────────
export async function dispatchLogById(logId: string): Promise<{
  status: 'sent' | 'skipped' | 'failed' | 'no_tokens'
  log: Log | null
  tokens_targeted: number
}> {
  const supabase = requireSupabaseAdmin()
  const { data: log } = await supabase
    .from('notification_logs')
    .select('*')
    .eq('id', logId)
    .maybeSingle()

  if (!log) return { status: 'failed', log: null, tokens_targeted: 0 }
  return dispatchLog(log as Log)
}

export async function dispatchLog(log: Log): Promise<{
  status: 'sent' | 'skipped' | 'failed' | 'no_tokens'
  log: Log | null
  tokens_targeted: number
}> {
  const supabase = requireSupabaseAdmin()

  // 멱등성: 이미 sent 면 스킵
  if (log.status === 'sent') {
    return { status: 'skipped', log, tokens_targeted: 0 }
  }
  if (log.status === 'skipped') {
    return { status: 'skipped', log, tokens_targeted: 0 }
  }

  // 디바운싱
  const roomId = (log.payload as { chat_room_id?: string })?.chat_room_id
  if (roomId && shouldSkipDedup(log.user_id, roomId)) {
    await markLog(log.id, 'skipped', 'dedup window')
    return { status: 'skipped', log, tokens_targeted: 0 }
  }

  // 활성 토큰 조회
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('*')
    .eq('user_id', log.user_id)
    .eq('is_active', true)

  const activeTokens = (tokens as Token[] | null) ?? []
  if (activeTokens.length === 0) {
    await markLog(log.id, 'skipped', 'no active tokens')
    return { status: 'no_tokens', log, tokens_targeted: 0 }
  }

  // payload 재구성 (저장된 payload + viewer/카운터파트)
  const built = await reconstructBuilt(log as Log)
  if (!built) {
    await markLog(log.id, 'failed', 'payload reconstruction failed')
    return { status: 'failed', log, tokens_targeted: 0 }
  }

  // status = sending (동시 dispatch 방지)
  const { data: locked } = await supabase
    .from('notification_logs')
    .update({ status: 'sending', attempts: log.attempts + 1 })
    .eq('id', log.id)
    .neq('status', 'sent')
    .select('*')
    .maybeSingle()

  if (!locked) {
    return { status: 'skipped', log, tokens_targeted: 0 }
  }

  // FCM 전송
  const collapseKey = `chat:${built.payload.chat_room_id}`
  let allOk = true
  const errors: string[] = []

  for (const t of activeTokens) {
    const fcmPayload = toFcmPayload(t.token, built, collapseKey)
    try {
      await sendViaFcm(fcmPayload)
    } catch (e) {
      allOk = false
      errors.push(`${t.platform}:${(e as Error).message}`)
      // 만료/등록취소 토큰 비활성화
      if (isInvalidTokenError(e)) {
        await supabase.from('push_tokens').update({ is_active: false }).eq('id', t.id)
      }
    }
  }

  if (allOk) {
    await markLog(log.id, 'sent', null, new Date().toISOString())
    return { status: 'sent', log: locked as Log, tokens_targeted: activeTokens.length }
  } else {
    await markLog(log.id, 'failed', errors.slice(0, 3).join('; '))
    return { status: 'failed', log: locked as Log, tokens_targeted: activeTokens.length }
  }
}

async function markLog(
  id: string,
  status: Log['status'],
  lastError: string | null,
  sentAt?: string,
) {
  const supabase = requireSupabaseAdmin()
  await supabase
    .from('notification_logs')
    .update({ status, last_error: lastError, sent_at: sentAt ?? null })
    .eq('id', id)
}

async function reconstructBuilt(log: Log): Promise<BuiltChatNotification | null> {
  const supabase = requireSupabaseAdmin()
  const payload = (log.payload ?? {}) as {
    chat_room_id?: string
    counterpart_id?: string
    counterpart_name?: string
    message_id?: string
    sender_id?: string
  }
  if (!payload.chat_room_id || !payload.counterpart_id) return null

  const { data: viewer } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', log.user_id)
    .maybeSingle()
  if (!viewer) return null

  const counterpart: { id: string; name: string; role: 'employer' | 'seeker' } = {
    id: payload.counterpart_id,
    name: payload.counterpart_name ?? '사용자',
    // 빌더가 사용하는 counterpart.role 은 메시지 카드에 employer/seeker 라벨이
    // 들어가는 정도라 기본값은 employer 로 두고, 곧바로 정확한 값으로 덮어쓴다.
    role: 'employer',
  }

  // counterpart role 정확히 가져오기
  const { data: cpProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', payload.counterpart_id)
    .maybeSingle()
  if (cpProfile) counterpart.role = (cpProfile as { role: 'employer' | 'seeker' }).role

  // viewer role 보정
  const viewerObj = viewer as { id: string; name: string; role: 'employer' | 'seeker' }

  if (log.type === 'chat_room_created') {
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', payload.chat_room_id)
      .maybeSingle()
    if (!room) return null
    return buildChatRoomCreatedNotification(room as Room, counterpart, viewerObj)
  }

  if (log.type === 'chat_new_message' && payload.message_id) {
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', payload.chat_room_id)
      .maybeSingle()
    const { data: msg } = await supabase
      .from('messages')
      .select('*')
      .eq('id', payload.message_id)
      .maybeSingle()
    if (!room || !msg) return null
    return buildChatNewMessageNotification(msg as Message, room as Room, counterpart, viewerObj)
  }

  return null
}

// ──────────────────────────────────────────────────────────────────────
// FCM 전송 어댑터 (외부 SDK 의존 없이 fetch 만 사용)
// 실제 운영에서는 firebase-admin SDK 또는 @google-cloud/fcm 사용 권장
// ──────────────────────────────────────────────────────────────────────
async function sendViaFcm(p: ReturnType<typeof toFcmPayload>): Promise<void> {
  const serverKey = process.env.FCM_SERVER_KEY
  if (!serverKey) {
    // dev 환경에서는 가짜 성공 처리 (Vercel/Supabase 함수에서 throw 방지)
    console.warn('[chatPush] FCM_SERVER_KEY missing — skipping actual FCM call', {
      type: p.data.type,
      room: p.data.chat_room_id,
    })
    return
  }
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `key=${serverKey}`,
    },
    body: JSON.stringify(p),
  })
  if (!res.ok) {
    const txt = await res.text()
    const err = new Error(`FCM ${res.status}: ${txt.slice(0, 200)}`)
    ;(err as Error & { fcmStatus?: number }).fcmStatus = res.status
    throw err
  }
}

function isInvalidTokenError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const status = (e as Error & { fcmStatus?: number }).fcmStatus
  // FCM: 404 NotRegistered / 400 InvalidRegistration
  if (status === 404 || status === 400) return true
  return /NotRegistered|InvalidRegistration|UNREGISTERED/i.test(e.message)
}

// ──────────────────────────────────────────────────────────────────────
// LISTEN 워커 — process 직접 실행 (node lib/chatPush.js)
//   package.json scripts: "worker:chat": "tsx lib/chatPush.ts"
//
//   별도 Node 프로세스에서만 실행되므로 `pg` 는 runtime peer-dep.
//   프로젝트 루트에 `npm i -D pg @types/pg` 로 설치 후 사용.
// ──────────────────────────────────────────────────────────────────────
// `pg` 의 event emitter 는 제네릭 시그니처가 강해서 unknown 으로는 못 줄인다.
// 워커에서 필요한 이벤트 두 종류만 좁혀서 노출하는 래퍼.
type PgClientEvents = {
  notification: (msg: { channel: string; payload?: string }) => void
  error: (e: Error) => void
}
type PgClientLike = {
  connect: () => Promise<void>
  on<K extends keyof PgClientEvents>(event: K, listener: PgClientEvents[K]): void
  query: (sql: string) => Promise<unknown>
  end: () => Promise<void>
}
type PgClientCtor = new (cfg: { connectionString: string }) => PgClientLike

export async function startChatPushWorker(): Promise<void> {
  // dynamic import → Next.js 번들에서는 pg 가 빠지고, 별도 워커 프로세스에서만 로딩
  // @ts-expect-error pg 는 런타임 peer-dep (worker 프로세스에서 설치 필요)
  const pgModule: { Client: PgClientCtor } = await import('pg')
  const { Client } = pgModule

  const url = process.env.SUPABASE_DB_URL
  if (!url) {
    console.error('[chatPush] SUPABASE_DB_URL missing — worker abort')
    return
  }

  const client = new Client({ connectionString: url })
  client.connect().catch((e: Error) => {
    console.error('[chatPush] DB connect failed', e)
    setTimeout(() => {
      void startChatPushWorker()
    }, 5_000) // 지수 백오프
  })

  client.on('notification', (msg) => {
    if (msg.channel !== 'chat_push' || !msg.payload) return
    void (async () => {
      try {
        const { log_id } = JSON.parse(msg.payload!) as { log_id: string }
        if (!log_id) return
        await dispatchLogById(log_id)
      } catch (e) {
        console.error('[chatPush] dispatch error', e)
      }
    })()
  })

  client.on('error', (e) => {
    console.error('[chatPush] pg client error', e)
  })

  client.query('LISTEN chat_push').then(
    () => console.log('[chatPush] listening on chat_push'),
    (e: Error) => console.error('[chatPush] LISTEN failed', e),
  )

  const shutdown = async () => {
    console.log('[chatPush] shutting down...')
    try {
      await client.query('UNLISTEN chat_push')
      await client.end()
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

// 직접 실행 시 워커 시작
if (typeof require !== 'undefined' && require.main === module) {
  startChatPushWorker()
}
