'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { EmployerBillingStatus } from './database.types'
import { useAuth } from './auth-context'

/**
 * 결제 직후 Stripe 웹후크가 DB에 반영되기까지 발생하는
 * **race condition**을 방어하기 위한 폴링 훅.
 *
 * ## 문제
 *
 * 사용자가 Stripe Checkout에서 결제를 완료하면 Stripe는 두 가지를 동시에 한다:
 *  1) `success_url` 로 브라우저를 즉시 리다이렉트
 *  2) `checkout.session.completed` 웹후크를 백엔드로 비동기 전송
 *
 * (1)이 (2)보다 빠르면 사용자는 대시보드로 돌아왔을 때
 * `profiles.plan === 'free'` 인 상태를 보게 된다. 이 사이클은
 * 일반적으로 0.5~5초 정도 걸리지만, 네트워크 상태나 Supabase read-replica
 * lag 에 따라 그보다 길어질 수도 있다.
 *
 * ## 해결 전략 (이중 검증)
 *
 * `start()` 를 호출하면 다음을 동시에 수행한다:
 *  1) `refreshProfile()` 로 인메모리 프로필을 새로 가져온다.
 *  2) `get_employer_billing_status` RPC 를 500ms 간격으로 호출한다.
 *  3) `profiles` 테이블을 직접 SELECT 해서 `pro_subscriber === true` 인지 확인한다
 *     (RPC가 캐시/스냅샷이 stale 일 때의 백업 경로).
 *  4) 위 둘 중 **하나라도** `pro_subscriber === true` 이면 즉시 `active`.
 *  5) 최대 12초 (24회) 가 경과하면 `timeout`. (이전 5초 → 12초로 확장)
 *  6) `active` 가 되면 1초 후 자동으로 hook 종료.
 *
 * ## 안전성
 *
 * - 컴포넌트 unmount 시 폴링을 자동 중단한다.
 * - useRef 로 interval id 를 보관하여 중복 시작을 막는다.
 * - useAuth().user 가 없으면 즉시 early-return 한다.
 * - window focus 이벤트도 폴링을 재시작한다.
 */

export type PollStatus = 'idle' | 'pending' | 'active' | 'timeout' | 'error'

export interface PollProUpgradeState {
  status: PollStatus
  /** 마지막으로 가져온 billing 상태 (성공한 마지막 값 유지) */
  billing: EmployerBillingStatus | null
  /** 경과 시간(ms). UI 진행 바에 사용. */
  elapsedMs: number
  /** 에러 메시지 */
  error: string | null
  /** 폴링 시작. 이미 진행 중이면 no-op. */
  start: () => void
  /** 폴링 중단. */
  stop: () => void
  /** true 면 active 가 된 직후 페이지를 새로고침 (가장 확실한 동기화) */
  reloadOnActive?: boolean
}

interface UsePollProUpgradeOptions {
  /** 폴링 간격(ms). 기본 500ms. */
  intervalMs?: number
  /** 최대 폴링 시간(ms). 기본 12000ms (12초). */
  maxDurationMs?: number
  /**
   * true 면 `start()` 가 자동으로 호출되지 않는다.
   * 호출 측에서 의도적으로 `upgrade=success` 쿼리를 감지한 뒤 호출한다.
   */
  manual?: boolean
  /**
   * active 상태가 되면 자동으로 `window.location.reload()` 를 호출한다.
   * (가장 확실한 동기화 — RPC 캐시 등을 모두 우회)
   */
  reloadOnActive?: boolean
}

const DEFAULT_INTERVAL = 500
const DEFAULT_MAX_DURATION = 12000

