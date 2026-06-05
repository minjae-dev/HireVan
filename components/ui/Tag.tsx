interface TagProps {
  icon: string
  text: string | null | undefined
  size?: 'sm' | 'md'
  /** 전체 폭 (true 면 부모 width 100%) */
  fullWidth?: boolean
  /** 부제목/오른쪽 정렬 등 커스텀 wrapper. 미사용 시 default span. */
  as?: 'span' | 'div'
}

const SIZE_CLASS: Record<NonNullable<TagProps['size']>, string> = {
  sm: 'text-[11px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1.5',
}

/**
 * Tag — 아이콘 + 텍스트 칩.
 *
 * `📍 다운타운`, `💰 $17/hr` 같은 라벨을 일관된 모양으로 렌더한다.
 * text 가 null/빈 문자열이면 렌더하지 않는다.
 */
export default function Tag({ icon, text, size = 'md', fullWidth, as = 'span' }: TagProps) {
  if (!text) return null
  const TagElement = as
  const sizeCls = SIZE_CLASS[size]
  const widthCls = fullWidth ? 'w-full justify-start' : ''
  return (
    <TagElement
      className={`inline-flex items-center gap-1 text-gray-600 bg-gray-50 border border-gray-100 rounded-full ${sizeCls} ${widthCls}`}
    >
      <span>{icon}</span>
      <span>{text}</span>
    </TagElement>
  )
}