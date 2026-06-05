import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * **Use this only from server-side code** (Next.js Route Handlers, Server
 * Components, Server Actions). Never import it from a client component, and
 * never expose the `SUPABASE_SERVICE_ROLE_KEY` to the browser — the key
 * grants full read/write access to every table.
 *
 * The Stripe webhook handler is the primary consumer: it needs to UPDATE
 * `profiles.plan` for any user without being limited by the row owner's
 * `auth.uid()` RLS predicate.
 *
 * ## Environment variables (must be set)
 *   - `NEXT_PUBLIC_SUPABASE_URL`    — the project URL
 *   - `SUPABASE_SERVICE_ROLE_KEY`   — the **server-only** service role JWT
 *
 * The canonical name is `SUPABASE_SERVICE_ROLE_KEY`. As a defensive fallback
 * we also accept `SUPABASE_SECRET_KEY` (some templates use that name), but
 * the *primary* lookup is the standard one. Add a log line on every miss
 * so the on-call engineer can tell at a glance which key is missing.
 */
let _adminClient: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  // -------------------------------------------------------------------------
  // 1) Env-var resolution
  // -------------------------------------------------------------------------
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Primary canonical name. Accept the common alias as a defensive fallback
  // so mis-named `.env.local` files still work in development.
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

  // -------------------------------------------------------------------------
  // 2) Debug log guards (intentionally noisy — runs only on server, only
  //    on first miss per request, and never logs the value itself).
  // -------------------------------------------------------------------------
  if (!url) {
    console.error(
      '🚨 디버깅 에러: 백엔드에서 NEXT_PUBLIC_SUPABASE_URL를 읽지 못했습니다. .env.local 설정을 확인하세요.',
    )
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '🚨 디버깅 에러: 백엔드에서 SUPABASE_SERVICE_ROLE_KEY를 읽지 못했습니다. .env.local 설정을 확인하세요.',
    )
  }
  if (!serviceKey) {
    console.error(
      '🚨 디버깅 에러: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY 모두 비어 있습니다. .env.local 설정을 확인하세요.',
    )
  }

  if (!url || !serviceKey) {
    return null
  }

  if (!_adminClient) {
    _adminClient = createClient<Database>(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  }
  return _adminClient
}

/**
 * Throws a descriptive error if the service-role env vars are missing.
 * Use this inside route handlers that absolutely require admin access.
 */
export function requireSupabaseAdmin(): SupabaseClient<Database> {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error(
      'Supabase service-role client unavailable. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.',
    )
  }
  return client
}
