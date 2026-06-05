interface StatusBadgeProps {
  status: string
  /** 사용 가능한 상태 맵을 주입하면 라벨/색상을 자유롭게 확장 가능 */
  map?: Record<string, { label: string; cls: string }>
  /** 알 수 없는 상태일 때의 폴백 라벨 */
  fallbackLabel?: string
}

const DEFAULT_MAP: Record<string, { label: string; cls: string }> = {
  pending: { label: '검토중', cls: 'bg-yellow-100 text-yellow-700' },
  accepted: { label: '수락됨', cls: 'bg-green-100 text-green-700' },
  rejected: { label: '거절됨', cls: 'bg-red-100 text-red-500' },
  open: { label: '모집중', cls: 'bg-green-100 text-green-700' },
  closed: { label: '마감', cls: 'bg-gray-100 text-gray-500' },
}

/**
 * StatusBadge
 *
 * 지원서 상태(pending/accepted/rejected)나 공고 상태(open/closed) 등
 * enum-ish 상태값을 일관된 디자인의 작은 뱃지로 표시한다.
 *
 * 페이지마다 `function StatusBadge` 가 중복 정의되어 있던 것을 통합.
 */
export default function StatusBadge({
  status,
  map = DEFAULT_MAP,
  fallbackLabel,
}: StatusBadgeProps) {
  const entry = map[status] ?? {
    label: fallbackLabel ?? status,
    cls: 'bg-gray-100 text-gray-500',
  }
  return (
    <span
      className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${entry.cls}`}
    >
      {entry.label}
    </span>
  )
}