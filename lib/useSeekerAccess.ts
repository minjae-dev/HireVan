'use client'

import { useCallback, useState } from 'react'
import { supabase } from './supabase'
import type { PublicProfile, ViewSeekerProfileResult } from './database.types'

interface UseSeekerAccessState {
  loading: boolean
  profile: PublicProfile | null
  creditsRemaining: number
  /** 'idle' | 'blocked' | 'error' — blocked는 크레딧 소진/권한 없음 */
  status: 'idle' | 'blocked' | 'error'
  reason: ViewSeekerProfileResult['reason'] | null
  error: string | null
  /** 현재 열람 시도한 구직자 ID (RPC에 사용) */
  seekerId: string | null
  open: (seekerId: string) => Promise<void>
  close: () => void
}

/**
 * useSeekerAccess — 구직자 프로필 "열람" 훅.
 *
 * - `view_seeker_profile` RPC를 호출해 크레딧을 차감하고
 *   profiles_public 뷰 기반의 안전 마스킹된 데이터를 받는다.
 * - PRO / grace_period / 이미 본 구직자 → 크레딧 차감 없음 (`reason` 으로 구분).
 * - 크레딧 0 이하면 status='blocked' 로 전환하여 모달을 띄우도록 한다.
 *
 * 사용 예:
 *   const seeker = useSeekerAccess()
 *   <button onClick={() => seeker.open(someSeekerId)}>프로필 보기</button>
 *   <ProUpsellModal open={seeker.status === 'blocked'} ... />
 */
export function useSeekerAccess(): UseSeekerAccessState {
  const [loading, setLoading] = useState(false)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [creditsRemaining, setCreditsRemaining] = useState(0)
  const [status, setStatus] = useState<UseSeekerAccessState['status']>('idle')
  const [reason, setReason] = useState<ViewSeekerProfileResult['reason'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seekerId, setSeekerId] = useState<string | null>(null)

  const open = useCallback(async (id: string) => {
    setSeekerId(id)
    setLoading(true)
    setError(null)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase as any).rpc('view_seeker_profile', {
        p_seeker_id: id,
      })

      if (rpcError) {
        console.error('[useSeekerAccess] RPC error:', rpcError)
        setError(rpcError.message ?? 'Unknown error')
        setStatus('error')
        return
      }

      const result = data as ViewSeekerProfileResult

      if (result?.ok && result.profile) {
        setProfile(result.profile)
        setCreditsRemaining(result.credits_remaining ?? 0)
        setReason(result.reason)
        setStatus('idle')
      } else {
        setProfile(null)
        setReason(result?.reason ?? 'no_credit')
        setCreditsRemaining(result?.credits_remaining ?? 0)
        setStatus('blocked')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[useSeekerAccess] Unexpected error:', err)
      setError(message)
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }, [])

  const close = useCallback(() => {
    setStatus('idle')
    setError(null)
    setReason(null)
    setSeekerId(null)
    // profile은 의도적으로 유지 — 모달이 닫혀도 카드는 계속 보이게
  }, [])

  return { loading, profile, creditsRemaining, status, reason, error, seekerId, open, close }
}
