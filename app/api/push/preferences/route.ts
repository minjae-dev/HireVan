import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Supabase generated types 의 row 와 호환되는 화이트리스트 키
type DatabasePref = Database['public']['Tables']['notification_prefs']['Row']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

async function authenticate(
  request: NextRequest,
  supabase: AnySupabase,
): Promise<{ user: { id: string } | null; error: NextResponse | null }> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return { user: null, error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) }
  }
  const token = auth.slice('Bearer '.length)
  const { data: userRes, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userRes?.user) {
    return { user: null, error: NextResponse.json({ error: 'invalid_token' }, { status: 401 }) }
  }
  return { user: userRes.user, error: null }
}

/**
 * GET  /api/push/preferences
 *   → notification_prefs row (없으면 null) + 기본값
 *   Response 200: { raw: PrefsRow | null, defaults: { ... } }
 *
 * PATCH /api/push/preferences
 *   body: Partial<{ chat_room_created, chat_new_message, push_enabled,
 *                  email_enabled, quiet_hours_start, quiet_hours_end }>
 *   Response 200: { ok: true, raw: PrefsRow }
 *
 * ## 권한
 *   - Bearer 본인 user_id 기준. service role Bypass 없음.
 */
export async function GET(request: NextRequest) {
  const supabase = requireSupabaseAdmin()
  const { user, error: authErr } = await authenticate(request, supabase)
  if (authErr || !user) return authErr!

  const { data: pref } = await supabase
    .from('notification_prefs')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json(
    {
      raw: (pref as DatabasePref | null) ?? null,
      defaults: {
        chat_room_created: true,
        chat_new_message: true,
        push_enabled: true,
        email_enabled: true,
      },
    },
    { status: 200 },
  )
}

export async function PATCH(request: NextRequest) {
  const supabase = requireSupabaseAdmin()
  const { user, error: authErr } = await authenticate(request, supabase)
  if (authErr || !user) return authErr!

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  // 화이트리스트 필드만 통과
  const allowed: (keyof DatabasePref)[] = [
    'chat_room_created',
    'chat_new_message',
    'push_enabled',
    'email_enabled',
    'quiet_hours_start',
    'quiet_hours_end',
  ]
  const update: Record<string, unknown> = { user_id: user.id }
  for (const k of allowed) {
    if (k in body) update[k] = body[k as string]
  }
  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: 'no_allowed_fields' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('notification_prefs') as any)
    .upsert(update, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'prefs_update_failed', detail: error?.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, raw: data as DatabasePref }, { status: 200 })
}
