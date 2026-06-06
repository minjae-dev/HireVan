import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/seeker/matches
 *
 * 구직자의 희망 조건 기반 맞춤 공고 목록 반환.
 * Auth: Supabase 세션 필요.
 *
 * Query params:
 *   - limit?: number (기본 20)
 */
export async function GET(request: NextRequest) {
  // 1. Auth — Authorization 헤더 또는 쿠키에서 세션 확인
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const cookieToken = request.cookies.get('sb-access-token')?.value ?? null
  const accessToken = bearer ?? cookieToken

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase admin client unavailable.' }, { status: 503 })
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  const user = userData?.user
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // 2. 쿼리 파라미터
  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 1), 50)

  try {
    // 44번 라인 주변 코드를 아래와 같이 수정하세요.
    const { data, error } = await supabase.rpc<'match_jobs_to_seeker', {
      p_seeker_id: string;
      p_limit: number;
    }>(
      'match_jobs_to_seeker', 
      {
        p_seeker_id: user.id,
        p_limit: limit,
      }
    )

    if (error) {
      console.error('[seeker/matches] RPC error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 4. 구직자의 희망 조건도 함께 반환
    const { data: preferences } = await supabase
      .from('seeker_preferences')
      .select('*')
      .eq('seeker_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      matches: data ?? [],
      preferences,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[seeker/matches] Failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
