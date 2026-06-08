# 채팅 푸시 알림 시스템 설계 문서

> HireVan 백엔드 & 알림 시스템
> 작성일: 2026-06-08
> 대상 기능: 구직자/채용자 간 채팅 푸시 알림

---

## 1. 목표 & 요구사항 매핑

| # | 요구사항 | 구현 |
|---|----------|------|
| R1 | 채팅방 생성 알림 (양측 사용자) | `chat_rooms` INSERT → `notify_chat_room_created` 트리거 |
| R2 | 새 메시지 알림 (상대방 1명) | `messages` INSERT → `notify_chat_new_message` 트리거 |
| R3 | 사용자별 수신 설정 반영 | `notification_prefs` + `seeker_preferences.notifications_enabled` |
| R4 | 채팅방 ID/상대방 정보 페이로드 | `notification_logs.payload` JSONB |
| R5 | 알림 클릭 시 채팅방 딥링크 | `deep_link = /chat/<roomId>` (Service Worker + 클라이언트 라우터) |
| R6 | 비동기 처리 (봇 감지/과부하 방지) | DB 트리거 → `pg_notify 'chat_push'` → LISTEN 워커 → FCM |
| R7 | 멱등성 (중복 발송 차단) | `notification_logs.dedupe_key` UNIQUE + `status` 전이 가드 |

---

## 2. 데이터 흐름 (High-Level)

```
[클라이언트]                [Next.js Route]            [PostgreSQL]              [Worker Process]              [FCM/APNs]
  │                              │                          │                          │                            │
  │ POST /api/chat/messages      │                          │                          │                            │
  ├─────────────────────────────►│                          │                          │                            │
  │                              │ INSERT messages          │                          │                            │
  │                              ├─────────────────────────►│                          │                            │
  │                              │                          │ AFTER INSERT TRIGGER     │                            │
  │                              │                          │  - 상대방 결정            │                            │
  │                              │                          │  - notification_prefs 조회│                            │
  │                              │                          │  - notification_logs INSERT                            │
  │                              │                          │  - pg_notify('chat_push') │                            │
  │                              │                          ├─────────────────────────►│ LISTEN 'chat_push'          │
  │                              │ 200 { message }          │                          │ dispatchLogById(id)         │
  │◄─────────────────────────────┤                          │                          │  - push_tokens 조회         │
  │                              │                          │                          │  - FCM POST                 │
  │                              │                          │                          ├───────────────────────────►│
  │                              │                          │                          │  200 OK                     │
  │                              │                          │◄─────────────────────────┤  status='sent' UPDATE       │
```

핵심: HTTP 응답은 DB INSERT 가 끝나면 즉시 반환되고, 푸시 발송은 별도 Node 워커가 비동기로 처리한다.

---

## 3. API 설계

### 3.1 POST /api/chat/rooms — 채팅방 생성/조회

- Request: `{ job_post_id, seeker_id }`
- 200: 기존 방 반환 (`created: false`)
- 201: 신규 생성 (`created: true`)
- 권한: caller 가 employer 면 employer_id=caller, seeker 면 seeker_id=caller + job_posts 에서 employer_id 조회
- 부작용: chat_rooms INSERT 시 트리거 발화 → notification_logs 2행 + pg_notify 2회

### 3.2 POST /api/chat/messages — 메시지 전송

- Request: `{ chat_room_id, content }`
- content trim, 빈 문자열/4000자 초과 거부
- caller 가 chat_rooms 의 employer_id 또는 seeker_id 인지 확인
- 부작용: messages INSERT 시 트리거 발화 → notification_logs 1행 + pg_notify 1회

### 3.3 POST /api/push/register — 푸시 토큰 등록

- Request: `{ token, platform: 'web'|'ios'|'android', device_label? }`
- push_tokens upsert (token 기준 onConflict), notification_prefs 기본 row 보장

### 3.4 DELETE /api/push/register — 로그아웃 시 토큰 비활성화

- Request: `{ token }`
- 해당 토큰 is_active=false 로 갱신

### 3.5 GET /api/push/preferences

- Response: `{ raw: PrefsRow | null, defaults: { ... } }`

### 3.6 PATCH /api/push/preferences

- Request: `{ chat_room_created?, chat_new_message?, push_enabled?, email_enabled?, quiet_hours_start?, quiet_hours_end? }`
- 화이트리스트 필드만 upsert (user_id 기준 onConflict)

---

## 4. DB 테이블 구조

### 4.1 push_tokens — 디바이스별 FCM/APNs 토큰

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK profiles(id) CASCADE | |
| token | text | NOT NULL, UNIQUE | FCM registration_id |
| platform | text | NOT NULL, CHECK in ('web','ios','android') | |
| device_label | text | NULL | 사용자 식별 |
| is_active | boolean | NOT NULL, default true | 로그아웃/만료 시 false |
| last_seen_at | timestamptz | NOT NULL, default now() | 하트비트 |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

