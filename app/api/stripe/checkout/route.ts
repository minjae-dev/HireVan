import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
 * Body: { priceId?: string }  (defaults to STRIPE_PRICE_ID env var)
 *
 * Auth: requires a valid Supabase session cookie / bearer token.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY
  const defaultPriceId = process.env.STRIPE_PRICE_ID

  if (!secret) {
    console.error('[stripe/checkout] STRIPE_SECRET_KEY is not set')
    return NextResponse.json(
      { error: 'Stripe is not configured on this server.' },
      { status: 503 },
    )
  }

  if (!defaultPriceId) {
    console.error('[stripe/checkout] STRIPE_PRICE_ID is not set')
    return NextResponse.json(
      { error: 'Stripe price ID is not configured.' },
      { status: 503 },
    )
  }

  // 1. Identify the user via Supabase session
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const cookieToken = request.cookies.get('sb-access-token')?.value ?? null
  const accessToken = bearer ?? cookieToken

  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase admin client unavailable.' },
      { status: 503 },
    )
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  const user = userData?.user
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // 2. Look up (or create) the Stripe customer for this user
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, plan, stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'employer') {
    return NextResponse.json(
      { error: 'Only employer accounts can purchase the PRO plan.' },
      { status: 403 },
    )
  }

  // 3. Parse optional priceId from the body
  let priceId = defaultPriceId
  try {
    const body = (await request.json().catch(() => ({}))) as { priceId?: string }
    if (body.priceId && body.priceId.startsWith('price_')) {
      priceId = body.priceId
    }
  } catch {
    // body was empty / unparseable - fall through with default
  }

  // 4. Initialise Stripe
  // The cast is needed because Stripe's bundled API version constant is a
  // private type union; pinning to a known version avoids breaking changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' as any })

  // 5. Build the Checkout Session
  const origin = request.headers.get('origin') ?? new URL(request.url).origin

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
      success_url: `${origin}/profile?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile?upgrade=cancel`,
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
}
