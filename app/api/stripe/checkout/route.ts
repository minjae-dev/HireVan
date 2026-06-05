import type { Database } from '@/lib/database.types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session in subscription mode for the monthly
 * PRO plan and returns the session URL. The browser will redirect the
 * user to Stripe's hosted checkout page; on success they come back to
 * `/profile?upgrade=success` and the webhook flips `profiles.plan` to 'pro'.
 *
 * Body: { priceId?: string, returnTo?: string }
 *        - priceId defaults to STRIPE_PRICE_ID env var.
 *        - returnTo is reflected back into success_url so the user lands
 *          on the right page after paying.
 *
 * Auth: requires a valid Supabase session — supplied via either
 *   1) `Authorization: Bearer <access_token>` header (recommended), OR
 *   2) `sb-access-token` cookie (legacy), OR
 *   3) any `sb-<ref>-auth-token*` chunked cookie (Supabase SSR default).
 *
 * The route uses the **service role** Supabase client (via
 * `getSupabaseAdmin()`) to verify the user — this is required because
 * `auth.getUser(jwt)` does not work with the anon key on the server.
 * Service role also bypasses RLS for reading the caller's `profiles` row.
 *
 * Error handling
 *   The whole handler is wrapped in a top-level `try { ... } catch` so
 *   that ANY unhandled exception (bad env vars, type errors, Supabase
 *   outages, Stripe API hiccups, JSON.parse failures, etc.) is caught
 *   and surfaced as a clean JSON error response. The server process
 *   must never crash because of a single bad checkout call.
 */