인덱스: (user_id) WHERE is_active, (token) WHERE is_active

### 4.2 notification_logs — 알림 발송 감사 로그

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK profiles(id) CASCADE | 수신자 |
| type | text | NOT NULL | 'chat_room_created' / 'chat_new_message' |
| title | text | NOT NULL | 푸시 title |
| body | text | NULL | 푸시 body (120자 slice) |
| payload | jsonb | NOT NULL, default '{}' | { chat_room_id, counterpart_id, counterpart_name, deep_link, message_id?, sender_id? } |
| status | text | NOT NULL, default 'queued', CHECK in (queued,sending,sent,failed,skipped) | |
| attempts | int | NOT NULL, default 0 | |
| last_error | text | NULL | FCM 에러 |
| dedupe_key | text | UNIQUE | 'chat_msg:<id>:<receiver>' 또는 'chat_room:<id>:<receiver>' |
| sent_at | timestamptz | NULL | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

인덱스: (user_id, created_at desc), (status, created_at), (type)

### 4.3 notification_prefs — 사용자별 세분화 설정

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| user_id | uuid | PK, FK profiles(id) CASCADE | |
| chat_room_created | boolean | NOT NULL, default true | 채팅방 생성 알림 |
| chat_new_message | boolean | NOT NULL, default true | 새 메시지 알림 |
| push_enabled | boolean | NOT NULL, default true | 디바이스 마스터 토글 |
| email_enabled | boolean | NOT NULL, default true | 이메일 백업 |
| quiet_hours_start | time | NULL | 무음 시작 (예: 22:00) |
| quiet_hours_end | time | NULL | 무음 끝 (예: 08:00, 자정 통과 가능) |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### 4.4 RLS 정책

```sql
CREATE POLICY push_tokens_self_rw ON public.push_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY notification_logs_self_read ON public.notification_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notification_prefs_self_rw ON public.notification_prefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

service role (requireSupabaseAdmin)은 RLS 우회 → 워커/관리 작업에 사용.

---

## 5. 트리거 함수 수도코드

### 5.1 notify_chat_new_message() — AFTER INSERT ON messages

```text
FUNCTION notify_chat_new_message() -> trigger:
    new_msg = NEW

    room = SELECT * FROM chat_rooms WHERE id = new_msg.chat_room_id
    IF NOT FOUND THEN RETURN new_msg END

    receiver_id = (room.employer_id == new_msg.sender_id)
                    ? room.seeker_id
                    : room.employer_id
    IF receiver_id IS NULL OR receiver_id == new_msg.sender_id THEN
        RETURN new_msg                       // 자기 자신 메시지
    END

    sender_name = SELECT name FROM profiles WHERE id = new_msg.sender_id

    // 수신 설정 조회 (없으면 기본 활성)
    pref = SELECT * FROM notification_prefs WHERE user_id = receiver_id
    IF NOT FOUND THEN
        pref.chat_new_message = true
        pref.push_enabled     = true
    END

    IF NOT pref.chat_new_message OR NOT pref.push_enabled THEN
        INSERT INTO notification_logs(status='skipped', ...)
        RETURN new_msg
    END

    dedupe_key = 'chat_msg:' || new_msg.id || ':' || receiver_id

    log_id = INSERT INTO notification_logs(
        status='queued', dedupe_key,
        payload={ chat_room_id, message_id, sender_id, sender_name, deep_link }
    ) ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id

    IF log_id IS NOT NULL THEN
        PERFORM pg_notify('chat_push',
            json_build_object('log_id', log_id, 'user_id', receiver_id, 'type', 'chat_new_message', 'chat_room_id', new_msg.chat_room_id)::text
        )
    END

    RETURN new_msg
```

### 5.2 notify_chat_room_created() — AFTER INSERT ON chat_rooms

employer/seeker 두 명에 대해 각각 log INSERT + notify 발행. 제목은 역할에 맞춰 분기:

| 수신자 | title |
|--------|-------|
| employer | `${seeker_name}님과의 채팅방이 개설되었습니다` |
| seeker | `${employer_name}님과의 채팅방이 개설되었습니다` |
| 그 외 role | `구직자님과 채용자님 모두를 위한 새로운 채팅방이 만들어졌습니다` |

body: `${counterpart_name}님과의 대화가 시작되었습니다.`

---

## 6. 푸시 알림 전송 — 비동기 워커

### 6.1 아키텍처

- 독립 Node 프로세스 (tsx lib/chatPush.ts 또는 컴파일된 .js)
- Postgres LISTEN chat_push 채널 구독
- 알림 발생 시 비동기로 FCM 호출
- Vercel/Edge Function 안에서 돌리지 않음 (cold start 회피)

### 6.2 디바운싱

같은 (user_id, chat_room_id) 조합에 10초 이내 도착한 알림은 dedupe.
연속 입력 시 노이즈 푸시를 1개로 합친다.

### 6.3 멱등성 보장

```text
DB 레벨:
  notification_logs.dedupe_key UNIQUE
  → 트리거가 ON CONFLICT DO NOTHING

