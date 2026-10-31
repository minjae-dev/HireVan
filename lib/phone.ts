/**
 * 북미 전화번호를 10자리 숫자 문자열로 정규화한다.
 * 스크래퍼 저장값(job_posts.contact_phone)과 claim 비교값이 같은 형식이어야 매칭된다.
 * "+1 (778) 872-8382" → "7788728382". 10자리(또는 1로 시작하는 11자리)가 아니면 null.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  return ten.length === 10 ? ten : null
}
