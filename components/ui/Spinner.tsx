interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** 접근성 라벨. 기본값: "로딩 중". 시각장애读者的 스크린리더가 읽는다. */
  label?: string
}

const SIZE_CLASS: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-2',
}

/**
 * Spinner — 페이지/버튼 내부에서 공통으로 쓰는 로딩 인디케이터.
 *
 * 모든 페이지에서 `className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"`
 * 가 반복되어 하나로 통합했다.
 */
export default function Spinner({ size = 'md', className = '', label = '로딩 중' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={`${SIZE_CLASS[size]} border-orange-400 border-t-transparent rounded-full animate-spin ${className}`}
    />
  )
}

interface CenteredSpinnerProps {
  label?: string
  paddingY?: 'sm' | 'md' | 'lg' | 'xl'
}

const PADDING: Record<NonNullable<CenteredSpinnerProps['paddingY']>, string> = {
  sm: 'py-8',
  md: 'py-10',
  lg: 'py-16',
  xl: 'py-20',
}

/** 페이지/섹션 중앙에 표시되는 표준 로딩 fallback. */
export function CenteredSpinner({
  label = '잠시만요...',
  paddingY = 'lg',
}: CenteredSpinnerProps) {
  return (
    <div className={`flex justify-center ${PADDING[paddingY]}`}>
      <Spinner size="lg" label={label} />
    </div>
  )
}