Worker 레벨:
  SELECT log WHERE id = ?
  IF status == 'sent' RETURN
  IF status == 'skipped' RETURN

  UPDATE log
    SET status = 'sending', attempts = attempts + 1
  WHERE id = ? AND status != 'sent'
  RETURNING *

  IF RETURNING row 없음 → 다른 워커가 이미 처리 중 → RETURN

  ... FCM POST ...
  UPDATE log SET status='sent', sent_at=now()
```

### 6.4 FCM 페이로드 정규화

```ts
toFcmPayload(token, built, collapseKey) = {
  token,
  notification: { title, body },
  data: {                          // FCM data 는 string 만
    type: built.type,
    chat_room_id: built.payload.chat_room_id,
    counterpart_id: built.payload.counterpart_id,
    counterpart_name: built.payload.counterpart_name,
    deep_link: built.payload.deep_link,   // '/chat/<roomId>'
    message_id: built.payload.message_id ?? '',
    sender_id: built.payload.sender_id ?? ''
  },
  android: { priority: 'high', collapse_key: 'chat:<roomId>' },
  apns:    { payload: { aps: { sound: 'default', 'content-available': 1 } } },
  webpush: { headers: { Urgency: 'high' } }
}
```

### 6.5 토큰 비활성화

`NotRegistered` / `InvalidRegistration` 응답 시 push_tokens.is_active = false 갱신.

### 6.6 재시도

attempts 가 3 이하이고 status='failed' 인 row 를 주기적으로 재시도하는 cron.
Vercel Cron 또는 Supabase pg_cron 으로 dispatchPendingRetries() RPC 호출.

---

## 7. 메시지 빌더 로직 (수도코드)

```text
FUNCTION buildChatRoomCreatedNotification(room, counterpart, viewer):
    title = viewer.role IN ('employer', 'seeker')
              ? `${counterpart.name}님과의 채팅방이 개설되었습니다`
              : `구직자님과 채용자님 모두를 위한 새로운 채팅방이 만들어졌습니다`
    body  = `${counterpart.name}님과의 대화가 시작되었습니다.`
    RETURN {
      type: 'chat_room_created', title, body,
      payload: {
        chat_room_id: room.id,
        counterpart_id: counterpart.id,
        counterpart_name: counterpart.name,
        deep_link: `/chat/${room.id}`,
        unread_count: 1
      }
    }

FUNCTION buildChatNewMessageNotification(msg, room, counterpart, viewer):
    RETURN {
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
        unread_count: 1
      }
    }
```

---

## 8. 사용자별 수신 설정 (수도코드)

```text
FUNCTION getEffectiveChatPref(userId):
    profile = SELECT id, role FROM profiles WHERE id = userId
    IF NOT FOUND THEN RETURN null

    pref = SELECT * FROM notification_prefs WHERE user_id = userId
    IF NOT FOUND THEN
        pref = { chat_room_created: true, chat_new_message: true, push_enabled: true }
    END

    masterEnabled = true
    IF profile.role == 'seeker' THEN
        sp = SELECT notifications_enabled FROM seeker_preferences WHERE seeker_id = userId
        IF sp AND sp.notifications_enabled == false THEN
            masterEnabled = false
        END
    END

    in_quiet = isInQuietHours(pref.quiet_hours_start, pref.quiet_hours_end)

    RETURN {
      user_id: userId,
      role: profile.role,
      chat_room_created: pref.chat_room_created AND masterEnabled,
      chat_new_message:  pref.chat_new_message  AND masterEnabled,
      push_enabled:      pref.push_enabled      AND masterEnabled,
      in_quiet_hours:    in_quiet
    }
```

DB 트리거는 master switch 와 quiet hours 만 동기적으로 검사하고,
quiet hours 구간이면 status='skipped' 로그만 남긴다 (FCM 발송은 워커에서 skip).

---



## 9. 클라이언트 딥링크 (Service Worker + 라우터)

### 9.1 public/sw.js (Service Worker)

```js
// push 이벤트 — background 도착 푸시
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const deepLink = data.deep_link || '/chat'

  event.waitUntil(
    self.registration.showNotification(data.notification?.title || 'HireVan', {
      body: data.notification?.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: { ...data, deep_link: deepLink },
      tag: 'chat:' + data.chat_room_id,   // 같은 방 푸시는 합치기
      renotify: true,
    })
  )
})

