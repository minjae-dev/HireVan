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
 */
let _adminClient: SupabaseClient<Database> | null = null

export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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
