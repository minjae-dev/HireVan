'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'text-white shadow-sm active:scale-95',
  secondary:
    'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-95',
  danger:
    'border border-red-200 bg-white text-red-600 hover:bg-red-50 active:scale-95',
  ghost: 'text-gray-500 hover:text-gray-800',
}

const VARIANT_STYLE: Record<Variant, React.CSSProperties> = {
  primary: { backgroundColor: 'var(--brand)' },
  secondary: {},
  danger: {},
  ghost: {},
}

/**
 * PrimaryButton
 *
 * 페이지별로 반복되던 "브랜드 색 + 비활성 로딩 상태 + active scale" 버튼 마크업을 통합.
 * - `loading=true` 면 내부에서 텍스트 앞에 스피너를 표시하고 disabled 처리한다.
 * - `variant` 에 따라 primary / secondary / danger / ghost 스타일을 적용한다.
 */
export default function PrimaryButton({
  variant = 'primary',
  loading = false,
  fullWidth = true,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: PrimaryButtonProps) {
  const widthCls = fullWidth ? 'w-full' : ''
  const disabledCls = disabled || loading ? 'disabled:opacity-60' : ''
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${widthCls} ${VARIANT_CLASS[variant]} font-semibold py-3 rounded-xl transition-all ${disabledCls} ${className}`}
      style={VARIANT_STYLE[variant]}
      {...rest}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}