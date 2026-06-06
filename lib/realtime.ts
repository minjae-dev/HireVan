'use client'

import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type ChannelConfig = {
  roomId: string
  table: string
  filter?: string
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
  onInsert?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
  onUpdate?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
  onDelete?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
}

/**
 * Realtime 구독을 생성하고 자동 재연결을 처리한다.
 *
 * - Supabase Realtime 채널은 네트워크 단절 후 자동 재연결을 보장하지 않는다.
 * - 이 유틸은 `onSystem` 이벤트를 통해 채널 상태 변화를 감지하고,
 *   상태가 CLOSED/CHANNEL_ERROR 가 되면 자동으로 구독을 재시도한다.
 * - 재시도는 지수 백오프(1s → 2s → 4s → … 최대 30s)를 사용한다.
 *
 * @returns cleanup 함수. 컴포넌트 unmount 시 호출하여 구독을 해제한다.
 */
export function subscribeWithReconnect(config: ChannelConfig): () => void {
  let channel: RealtimeChannel | null = null
  let retryCount = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let isUnsubscribed = false

  const maxRetryDelay = 30_000 // 30초
  const getDelay = () => Math.min(1000 * Math.pow(2, retryCount), maxRetryDelay)

  const setupChannel = () => {
    if (isUnsubscribed) return

    channel = supabase.channel(`room:${config.roomId}`)

    channel.on(
      'postgres_changes',
      {
        event: config.event ?? '*',
        schema: 'public',
        table: config.table,
        filter: config.filter,
      },
      (payload) => {
        if (payload.eventType === 'INSERT' && config.onInsert) {
          config.onInsert(payload as RealtimePostgresChangesPayload<Record<string, unknown>>)
        } else if (payload.eventType === 'UPDATE' && config.onUpdate) {
          config.onUpdate(payload as RealtimePostgresChangesPayload<Record<string, unknown>>)
        } else if (payload.eventType === 'DELETE' && config.onDelete) {
          config.onDelete(payload as RealtimePostgresChangesPayload<Record<string, unknown>>)
        }
      },
    )

    // 시스템 상태 변화 감지 — 연결이 끊어지면 자동 재구독
    channel.on('system', { event: '*' }, (event: string) => {
      if (event === 'CLOSED' || event === 'CHANNEL_ERROR') {
        console.warn(`[realtime] Channel closed/error for ${config.roomId}, reconnecting... (attempt ${retryCount + 1})`)
        cleanupCurrent()
        retryCount++
        retryTimer = setTimeout(setupChannel, getDelay())
      } else if (event === 'SUBSCRIBED' || event === 'CHANNEL_JOINED') {
        // 연결 성공 — 재시도 카운터 리셋
        retryCount = 0
      }
    })

    channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        retryCount = 0
      } else if (status === 'CHANNEL_ERROR') {
        console.warn(`[realtime] Subscribe error for ${config.roomId}, reconnecting... (attempt ${retryCount + 1})`)
        cleanupCurrent()
        retryCount++
        retryTimer = setTimeout(setupChannel, getDelay())
      }
    })
  }

  const cleanupCurrent = () => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  setupChannel()

  return () => {
    isUnsubscribed = true
    cleanupCurrent()
  }
}