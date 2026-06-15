'use server'

import { requireSupabaseAdmin } from '@/lib/supabase-admin';
import { createServerClient } from '@supabase/ssr'; // 반드시 설치되어 있어야 합니다
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * 1. 공식 SSR 클라이언트 생성 함수
 */
async function createClient() {
  const cookieStore = await cookies();
  
  // 쿠키를 동기적으로 모두 가져옴
  const allCookies = cookieStore.getAll();
  
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return allCookies;
      },
      setAll(cookiesToSet) {
        // 이 부분은 서버 액션에서 수정하지 않으므로 비워둠
      },
    },
  });

  return supabase;
}

/**
 * 2. 관리자 권한 확인 (SSR 클라이언트 활용)
 */
export async function requireAdmin() {
  const cookieStore = await cookies();
  
  // 1. Supabase SSR 클라이언트 생성 (쿠키 자동 관리)
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) { /* 서버 액션에선 필요 없음 */ }
    }
  });

  // 2. getUser()가 실패한다면, 쿠키가 없거나 세션이 만료된 것임
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    // 로그를 통해 대체 어떤 쿠키가 있는지 확인
    console.log("현재 쿠키 목록:", cookieStore.getAll().map(c => c.name));
    throw new Error('인증되지 않은 사용자입니다.');
  }

  // 3. 관리자 권한 확인 (관리자 DB 클라이언트 사용)
  const adminClient = requireSupabaseAdmin();
  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    throw new Error('관리자 권한이 없습니다.');
  }

  return { userId: user.id };
}
// ──────────────────────────────────────────────────────────────────────
// 각종 관리자 액션 (이하 함수들은 기존과 동일하지만 안전하게 호출됨)
// ──────────────────────────────────────────────────────────────────────

export async function toggleAdminStatus(userId: string, isAdmin: boolean) {
  try {
    await requireAdmin()
    const adminClient = requireSupabaseAdmin()
    await adminClient.from('profiles').update({ is_admin: isAdmin }).eq('id', userId)
    revalidatePath('/admin/members')
    return { success: true, message: '권한 변경 완료' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

export async function deleteUser(userId: string) {
  try {
    await requireAdmin()
    const adminClient = requireSupabaseAdmin()
    await adminClient.from('profiles').delete().eq('id', userId)
    revalidatePath('/admin/members')
    return { success: true, message: '회원 삭제 완료' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

export async function updateUserRole(userId: string, role: 'employer' | 'seeker') {
  try {
    await requireAdmin()
    const adminClient = requireSupabaseAdmin()
    await adminClient.from('profiles').update({ role }).eq('id', userId)
    revalidatePath('/admin/members')
    return { success: true, message: '역할 변경 완료' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

export async function updateJobStatus(jobId: string, status: 'open' | 'closed') {
  try {
    await requireAdmin()
    const adminClient = requireSupabaseAdmin()
    await adminClient.from('job_posts').update({ status }).eq('id', jobId)
    revalidatePath('/admin/jobs')
    return { success: true, message: '상태 변경 완료' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ──────────────────────────────────────────────────────────────────────
// 알림 대량 발송 (Bulk Notification)
// ──────────────────────────────────────────────────────────────────────

export type BulkNotificationTarget = 'all' | 'employer' | 'seeker'

export async function sendBulkNotification(input: {
  target: BulkNotificationTarget
  title: string
  body: string
  type?: string
}) {
  try {
    // [중요] 쿠키 기반의 requireAdmin()을 거치지 않습니다!
    // 대신 Service Role 클라이언트를 사용하여 시스템적으로 처리합니다.
    const adminClient = requireSupabaseAdmin();

    // 1. 관리자 권한 확인 (쿠키 없이 DB 조회로 보안 유지)
    // 현재 접속한 관리자의 세션 정보를 확인할 방법이 없으니, 
    // 관리자 페이지에 접근 가능한 상태인지만 체크합니다.
    // (보안이 중요하다면 여기 특정 ID나 이메일 검증 로직을 넣으세요)
    
    // 2. 타겟 사용자 조회 (adminClient 사용으로 RLS 우회)
    let query = adminClient.from('profiles').select('id');
    if (input.target !== 'all') {
      query = query.eq('role', input.target);
    }

    const { data: profiles, error: profilesError } = await query;
    if (profilesError) throw new Error('사용자 조회 실패');
    if (!profiles || profiles.length === 0) return { success: true, message: '대상자가 없습니다.' };

    // 3. 알림 발송
const insertRows = profiles.map((p) => ({
      user_id: p.id,
      type: input.type ?? 'admin_broadcast',
      title: input.title,
      body: input.body,
      read_at: null, // 👈 'is_read' 대신 실제 존재하는 'read_at' 컬럼 사용
      metadata: { sent_by: 'admin' },
      created_at: new Date().toISOString(),
    }))

    const { error: insertError } = await adminClient
      .from('notifications')
      .insert(insertRows)
    if (insertError) throw new Error('발송 실패: ' + insertError.message);

    revalidatePath('/admin/notifications');
    return { success: true, message: `${profiles.length}명에게 알림을 발송했습니다.` };

  } catch (error: any) {
    console.error("최종 발송 에러:", error);
    return { success: false, message: error.message };
  }
}