// 클릭 시 채팅방으로 포커싱/이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const deepLink = event.notification.data?.deep_link || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clients) => {
        for (const c of clients) {
          if (c.url.includes(self.location.origin)) {
            await c.focus()
            c.postMessage({ type: 'NAVIGATE', deepLink: deepLink })
            return
          }
        }
        return self.clients.openWindow(deepLink)
      })
  )
})
```

### 9.2 lib/useChatPush.ts (포그라운드 수신)

```ts
useEffect(() => {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'NAVIGATE' && e.data.deepLink) {
      router.push(e.data.deepLink)  // '/chat/<roomId>'
    }
  })
}, [router])
```

### 9.3 lib/usePushToken.ts (마운트 시 1회 등록)

```ts
useEffect(() => {
  if (!user) return
  const messaging = getMessagingIfSupported()
  if (!messaging) return

  getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FCM_VAPID })
    .then((token) => {
      if (token) {
        fetch('/api/push/register', {
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
      }
    })
    .catch(console.error)
}, [user, accessToken])
```

---

## 10. 환경변수 & 운영 체크리스트

### 10.1 환경변수

| 이름 | 용도 | 비고 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | 기존 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 (브라우저) | 기존 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 측 RLS 우회 | 기존 |
| `SUPABASE_DB_URL` | postgres 풀 URL (LISTEN 용) | 신규 — 워커 전용 |
| `FCM_SERVER_KEY` | FCM legacy server key | 신규 — dev 에서 미설정 시 dry-run |
| `NEXT_PUBLIC_FCM_VAPID` | FCM web push VAPID public key | 신규 — 클라이언트 |

### 10.2 운영 체크리스트

- [ ] 마이그레이션 적용: `supabase db push` 또는 `psql -f supabase/migrations/20260608000001_chat_push_notifications.sql`
- [ ] `pg_notify` 채널이 LISTEN 가능한지 검증 (INSERT 트리거 후 LISTEN 쪽에서 수신 확인)
- [ ] 워커 배포: `tsx lib/chatPush.ts` 를 Fly.io / Render / Railway / EC2 등에 상시 실행
- [ ] FCM 프로젝트 생성, `google-services.json` (Android) / `GoogleService-Info.plist` (iOS) 클라이언트에 주입
- [ ] Service Worker 등록 (`/sw.js` 퍼블릭에 두고 `navigator.serviceWorker.register('/sw.js')`)
- [ ] Supabase Realtime 으로 클라이언트 측 unread badge 업데이트 (선택)

### 10.3 보안

- service role 키는 서버 사이드에서만 사용. 워커도 같은 변수 사용
- `push_tokens.token` 컬럼은 UNIQUE — A 사용자가 B 의 토큰을 가로채지 못함
- RLS 로 사용자는 자기 row 만 read/write
- 워커는 `requireSupabaseAdmin()` 으로 RLS 우회 (서비스 운영상 필요)

---

## 11. 파일/디렉토리 요약

| 경로 | 역할 |
|------|------|
| `supabase/migrations/20260608000001_chat_push_notifications.sql` | 테이블 3개 + 트리거 2개 + RLS + updated_at |
| `lib/chatNotifications.ts` | 빌더 + 수신 설정 통합 조회 (`getEffectiveChatPref`) + FCM 페이로드 정규화 |
| `lib/chatPush.ts` | LISTEN 워커 + `dispatchLogById` / `dispatchLog` (단건 처리) |
| `app/api/chat/rooms/route.ts` | 채팅방 생성/재사용 API |
| `app/api/chat/messages/route.ts` | 메시지 전송 API |
| `app/api/push/register/route.ts` | FCM 토큰 등록/해제 API |
| `app/api/push/preferences/route.ts` | 알림 설정 GET/PATCH API |
| `public/sw.js` | (구현 예정) Service Worker — push/notificationclick |
| `lib/useChatPush.ts` | (구현 예정) 포그라운드 메시지 → router.push |
| `lib/usePushToken.ts` | (구현 예정) FCM 토큰 등록 effect |

---

## 12. 향후 개선 아이디어

1. **VAPID 도입** (FCM HTTP v1) — `FCM_SERVER_KEY` 보다 안전
2. **이메일 백업** — `email_enabled` 와 별도 Resend / SES 워커
3. **다국어** — `profiles.locale` (ko/en) 별로 메시지 빌더 분기
4. **읽음 처리 → 푸시 mute** — 사용자가 채팅방 들어가면 `last_read_at` 업데이트, 그 이후 메시지는 푸시 skip
5. **봇 감지** — 동일 사용자가 5초 내 10회 메시지 전송 시 일시적 throttle
6. **분석** — `notification_logs.status` 별 대시보드 (전송률/실패율/quiet hours 효과)
