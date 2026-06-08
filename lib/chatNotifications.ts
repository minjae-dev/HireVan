import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import type { Database, Json } from '@/lib/database.types'

/**
 * lib/chatNotifications.ts
 *
 * 채팅 푸시 알림 메시지 빌더 + 수신 설정 조회.
 *
 * 푸시 "전송" 자체는 비동기 워커(pg_notify 'chat_push' LISTEN)가 담당하고,
 * 이 라이브러리는 다음 책임만 가진다:
 *   1) 수신자 동의 여부 조회 (notification_prefs + seeker_preferences 마스터 스위치)
 *   2) 사용자 타입(role)에 맞는 한국어 메시지 빌드
 *   3) 페이로드(deep_link, counterpart 정보) 직렬화
 *
 * 실제 발송 로직(pg_notify 트리거)은 DB 트리거에서 이미 동작한다.
 * 즉, `sendChatMessage`/`createChatRoom`을 호출하면 DB row 가 INSERT 되고,
 * 트리거가 알아서 notification_logs + pg_notify 를 발행한다.
 * 그래서 이 파일의 "전송" 함수는 **이미 발송된 큐의 메타 정보 보강/재처리** 용도.
 */

type Profile = Database['public']['Tables']['profiles']['Row']
type ChatRoom = Database['public']['Tables']['chat_rooms']['Row']
type ChatMessage = Database['public']['Tables']['messages']['Row']
type Prefs = Database['public']['Tables']['notification_prefs']['Row']

// ──────────────────────────────────────────────────────────────────────
// 사용자별 수신 설정 통합 조회
//   - notification_prefs.chat_* + push_enabled
//   - seeker_preferences.notifications_enabled (구직자 마스터 스위치)
//   - quiet_hours (시간대 무음)
//   - user 의 role 까지 한 번에 join
// ──────────────────────────────────────────────────────────────────────
export interface EffectiveChatPref {
  user_id: string
  role: 'seeker' | 'employer'
  chat_room_created: boolean
  chat_new_message: boolean
  push_enabled: boolean
  /** 현재 시점이 quiet_hours 안에 있으면 true (push 발송 스킵 권장) */
  in_quiet_hours: boolean
}

