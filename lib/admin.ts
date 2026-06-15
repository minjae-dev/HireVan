import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

/**
 * 관리자 전용 Supabase 클라이언트 (쿠키 기반 인증)
 */
export function createAdminSupabase() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * 관리자 페이지 진입 시 인증 가드.
 * - 1) 현재 로그인한 유저 확인
 * - 2) profiles.is_admin === true 확인
 * - 3) 실패 시 /admin/login으로 리다이렉트
 *
 * Server Component / Route Handler / Table Server Action 에서 호출.
 */
export async function checkAdminAccess(): Promise<{
  userId: string
  admin: boolean
}> {
  const { cookies: cookieStore } = await import('next/headers')
  const cookieStoreInstance = await cookieStore()

  // Supabase 인증을 직접 확인 (쿠키의 sb-access-token 사용)
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // 쿠키에서 토큰 추출
  const allCookies = cookieStoreInstance.getAll()
  const sbCookie = allCookies.find(
    (c) => c.name === 'sb-access-token' || c.name.endsWith('-auth-token')
  )

  // 토큰이 없으면 로그인 안 한 상태
  if (!sbCookie) {
    redirect('/admin/login')
  }

  // 토큰으로 유저 확인
  const { data: { user }, error: authError } = await supabase.auth.getUser(sbCookie.value)

  if (authError || !user) {
    redirect('/admin/login')
  }

  // profiles 테이블에서 is_admin 확인
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.is_admin) {
    redirect('/admin/login')
  }

  return { userId: user.id, admin: true }
}

/**
 * 클라이언트 사이드에서 관리자 여부 확인.
 * is_admin 컬럼이 profiles 테이블에 있어야 함.
 */
export type AdminProfile = {
  id: string
  is_admin: boolean
  role: string
  name: string
}