import type { ToastTone } from '@/lib/useToast'
import { toErrorMessage } from '@/lib/safe'

/**
 * 한국어 기준 상대 시간 포맷터.
 * - 1분 미만 → "방금"
 * - 1시간 미만 → "N분 전"
 * - 24시간 미만 → "N시간 전"
 * - 7일 미만 → "N일 전"
 * - 그 외 → "M월 D일"
 */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffHour < 24) return `${diffHour}시간 전`
  if (diffDay < 7) return `${diffDay}일 전`
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

/** "2024-03-12" 형식의 date string → 오늘과의 차이 일수. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return Number.POSITIVE_INFINITY
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY
  const ms = target.getTime() - now.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

/**
 * 한국어 라벨이 미리 정의된 enum-ish 매핑 헬퍼.
 * - value 가 매핑에 없으면 fallback (또는 '—') 반환.
 * - 안전하게 null/undefined 처리.
 */
export function labelOf<T extends string>(
  map: Record<T, string>,
  value: string | null | undefined,
  fallback: string = '—',
): string {
  if (!value) return fallback
  return (map as Record<string, string>)[value] ?? fallback
}

/**
 * Supabase / 일반 catch 결과에 따라 사용자에게 보여줄 메시지를 결정한다.
 *  - "duplicate key" (code 23505) → 중복
 *  - "row not found" (PGRST116) → 없음
 *  - 네트워크 / fetch 실패 → fallback
 *
 *  toast 의 'error' tone 으로 표시할 메시지를 만드는 데 사용.
 */
export function describeSupabaseError(
  err: unknown,
  fallback: string = '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.',
): { message: string; tone: ToastTone } {
  const raw = toErrorMessage(err, '')
  if (!raw) return { message: fallback, tone: 'error' }
  const code = (err as { code?: string } | null)?.code ?? ''
  if (code === '23505' || /duplicate key/i.test(raw)) {
    return { message: '이미 처리된 요청이에요. 페이지를 새로고침한 뒤 다시 시도해주세요.', tone: 'info' }
  }
  if (code === 'PGRST116' || /row not found/i.test(raw)) {
    return { message: '요청하신 데이터를 찾을 수 없어요.', tone: 'info' }
  }
  return { message: raw, tone: 'error' }
}