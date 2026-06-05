import { supabase } from '@/lib/supabase'
import { toErrorMessage } from '@/lib/safe'

/**
 * lib/resume.ts
 *
 * resumes 테이블 + Supabase Storage 의 'resumes' 버킷 관련 로직을 한 곳에 모았다.
 * 업로드 형식/사이즈 검증과 에러 메시지 정규화는 페이지에서 분리.
 */

export const RESUME_BUCKET = 'resumes'

/** 업로드 가능한 MIME 타입 */
export const RESUME_ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

/** 최대 업로드 크기 (10MB) */
export const RESUME_MAX_SIZE_BYTES = 10 * 1024 * 1024

export interface ResumeRow {
  id: string
  seeker_id: string
  file_url: string
  updated_at: string
}

export class ResumeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResumeValidationError'
  }
}

/** 파일 형식/크기 사전 검증. 실패하면 ResumeValidationError throw. */
export function validateResumeFile(file: File): void {
  if (!RESUME_ALLOWED_TYPES.includes(file.type as (typeof RESUME_ALLOWED_TYPES)[number])) {
    throw new ResumeValidationError('PDF, DOC, DOCX 파일만 업로드할 수 있습니다.')
  }
  if (file.size > RESUME_MAX_SIZE_BYTES) {
    throw new ResumeValidationError('이력서는 10MB 이하 파일만 업로드할 수 있습니다.')
  }
}

/** Supabase Storage 에 업로드 → public URL 발급 → resumes row upsert. */
export async function uploadResume(
  userId: string,
  file: File,
): Promise<ResumeRow> {
  if (!userId) throw new Error('로그인이 필요해요.')
  validateResumeFile(file)

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${userId}/${Date.now()}-${safeName}`

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(RESUME_BUCKET)
    .upload(filePath, file, {
      upsert: true,
      cacheControl: '3600',
    })

  if (uploadError) {
    throw new Error(`이력서 업로드 실패: ${toErrorMessage(uploadError)}`)
  }
  if (!uploadData) {
    throw new Error('이력서 업로드에 실패했어요. 잠시 후 다시 시도해주세요.')
  }

  const { data: publicUrlData } = supabase.storage.from(RESUME_BUCKET).getPublicUrl(filePath)
  const updatedAt = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: upsertError } = await (supabase as any)
    .from('resumes')
    .upsert(
      {
        seeker_id: userId,
        file_url: publicUrlData.publicUrl,
        updated_at: updatedAt,
      },
      { onConflict: 'seeker_id' },
    )
    .select('id, seeker_id, file_url, updated_at')
    .single()

  if (upsertError || !data) {
    throw new Error('이력서 정보를 저장하지 못했어요. 잠시 후 다시 시도해주세요.')
  }
  return data as ResumeRow
}

/** 특정 구직자의 이력서를 가져온다. 없으면 null. */
export async function fetchResume(seekerId: string): Promise<ResumeRow | null> {
  if (!seekerId) return null
  const { data, error } = await supabase
    .from('resumes')
    .select('id, seeker_id, file_url, updated_at')
    .eq('seeker_id', seekerId)
    .maybeSingle()
  if (error) throw error
  return (data as ResumeRow | null) ?? null
}