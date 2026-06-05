import { supabase } from '@/lib/supabase'
import { safeArray, safeNumber, safeString } from '@/lib/safe'

/**
 * lib/profile.ts
 *
 * profiles 테이블 fetch / 업데이트와 관련 정규화 로직을 한 곳에 모았다.
 * 페이지에서는 이 모듈의 함수만 호출하면 되도록 의도했다.
 */

export interface SeekerCompetitiveFields {
  localExperienceMonths: number
  skills: string[]
  availableShifts: string[]
  postalCodePrefix: string
}

/**
 * DB row(혹은 그와 유사한 record)를 SeekerCompetitiveFields 로 정규화한다.
 *
 * - skills/available_shifts 가 배열이 아니면 빈 배열로 폴백
 * - local_experience_months 가 숫자가 아니면 0
 * - postal_code_prefix 가 문자열이 아니면 빈 문자열
 *
 * 이렇게 해야 UI 가 .map / .filter 등에서 런타임에 죽지 않는다.
 */
export function normalizeSeekerCompetitiveFields(
  raw: Record<string, unknown> | null | undefined,
): SeekerCompetitiveFields {
  const d = raw ?? {}
  return {
    localExperienceMonths:
      typeof d.local_experience_months === 'number' && Number.isFinite(d.local_experience_months)
        ? d.local_experience_months
        : 0,
    skills: safeArray(d.skills as string[] | null) as string[],
    availableShifts: safeArray(d.available_shifts as string[] | null) as string[],
    postalCodePrefix:
      typeof d.postal_code_prefix === 'string' ? (d.postal_code_prefix as string) : '',
  }
}

export interface NormalizedSeekerProfile {
  name: string
  bio: string
  visaType: string
  visaExpiryDate: string
  hasSir: boolean
  hasFoodsafe: boolean
  competitive: SeekerCompetitiveFields
}

/**
 * profiles row 에서 구직자 관련 필드만 추려내어 폼 상태에 바로 넣을 수 있는 형태로 반환.
 * 모든 필드는 null/undefined 안전하다.
 */
export function normalizeSeekerProfile(
  raw: Record<string, unknown> | null | undefined,
): NormalizedSeekerProfile {
  const d = raw ?? {}
  return {
    name: safeString(d.name as string | null),
    bio: safeString(d.bio as string | null),
    visaType: safeString(d.visa_type as string | null),
    visaExpiryDate: safeString(d.visa_expiry_date as string | null),
    hasSir: d.has_sir === true,
    hasFoodsafe: d.has_foodsafe === true,
    competitive: normalizeSeekerCompetitiveFields(d),
  }
}

/**
 * 현재 사용자의 profiles row 한 줄을 가져온다.
 * - row 가 없으면 null 반환 (에러 throw 하지 않음)
 * - Supabase 자체 에러는 그대로 throw — 호출 측에서 catch 해서 사용자에게 토스트로 알린다.
 */
export async function fetchOwnProfileRow(userId: string): Promise<Record<string, unknown> | null> {
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as Record<string, unknown> | null) ?? null
}

export interface UpdateSeekerProfileInput {
  name: string
  bio: string
  visaType: string
  visaExpiryDate: string
  hasSir: boolean
  hasFoodsafe: boolean
  localExperienceMonths: number
  skills: string[]
  availableShifts: string[]
  postalCodePrefix: string
}

export interface UpdateEmployerProfileInput {
  name: string
  bio: string
  visaType: string
}

/**
 * 구직자 프로필 업데이트.
 * local_experience_months 는 0~600 사이로 클램프하여 DB CHECK 제약과 일치시킨다.
 * 빈 우편번호는 null 로 저장 (DB 가 null 허용).
 */
export async function updateSeekerProfile(
  userId: string,
  input: UpdateSeekerProfileInput,
): Promise<void> {
  const months = Math.max(
    0,
    Math.min(600, Number.isFinite(input.localExperienceMonths) ? input.localExperienceMonths : 0),
  )
  const payload: Record<string, unknown> = {
    name: input.name,
    bio: input.bio,
    visa_type: input.visaType,
    visa_expiry_date: input.visaExpiryDate || null,
    has_sir: input.hasSir,
    has_foodsafe: input.hasFoodsafe,
    local_experience_months: months,
    skills: input.skills,
    available_shifts: input.availableShifts,
    postal_code_prefix: input.postalCodePrefix === '' ? null : input.postalCodePrefix,
  }
  const { error } = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(payload as any)
    .eq('id', userId)
  if (error) throw error
}

/** 고용주 프로필 업데이트 (name / bio / visa_type) */
export async function updateEmployerProfile(
  userId: string,
  input: UpdateEmployerProfileInput,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ name: input.name, bio: input.bio, visa_type: input.visaType } as any)
    .eq('id', userId)
  if (error) throw error
}

/** 캐나다 우편번호 3자리 정규화: 영문 대문자 + 숫자 + 영문 대문자. */
export const POSTAL_CODE_REGEX = /^[A-Za-z][0-9][A-Za-z]$/

export function normalizePostalCodePrefix(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3)
}

export function isPostalCodeValid(value: string): boolean {
  return value === '' || POSTAL_CODE_REGEX.test(value)
}

/** 인증 미션 — 현재 보유 크레딧 (DB 의 credits 컬럼) */
export function getCurrentCredits(profile: Record<string, unknown> | null | undefined): number {
  if (!profile) return 0
  const c = profile.credits
  return safeNumber(c as number | null, 0)
}