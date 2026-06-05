interface ErrorAlertProps {
  message: string | null | undefined
  /** 마진 (Tailwind 클래스). 기본 mt-3. */
  marginTop?: string
  /** 인라인 형태 (작은 글씨, 빨간 텍스트만) 사용 여부 */
  inline?: boolean
}

/**
 * ErrorAlert
 *
 * 폼/액션에서 발생한 에러 메시지를 일관된 디자인으로 표시한다.
 * - `inline=false` (기본): 빨간 박스 형태 (`bg-red-50 px-4 py-3`)
 * - `inline=true`: 작은 빨간 텍스트만 (헤더 옆 메시지 등)
 *
 * message 가 null/undefined/빈 문자열이면 아무것도 렌더하지 않는다.
 */
export default function ErrorAlert({ message, marginTop = 'mt-3', inline = false }: ErrorAlertProps) {
  if (!message) return null
  if (inline) {
    return <p className={`text-sm text-red-500 ${marginTop}`}>{message}</p>
  }
  return (
    <p
      className={`text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 ${marginTop}`}
    >
      {message}
    </p>
  )
}