import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Billing Portal session so the customer can manage
 * their subscription (update card, cancel, view invoices). The portal
 * URL is returned and the browser redirects to it.
 *
 * Auth: requires a valid Supabase session token.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) {
    console.error('[stripe/portal] STRIPE_SECRET_KEY is not set')
    return NextResponse.json(
      { error: 'Stripe is not configured on this server.' },
      { status: 503 },
    )
  }

  // Auth
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle() as { data: { stripe_customer_id: string | null } | null }

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No Stripe customer is associated with this account yet.' },
      { status: 404 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' as any })
  const origin = request.headers.get('origin') ?? new URL(request.url).origin

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/profile`,
    })
    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown Stripe error'
    console.error('[stripe/portal] Failed to create portal session:', message)
    return NextResponse.json(
      { error: `Failed to open billing portal: ${message}` },
      { status: 500 },
    )
  }
}