export async function getEffectiveChatPref(
  userId: string,
): Promise<EffectiveChatPref | null> {
  const supabase = requireSupabaseAdmin()

  const [{ data: profile }, { data: pref }] = await Promise.all([
    supabase.from('profiles').select('id, role').eq('id', userId).maybeSingle(),
    supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (!profile) return null

  const role = (profile as Pick<Profile, 'role'>).role
  const p = (pref as Prefs | null) ?? null

  // 구직자는 seeker_preferences.notifications_enabled 도 마스터 스위치로 본다
  let masterEnabled = true
  if (role === 'seeker') {
    const { data: seekerPref } = await supabase
      .from('seeker_preferences')
      .select('notifications_enabled')
      .eq('seeker_id', userId)
      .maybeSingle()
    if (seekerPref && (seekerPref as { notifications_enabled: boolean }).notifications_enabled === false) {
      masterEnabled = false
    }
  }

  const inQuiet = isInQuietHours(p?.quiet_hours_start ?? null, p?.quiet_hours_end ?? null)

  return {
    user_id: userId,
    role,
    chat_room_created: (p?.chat_room_created ?? true) && masterEnabled,
    chat_new_message: (p?.chat_new_message ?? true) && masterEnabled,
    push_enabled: (p?.push_enabled ?? true) && masterEnabled,
    in_quiet_hours: inQuiet,
  }
}

function isInQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const s = toMin(start)
  const e = toMin(end)
  if (s === e) return false
  if (s < e) return cur >= s && cur < e
  // 자정을 가로지르는 구간 (예: 22:00 ~ 08:00)
  return cur >= s || cur < e
}

// ──────────────────────────────────────────────────────────────────────
// 메시지 빌더
//   - 사용자 타입에 맞춰 자연스러운 한국어 카피
//   - 푸시 페이로드: deep_link + 채팅방/상대방 정보
// ──────────────────────────────────────────────────────────────────────
export interface BuiltChatNotification {
  type: 'chat_room_created' | 'chat_new_message'
  title: string
  body: string
  payload: {
    chat_room_id: string
    counterpart_id: string
    counterpart_name: string
    deep_link: string
    message_id?: string
    sender_id?: string
  } & Record<string, Json>
}

/** 채팅방이 막 만들어졌을 때 — 양측 모두에게 보냄 */
export function buildChatRoomCreatedNotification(
  room: ChatRoom,
  counterpart: Pick<Profile, 'id' | 'name' | 'role'>,
  viewer: Pick<Profile, 'id' | 'role'>,
): BuiltChatNotification {
  const isViewerEmployer = viewer.role === 'employer'
  // 채용자에게는 "OOO님과의 채팅방이 개설되었습니다"
  // 구직자에게는 "OOO님과의 채팅방이 개설되었습니다"
  // (둘 다 counterpart 이름이 더 자연스러움)
  const title = `${counterpart.name}님과의 채팅방이 개설되었습니다`
  const body =
    viewer.role === 'employer'
      ? `${counterpart.name}님과의 대화가 시작되었습니다.`
      : `${counterpart.name}님과의 대화가 시작되었습니다.`

  return {
    type: 'chat_room_created',
    title,
    body,
    payload: {
      chat_room_id: room.id,
      counterpart_id: counterpart.id,
      counterpart_name: counterpart.name,
      // 클라이언트(Service Worker, FCM data)가 그대로 라우팅할 수 있는 절대 경로
      deep_link: `/chat/${room.id}`,
      // viewport 외에 web push data payload 에도 그대로 들어가므로
      // boolean / string 만 직렬화 (Json 제약)
      unread_count: 1,
    },
  }
}

/** 상대가 보낸 메시지 — 받는 사람(viewer) 한 명에게만 */
export function buildChatNewMessageNotification(
  msg: ChatMessage,
  room: ChatRoom,
  counterpart: Pick<Profile, 'id' | 'name' | 'role'>,
  viewer: Pick<Profile, 'id' | 'role'>,
): BuiltChatNotification {
  return {
    type: 'chat_new_message',
    title: '새로운 메시지가 도착했습니다',
    body: msg.content.slice(0, 120),
    payload: {
      chat_room_id: room.id,
      counterpart_id: counterpart.id,
      counterpart_name: counterpart.name,
      message_id: msg.id,
      sender_id: counterpart.id,
      deep_link: `/chat/${room.id}`,
      unread_count: 1,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────
// (옵션) 워커가 LISTEN 으로 받은 알림을 즉시 FCM 으로 보낼 때
//        사용하는 페이로드 정규화 헬퍼. 외부 푸시 게이트웨이가
//        FCM/APNs 둘 다 지원하도록 추상화.
// ──────────────────────────────────────────────────────────────────────
export interface FcmPayload {
  /** fcm token */
  token: string
  notification: {
    title: string
    body: string
  }
  data: Record<string, string>
  android?: { priority: 'high' | 'normal'; collapse_key?: string }
  apns?: { payload: { aps: { sound: string; 'content-available'?: number } } }
  webpush?: { headers: { Urgency: 'high' | 'normal' } }
}

export function toFcmPayload(
  token: string,
  built: BuiltChatNotification,
  collapseKey: string,
): FcmPayload {
  return {
    token,
    notification: { title: built.title, body: built.body },
    data: {
      // FCM data 는 string 만 허용 → JSON 직렬화
      type: built.type,
      chat_room_id: built.payload.chat_room_id,
      counterpart_id: built.payload.counterpart_id,
      counterpart_name: built.payload.counterpart_name,
      deep_link: built.payload.deep_link,
      message_id: built.payload.message_id ?? '',
      sender_id: built.payload.sender_id ?? '',
    },
    android: { priority: 'high', collapse_key: collapseKey },
    apns: { payload: { aps: { sound: 'default', 'content-available': 1 } } },
    webpush: { headers: { Urgency: 'high' } },
  }
}
