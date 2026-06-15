'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

/**
 * 서버 액션용 Supabase 클라이언트 (쿠키 기반 인증)
 */
async function createServerClient() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // 쿠키에서 세션 토큰 추출하여 설정
  const sbCookie = allCookies.find(
    (c) => c.name === 'sb-access-token' || c.name.endsWith('-auth-token')
  )

  if (sbCookie) {
    // 토큰으로 세션 설정
    await supabase.auth.setSession({
      access_token: sbCookie.value,
      refresh_token: '',
    })
  }

  return supabase
}

/**
 * 관리자 권한 확인 후 Supabase 클라이언트 반환
 */
async function requireAdmin() {
  const supabase = await createServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('인증되지 않은 사용자입니다.')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.is_admin) {
    throw new Error('관리자 권한이 없습니다.')
  }

  return supabase
}

/**
 * 회원의 관리자 권한을 토글 (부여/회수)
 */
export async function toggleAdminStatus(userId: string, isAdmin: boolean) {
  try {
    const supabase = await requireAdmin()

    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: isAdmin })
      .eq('id', userId)

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath('/admin/members')
    revalidatePath('/admin/dashboard')

    return { success: true, message: isAdmin ? '관리자 권한을 부여했습니다.' : '관리자 권한을 회수했습니다.' }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' }
  }
}

/**
 * 회원 삭제 (강제 탈퇴)
 */
export async function deleteUser(userId: string) {
  try {
    const adminSupabase = await requireAdmin()

    // profiles 테이블에서 삭제
    const { error: profileError } = await adminSupabase
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileError) {
      throw new Error(profileError.message)
    }

    revalidatePath('/admin/members')
    revalidatePath('/admin/dashboard')

    return { success: true, message: '회원을 삭제했습니다.' }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' }
  }
}

/**
 * 회원 역할 변경
 */
export async function updateUserRole(userId: string, role: 'employer' | 'seeker') {
  try {
    const supabase = await requireAdmin()

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId)

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath('/admin/members')

    return { success: true, message: `역할을 ${role === 'employer' ? '구인자' : '구직자'}로 변경했습니다.` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' }
  }
}

/**
 * 채용공고 상태 변경
 */
export async function updateJobStatus(jobId: string, status: 'open' | 'closed') {
  try {
    const supabase = await requireAdmin()

    const { error } = await supabase
      .from('job_posts')
      .update({ status })
      .eq('id', jobId)

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath('/admin/jobs')

    return { success: true, message: `채용공고 상태를 ${status === 'open' ? '활성' : '마감'}으로 변경했습니다.` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' }
  }
}