export function usePollProUpgrade(
  options: UsePollProUpgradeOptions = {},
): PollProUpgradeState {
  const { user, refreshProfile, profile } = useAuth()
  const {
    intervalMs = DEFAULT_INTERVAL,
    maxDurationMs = DEFAULT_MAX_DURATION,
    manual = true,
    reloadOnActive = false,
  } = options

  const [status, setStatus] = useState<PollStatus>('idle')
  const [billing, setBilling] = useState<EmployerBillingStatus | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // 폴링 컨트롤을 ref 로 보관 — 상태 업데이트에 영향 X
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef<number>(0)
  const stoppedRef = useRef<boolean>(false)
  const reloadScheduledRef = useRef<boolean>(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const fetchBilling = useCallback(async (): Promise<EmployerBillingStatus | null> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase as any).rpc('get_employer_billing_status')
      if (rpcError) {
        console.warn('[usePollProUpgrade] RPC error:', rpcError.message)
        return null
      }
      return (data as EmployerBillingStatus) ?? null
    } catch (err) {
      console.warn('[usePollProUpgrade] RPC fetch failed:', err)
      return null
    }
  }, [])

  /**
   * profiles 테이블을 직접 SELECT 해서 pro_subscriber 컬럼을 확인.
   * RPC 가 stale 이거나 권한 문제로 빈 값을 줄 때의 fallback 경로.
   */
  const fetchProfileProFlag = useCallback(async (): Promise<boolean> => {
    if (!user) return false
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: pErr } = await (supabase as any)
        .from('profiles')
        .select('pro_subscriber, plan')
        .eq('id', user.id)
        .maybeSingle()
      if (pErr) {
        console.warn('[usePollProUpgrade] profiles select error:', pErr.message)
        return false
      }
      return data?.pro_subscriber === true || data?.plan === 'pro'
    } catch (err) {
      console.warn('[usePollProUpgrade] profiles select failed:', err)
      return false
    }
  }, [user])

  const stop = useCallback(() => {
    stoppedRef.current = true
    clearTimer()
  }, [clearTimer])

  const start = useCallback(() => {
    // 이미 진행 중이면 no-op (중복 시작 방지)
    if (timerRef.current) return
    if (!user) {
      setError('로그인이 필요해요.')
      setStatus('error')
      return
    }

    stoppedRef.current = false
    reloadScheduledRef.current = false
    startedAtRef.current = Date.now()
    setError(null)
    setStatus('pending')
    setElapsedMs(0)

    const tick = async () => {
      if (stoppedRef.current) return

      const elapsed = Date.now() - startedAtRef.current
      setElapsedMs(elapsed)

      // 1) 인메모리 프로필 동기화 (AuthContext 의 profile 상태)
      await refreshProfile()

      // 2) billing RPC 조회 + 3) profiles 테이블 직접 SELECT (이중 검증)
      const [rpcResult, directProFlag] = await Promise.all([
        fetchBilling(),
        fetchProfileProFlag(),
      ])

      const rpcIsPro = rpcResult?.pro_subscriber === true
      const directIsPro = directProFlag === true

      if (rpcResult) setBilling(rpcResult)

      // 둘 중 하나라도 pro 면 즉시 active
      if (rpcIsPro || directIsPro) {
        setStatus('active')
        clearTimer()
        timerRef.current = null
        // 새로고침 옵션: 활성 후 800ms 정도 여유를 두고 페이지 리로드
        // (RPC 캐시 / AuthContext 메모리 상태까지 확실히 동기화)
        if (reloadOnActive && !reloadScheduledRef.current) {
          reloadScheduledRef.current = true
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              window.location.reload()
            }
          }, 800)
        }
        return
      }

      // 4) 타임아웃 체크
      if (elapsed >= maxDurationMs) {
        setStatus('timeout')
        clearTimer()
        timerRef.current = null
        return
      }

      // 5) 다음 폴링 스케줄
      timerRef.current = setTimeout(tick, intervalMs)
    }

    // 첫 호출은 즉시
    tick()
  }, [user, refreshProfile, fetchBilling, fetchProfileProFlag, intervalMs, maxDurationMs, clearTimer, reloadOnActive])

  // 컴포넌트 unmount 시 정리
  useEffect(() => {
    return () => {
      stoppedRef.current = true
      clearTimer()
    }
  }, [clearTimer])

  // manual=false 면 마운트 시 자동 시작
  useEffect(() => {
    if (!manual && user) {
      start()
    }
  }, [manual, user, start])

  // window focus 시 폴링 자동 재시작 (탭 전환 후 돌아왔을 때 sync)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onFocus = () => {
      // 이미 active 면 no-op
      if (status === 'active') return
      // 인메모리 profile 이 이미 pro 면 더 할 필요 없음
      if (profile?.pro_subscriber || profile?.plan === 'pro') {
        setStatus('active')
        return
      }
      // 폴링이 idle 이거나 timeout 일 때만 재시작
      if (status === 'idle' || status === 'timeout') {
        start()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [status, profile?.pro_subscriber, profile?.plan, start])

  return { status, billing, elapsedMs, error, start, stop, reloadOnActive }
}
