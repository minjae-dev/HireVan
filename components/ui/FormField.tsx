interface FormFieldProps {
  label: string
  required?: boolean
  children: React.ReactNode
  /** 라벨 하단 보조 텍스트 (placeholder 설명 등) */
  hint?: string
}

/**
 * FormField
 *
 * 라벨 + 입력 컨트롤 + 보조 텍스트를 한 단위로 묶는 표준 폼 필드 레이아웃.
 * jobs/new, employer/jobs/new 등에서 동일하게 반복되는 마크업을 통합.
 */
export default function FormField({ label, required, children, hint }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export const INPUT_CLASS =
  'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent'

export const TEXTAREA_CLASS = `${INPUT_CLASS} resize-none`