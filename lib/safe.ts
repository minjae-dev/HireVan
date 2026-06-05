/**
 * lib/safe.ts
 *
 * null/undefined 값에 대해 안전하게 fallback 을 적용하는 가벼운 유틸들.
 * DB 가 null 을 반환할 수 있는 모든 필드(skills, available_shifts, bio 등)에
 * 적용하여 UI 가 깨지지 않도록 보호한다.
 */

/** null/undefined 면 fallback 반환, 아니면 그대로. */
export function withDefault<T>(value: T | null | undefined, fallback: T): T {
  return value === null || value === undefined ? fallback : value
}

/** null/undefined 면 [] 반환, 아니면 그대로. (배열 안전 가드) */
export function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/** string|null|undefined → 비어있지 않은 string. 비어있으면 fallback. */
export function safeString(value: string | null | undefined, fallback: string = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** number|null|undefined → number. NaN/비숫자면 fallback. */
export function safeNumber(value: number | null | undefined, fallback: number = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** boolean|null|undefined → 명시적 boolean. null/undefined 면 fallback. */
export function safeBool(value: boolean | null | undefined, fallback: boolean = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/**
 * 이메일/메시지 등에서 사용되는 안전한 에러 메시지 추출.
 * Supabase 에러 객체 또는 일반 Error, string, undefined 어디에서든
 * 사용자에게 보여줄 수 있는 한 줄 문자열을 추출한다.
 */
export function toErrorMessage(err: unknown, fallback: string = '알 수 없는 오류가 발생했어요'): string {
  if (err == null) return fallback
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg.length > 0) return msg
  }
  return fallback
}

/**
 * DB `custom_questions` / `custom_answers` 같이 JSON 으로 저장된 배열을
 * `{ id, question, answer? }` 형태로 안전하게 파싱한다.
 *
 * 잘못된 shape 의 항목은 모두 버린다. `value` 자체가 배열이 아니면 [] 반환.
 */
export interface ParsedQuestion {
  id: string
  question: string
}

export interface ParsedAnswer extends ParsedQuestion {
  answer: string
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export function parseQuestions(value: unknown): ParsedQuestion[] {
  if (!Array.isArray(value)) return []
  const out: ParsedQuestion[] = []
  for (const item of value) {
    if (!isPlainObject(item)) continue
    const question = typeof item.question === 'string' ? item.question.trim() : ''
    if (!question) continue
    const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `q${out.length + 1}`
    out.push({ id, question })
  }
  return out
}

export function parseAnswers(value: unknown): ParsedAnswer[] {
  if (!Array.isArray(value)) return []
  const out: ParsedAnswer[] = []
  for (const item of value) {
    if (!isPlainObject(item)) continue
    const question = typeof item.question === 'string' ? item.question.trim() : ''
    const answer = typeof item.answer === 'string' ? item.answer.trim() : ''
    if (!question || !answer) continue
    const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : `q${out.length + 1}`
    out.push({ id, question, answer })
  }
  return out
}