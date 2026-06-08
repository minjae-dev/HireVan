import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/push/register
 *
 * 디바이스의 FCM/APNs 토큰을 서버에 등록 (또는 갱신).
 *
 * Request:
 *   { token: string, platform: 'web'|'ios'|'android', device_label?: string }
 *
 * Response 200:
 *   { ok: true, id: string }
 *
 * ## 동작
 *  1) Bearer 토큰 검증 → user_id
 *  2) push_tokens 에 (user_id, token) 으로 upsert.
 *     - 동일 토큰이 다른 user 에게 등록되어 있었다면 본인으로 소유권 이전.
 *       (다중 디바이스 로그인/디바이스 변경 케이스 대비)
 *  3) is_active=true, last_seen_at=now() 로 갱신.
 *  4) notification_prefs 도 기본 row 가 없으면 insert (push_enabled=true).
 */
export async function POST(request: NextRequest) {
  const supabase = requireSupabaseAdmin()

  // 1) 인증
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tokenStr = auth.slice('Bearer '.length)
  const { data: userRes, error: authErr } = await supabase.auth.getUser(tokenStr)
  if (authErr || !userRes?.user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  const userId = userRes.user.id

  // 2) 입력 파싱
  let body: { token?: string; platform?: 'web' | 'ios' | 'android'; device_label?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const { token, platform, device_label } = body
  if (!token || !platform) {
    return NextResponse.json(
      { error: 'token and platform are required' },
      { status: 400 },
    )
  }
  if (!['web', 'ios', 'android'].includes(platform)) {
    return NextResponse.json({ error: 'invalid_platform' }, { status: 400 })
  }

  // 3) (token) 기준 upsert. 충돌 시 user_id 도 본인 것으로 갱신.
  //    onConflict 'token' 으로 설정 (token 컬럼에 unique 제약)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        token,
        user_id: userId,
        platform,
        device_label: device_label ?? null,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      } as any,
      { onConflict: 'token' },
    )
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'token_register_failed', detail: error?.message },
      { status: 500 },
    )
  }

  // 4) notification_prefs 기본 row 보장
  const prefClient = supabase.from('notification_prefs') as unknown as {
    upsert: (
      row: { user_id: string },
      opts: { onConflict: string; ignoreDuplicates: boolean },
    ) => Promise<{ error: { message: string } | null }>
  }
  await prefClient.upsert(
    { user_id: userId },
    { onConflict: 'user_id', ignoreDuplicates: true },
  )

  return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 200 })
}

/**
 * DELETE /api/push/register
 * 로그아웃 시 디바이스 토큰 비활성화.
 * body: { token: string }
 */
export async function DELETE(request: NextRequest) {
  const supabase = requireSupabaseAdmin()

  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const tokenStr = auth.slice('Bearer '.length)
  const { data: userRes, error: authErr } = await supabase.auth.getUser(tokenStr)
  if (authErr || !userRes?.user) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 })
  }
  const userId = userRes.user.id

  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  if (!body.token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  await supabase
    .from('push_tokens')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('token', body.token)

  return NextResponse.json({ ok: true }, { status: 200 })
}