export async function POST(request: NextRequest) {
  try {
    // -------------------------------------------------------------------------
    // 1. Env-var resolution (Stripe secret + price id)
    // -------------------------------------------------------------------------
    const secret =
      process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY ?? ''

    // Accepts the canonical STRIPE_PRICE_ID plus common aliases. In dev we
    // fall back to a sentinel so the UI can still render and the developer
    // sees a clear warning; in production we still 503 to surface the
    // misconfiguration. Stripe will reject the sentinel value anyway, so
    // it can't accidentally create a real session.
    const defaultPriceId =
      process.env.STRIPE_PRICE_ID ??
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ??
      process.env.STRIPE_PRO_PRICE_ID ??
      process.env.STRIPE_PRICE ??
      (process.env.NODE_ENV !== 'production' ? 'price_dev_fallback_set_in_env' : '')

    if (!secret) {
      console.error('[stripe/checkout] STRIPE_SECRET_KEY is not set')
      return NextResponse.json(
        { error: 'Stripe is not configured on this server.' },
        { status: 503 },
      )
    }

    if (!defaultPriceId) {
      console.error(
        '[stripe/checkout] Stripe price ID is not configured. ' +
          'Set STRIPE_PRICE_ID (or NEXT_PUBLIC_STRIPE_PRICE_ID / STRIPE_PRO_PRICE_ID).',
      )
      return NextResponse.json(
        { error: 'Stripe price ID is not configured.' },
        { status: 503 },
      )
    }

    // -------------------------------------------------------------------------
    // 2. Resolve the caller's access token (header → cookie → chunked cookies)
    // -------------------------------------------------------------------------
    const accessToken = extractAccessToken(request)
    if (!accessToken) {
      console.warn('[stripe/checkout] No access token (header or cookie) found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    // -------------------------------------------------------------------------
    // 3. Verify the user via service-role client
    // -------------------------------------------------------------------------
    // `getSupabaseAdmin()` reads SUPABASE_SERVICE_ROLE_KEY (see
    // `lib/supabase-admin.ts`). If the env var is missing or malformed
    // it returns `null`. Rather than crashing the route, we surface a
    // structured 500 with a developer-actionable log line so the on-call
    // engineer knows exactly which key to set.
    let supabase: ReturnType<typeof getSupabaseAdmin>
    try {
      supabase = getSupabaseAdmin()
    } catch (err) {
      console.error(
        '🚨 Supabase admin client unavailable. Check your Service Role Key.',
        err,
      )
      return NextResponse.json(
        { error: '서버 내부 권한 설정 오류' },
        { status: 500 },
      )
    }
    if (!supabase) {
      console.error('🚨 Supabase admin client unavailable. Check your Service Role Key.')
      return NextResponse.json(
        { error: '서버 내부 권한 설정 오류' },
        { status: 500 },
      )
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
    const user = userData?.user
    if (userErr || !user) {
      console.warn(
        '[stripe/checkout] Invalid session:',
        userErr?.message ?? 'no user',
      )
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // -------------------------------------------------------------------------
    // 4. Look up the caller's profile (service role bypasses RLS)
    // -------------------------------------------------------------------------
    // The type assertion keeps the strict Supabase generic inference happy
    // (the v2 client sometimes narrows `data` to `never` when the select
    // string is non-empty) and gives us a precise shape for the rest of
    // the function.
    type ProfileRow = Pick<
      Database['public']['Tables']['profiles']['Row'],
      'id' | 'role' | 'plan' | 'stripe_customer_id'
    >
    const { data: profileRaw, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, plan, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr) {
      console.error('[stripe/checkout] Profile lookup failed:', profileErr.message)
      return NextResponse.json(
        { error: 'Failed to load profile.' },
        { status: 500 },
      )
    }
    const profile = (profileRaw ?? null) as ProfileRow | null
    if (!profile || profile.role !== 'employer') {
      return NextResponse.json(
        { error: 'Only employer accounts can purchase the PRO plan.' },
        { status: 403 },
      )
    }

    // -------------------------------------------------------------------------
    // 5. Parse optional priceId and returnTo from the body
    // -------------------------------------------------------------------------
    let priceId = process.env.STRIPE_PRO_PRICE_ID || 'price_dev_fallback_set_in_env';
    let returnTo: string | null = null
    try {
      const body = (await request.json().catch(() => ({}))) as {
        priceId?: string
        returnTo?: string
      }
      if (body.priceId && body.priceId.startsWith('price_')) {
        priceId = body.priceId
      }
      if (typeof body.returnTo === 'string' && body.returnTo.startsWith('/')) {
        returnTo = body.returnTo
      }
    } catch {
      // body was empty / unparseable - fall through with defaults
    }

    // -------------------------------------------------------------------------
    // 6. Initialise Stripe
    // -------------------------------------------------------------------------
    // The cast is needed because Stripe's bundled API version constant is a
    // private type union; pinning to a known version avoids breaking changes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' as any })

    // -------------------------------------------------------------------------
    // 7. Build the Checkout Session
    // -------------------------------------------------------------------------
    const origin = request.headers.get('origin') ?? new URL(request.url).origin
    const basePath = returnTo ?? '/profile'
    const successUrl = `${origin}${basePath}?upgrade=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${origin}${basePath}?upgrade=cancel`

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        customer: profile.stripe_customer_id ?? undefined,
        customer_email: profile.stripe_customer_id ? undefined : (user.email ?? undefined),
        client_reference_id: user.id,
        metadata: {
          userId: user.id,
        },
        subscription_data: {
          metadata: {
            userId: user.id,
          },
        },
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
      })

      return NextResponse.json({ url: session.url, sessionId: session.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Stripe error'
      console.error('[stripe/checkout] Failed to create session:', message)
      return NextResponse.json(
        { error: `Failed to create checkout session: ${message}` },
        { status: 500 },
      )
    }
  } catch (err) {
    // -----------------------------------------------------------------------
    // OUTER GUARD — catch ANY unhandled error so the route handler never
    // throws. Surfacing a clean 500 prevents the Next.js dev overlay from
    // showing up and gives the frontend a structured payload.
    // -----------------------------------------------------------------------
    const message = err instanceof Error ? err.message : 'Unknown error'
    const stack = err instanceof Error ? err.stack : undefined
    console.error('[stripe/checkout] Unhandled error:', message, stack)
    return NextResponse.json(
      { error: 'Stripe 세션 생성에 실패했습니다.' },
      { status: 500 },
    )
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Pulls the caller's Supabase access token from the request. Order of
 * preference:
 *   1) `Authorization: Bearer <token>` header (set by the client)
 *   2) `sb-access-token` cookie (legacy single-cookie format)
 *   3) `sb-<ref>-auth-token` cookie (single chunk, base64-encoded JSON)
 *   4) `sb-<ref>-auth-token.0`, `.1`, … chunked cookies
 */
function extractAccessToken(request: NextRequest): string | null {
  // 1) Authorization header — case-insensitive "Bearer" prefix
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match) return match[1].trim()
  }

  // 2) Legacy single cookie name
  const legacy = request.cookies.get('sb-access-token')?.value
  if (legacy) return legacy

  // 3 & 4) Supabase chunked cookies: `sb-<ref>-auth-token` (single) and
  // `sb-<ref>-auth-token.0`, `.1`, … (chunked when the JWT is large).
  const cookies = request.cookies.getAll()
  const sbCookies = cookies
    .filter(c => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  if (sbCookies.length === 0) return null

  // Supabase stores the session as `base64(JSON.stringify({...}))`. The
  // chunked form is a list of base64 chunks that need to be concatenated
  // in numeric order. For the single-cookie form there is just one entry.
  const joined = sbCookies.map(c => c.value).join('')

  try {
    const decoded = Buffer.from(joined, 'base64').toString('utf-8')
    const parsed = JSON.parse(decoded) as {
      access_token?: string
      currentSession?: { access_token?: string }
    }
    return parsed.access_token ?? parsed.currentSession?.access_token ?? null
  } catch {
    // Maybe the cookie value is the raw JWT — try it directly.
    if (joined.split('.').length === 3) return joined
    return null
  }
}
