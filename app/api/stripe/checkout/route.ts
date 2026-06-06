import type { Database } from '@/lib/database.types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/checkout
 */
export async function POST(request: NextRequest) {
  try {
    // -------------------------------------------------------------------------
    // 1. Env-var & Secret Key Resolution (모드 선택 섹션)
    // -------------------------------------------------------------------------
    
    // 👉 [A] 실제 운영 모드 (기본 활성화: 환경 변수에서 sk_live 키를 읽어옵니다)
    const secret = process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_API_KEY ?? ''

    // 👉 [B] 로컬/실서버 1달러 강제 테스트 모드 (필요할 때 아래 라인의 주역을 해제하세요)
    // const secret = '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'.trim()


    if (!secret) {
      console.error('[stripe/checkout] STRIPE_SECRET_KEY is not set')
      return NextResponse.json(
        { error: 'Stripe is not configured on this server.' },
        { status: 503 },
      )
    }

    // -------------------------------------------------------------------------
    // 2. Resolve the caller's access token
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
    let supabase: ReturnType<typeof getSupabaseAdmin>
    try {
      supabase = getSupabaseAdmin()
    } catch (err) {
      console.error('🚨 Supabase admin client unavailable.', err)
      return NextResponse.json(
        { error: '서버 내부 권한 설정 오류' },
        { status: 500 },
      )
    }
    if (!supabase) {
      return NextResponse.json(
        { error: '서버 내부 권한 설정 오류' },
        { status: 500 },
      )
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
    const user = userData?.user
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // -------------------------------------------------------------------------
    // 4. Look up the caller's profile
    // -------------------------------------------------------------------------
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
    // 5. Price ID Routing (테스트용 vs 실제용 분기점)
    // -------------------------------------------------------------------------
    let priceId = ''
    let returnTo: string | null = null

    // -------------------------------------------------------------------------
    // 💡 [방법 1] 1달러 라이브 테스트 모드로 진행하고 싶을 때 (현재 활성화)
    // -------------------------------------------------------------------------
    priceId = 'price_1TfRlUDamweJ0Z1TXoXROtxX' // 방금 생성한 1달러 제품 번호

    // -------------------------------------------------------------------------
    // 💡 [방법 2] 실제 유저 결제용 $29 PRO 모드로 배포할 때 
    //            (실제 서비스 출시 시 아래 주석들을 해제하고 위의 방법 1을 주석 처리하세요)
    // -------------------------------------------------------------------------
    /*
    const defaultPriceId =
      process.env.STRIPE_PRICE_ID ??  
      process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ??
      process.env.STRIPE_PRO_PRICE_ID
      
    priceId = defaultPriceId ?? ''
    */

    try {
      const body = (await request.json().catch(() => ({}))) as {
        priceId?: string
        returnTo?: string
      }
      
      // 실제 배포 모드일 때만 프론트엔드가 보낸 유효한 priceId 커스텀 매핑을 허용합니다.
      // (1달러 고정 테스트 모드일 때는 프론트엔드 값에 상관없이 무조건 1달러 플랜 적용)
      if (body.priceId && body.priceId.startsWith('price_') && priceId !== 'price_1TfRlUDamweJ0Z1TXoXROtxX') {
        priceId = body.priceId
      }
      if (typeof body.returnTo === 'string' && body.returnTo.startsWith('/')) {
        returnTo = body.returnTo
      }
    } catch {
      // body 파싱 오류 예방
    }

    // 최종 검증 보호 로직
    if (!priceId || priceId.startsWith('price_dev_fallback')) {
      console.error('[stripe/checkout] Valid Stripe price ID is missing.')
      return NextResponse.json(
        { error: 'Stripe 가격 설정(Price ID)이 누락되었거나 올바르지 않습니다.' },
        { status: 503 },
      )
    }

    // -------------------------------------------------------------------------
    // 6. Initialise Stripe
    // -------------------------------------------------------------------------
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
      const idempotencyKey = `checkout_${user.id}_${Date.now()}`
      
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
      }, { idempotencyKey })

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
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stripe/checkout] Unhandled error:', message)
    return NextResponse.json(
      { error: 'Stripe 세션 생성에 실패했습니다.' },
      { status: 500 },
    )
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function extractAccessToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match) return match[1].trim()
  }

  const legacy = request.cookies.get('sb-access-token')?.value
  if (legacy) return legacy

  const cookies = request.cookies.getAll()
  const sbCookies = cookies
    .filter(c => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  if (sbCookies.length === 0) return null
  const joined = sbCookies.map(c => c.value).join('')

  try {
    const decoded = Buffer.from(joined, 'base64').toString('utf-8')
    const parsed = JSON.parse(decoded) as {
      access_token?: string
      currentSession?: { access_token?: string }
    }
    return parsed.access_token ?? parsed.currentSession?.access_token ?? null
  } catch {
    if (joined.split('.').length === 3) return joined
    return null
  }
}