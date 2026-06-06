import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

// The Stripe webhook updates columns not in database.types.ts (stripe_customer_id, etc.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/stripe/webhook
 *
 * Stripe → HireVan 구독 상태 동기화 엔드포인트.
 *
 * ## 처리 이벤트
 * - `checkout.session.completed`            : 첫 결제 성공 → PRO 활성화
 * - `invoice.payment_succeeded`            : 갱신 결제 성공 → PRO 유지/복구
 * - `invoice.payment_failed`               : 결제 실패 → 3일 유예기간 시작
 * - `customer.subscription.updated`        : 상태 변화 동기화 (past_due, canceled 등)
 * - `customer.subscription.deleted`        : 구독 취소 확정 → FREE 다운그레이드
 *
 * ## 유예기간(Grace Period) 정책
 * - 결제 실패 시 즉시 차단하지 않고 `grace_period_ends_at = now() + 3 days` 설정
 * - 3일 안에 결제가 복구되면 유예기간 해제 + PRO 유지
 * - 3일 후에도 복구 안 되면 `expire_grace_periods()` RPC로 자동 다운그레이드
 *
 * ## 멱등성
 * - Stripe는 같은 이벤트를 여러 번 보낼 수 있음
 * - 모든 handler는 마지막 상태를 기준으로 UPDATE 하므로 중복 처리되어도 안전
 *
 * ## 보안
 * - 인증 없음 (Stripe 서명 검증에만 의존)
 * - 환경변수 누락 시 503
 *
 * ## 디버깅
 *  이 핸들러는 시작부터 끝까지 모든 단계를 `console.log/error` 로 추적한다.
 *  로컬 개발 시 `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 *  터미널과 Next.js dev server 터미널을 동시에 보면 어디서 멈췄는지 즉시 확인 가능.
 */

// ────────────────────────────────────────────────────────────────────────
// 진단 로그 헬퍼 — 항상 prefix 를 붙여서 grep 으로 빠르게 찾을 수 있다.
// ────────────────────────────────────────────────────────────────────────
function dlog(...args: unknown[]) {
   
  console.log('[stripe/webhook]', ...args)
}
function derr(...args: unknown[]) {
   
  console.error('[stripe/webhook]', ...args)
}

// ────────────────────────────────────────────────────────────────────────
// 환경변수 진단 (요청 시점 1회) — 어떤 키가 비어있는지 즉시 알 수 있다.
// ────────────────────────────────────────────────────────────────────────
function diagnoseEnv() {
  dlog('──────── ENV DIAGNOSIS ────────')
  dlog('STRIPE_SECRET_KEY      :', process.env.STRIPE_SECRET_KEY ? `set (len=${process.env.STRIPE_SECRET_KEY.length})` : '❌ MISSING')
  dlog('STRIPE_WEBHOOK_SECRET  :', process.env.STRIPE_WEBHOOK_SECRET ? `set (len=${process.env.STRIPE_WEBHOOK_SECRET.length})` : '❌ MISSING')
  dlog('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : '❌ MISSING')
  dlog('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? `set (len=${process.env.SUPABASE_SERVICE_ROLE_KEY.length})` : '❌ MISSING')
  dlog('SUPABASE_SECRET_KEY (alias):', process.env.SUPABASE_SECRET_KEY ? `set (len=${process.env.SUPABASE_SECRET_KEY.length})` : 'not set (ok if SERVICE_ROLE_KEY is set)')
  dlog('───────────────────────────────')
}

export async function POST(request: NextRequest) {
  dlog('🔔 Stripe Webhook Received: method=POST, url=', request.url)
  dlog('   - content-type:', request.headers.get('content-type'))
  dlog('   - stripe-signature header present:', !!request.headers.get('stripe-signature'))

  diagnoseEnv()

  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    derr('❌ STRIPE_SECRET_KEY is not set — returning 503')
    return NextResponse.json(
      { error: 'Stripe secret key is not configured.' },
      { status: 503 },
    )
  }

  if (!webhookSecret) {
    derr('❌ STRIPE_WEBHOOK_SECRET is not set — returning 503')
    derr('   👉 If you are running `stripe listen`, copy the printed whsec_... into .env.local')
    derr('   👉 Then restart `next dev` so the new env var is picked up')
    return NextResponse.json(
      { error: 'Stripe webhook secret is not configured.' },
      { status: 503 },
    )
  }

  // 1. RAW body (서명 검증용)
  const rawBody = await request.text()
  dlog(`   - raw body length: ${rawBody.length} bytes`)

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    derr('❌ Missing Stripe-Signature header — returning 400')
    derr('   👉 보통 `stripe listen` 이 실행 중이 아닐 때 발생. `stripe listen --forward-to localhost:3000/api/stripe/webhook` 을 실행하세요.')
    return NextResponse.json(
      { error: 'Missing Stripe-Signature header' },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(secret, { apiVersion: '2024-12-18.acacia' as any })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
    dlog(`✅ Signature verified. Event id=${event.id}, type=${event.type}, created=${new Date(event.created * 1000).toISOString()}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    derr('❌ Signature verification failed:', message)
    derr('   👉 STRIPE_WEBHOOK_SECRET in .env.local does NOT match the whsec_... printed by `stripe listen`')
    derr('   👉 Fix: copy the new whsec_... from `stripe listen` output → .env.local → restart `next dev`')
    return NextResponse.json(
      { error: `Webhook signature error: ${message}` },
      { status: 400 },
    )
  }

  const supabaseRaw = getSupabaseAdmin()
  if (!supabaseRaw) {
    derr('❌ Supabase admin client unavailable — SUPABASE_SERVICE_ROLE_KEY missing or invalid')
    return NextResponse.json(
      { error: 'Supabase admin client unavailable.' },
      { status: 503 },
    )
  }
  const supabase = supabaseRaw as AnySupabase
  dlog('✅ Supabase admin client ready (service_role key OK)')

  // 2. 디스패치
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        dlog('→ Dispatch: handleCheckoutCompleted')
        await handleCheckoutCompleted(supabase, stripe, event.data.object as Stripe.Checkout.Session, event.id)
        break

      case 'invoice.payment_succeeded':
        dlog('→ Dispatch: handleInvoicePaymentSucceeded')
        await handleInvoicePaymentSucceeded(supabase, event.data.object as Stripe.Invoice, event.id)
        break

      case 'invoice.payment_failed':
        dlog('→ Dispatch: handleInvoicePaymentFailed')
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice, event.id)
        break

      case 'customer.subscription.updated':
        dlog('→ Dispatch: handleSubscriptionUpdated')
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription, event.id)
        break

      case 'customer.subscription.deleted':
        dlog('→ Dispatch: handleSubscriptionDeleted')
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription, event.id)
        break

      default:
        dlog(`⏭  Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const stack = err instanceof Error ? err.stack : undefined
    derr(`❌ Handler failed for ${event.type} (event.id=${event.id}):`, message)
    if (stack) derr('   Stack:', stack)
    derr('   👉 Stripe will retry delivery because we return 500 below.')
    return NextResponse.json({ error: message }, { status: 500 })
  }

  dlog(`✅ Webhook processed successfully: ${event.type} (event.id=${event.id})`)
  return NextResponse.json({ received: true })
}

// ────────────────────────────────────────────────────────────────────────
// Event handlers
// ────────────────────────────────────────────────────────────────────────

/**
 * Checkout 완료 → PRO 활성화 + customer / subscription ID 저장
 */
async function handleCheckoutCompleted(
  supabase: AnySupabase,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  eventId: string,
) {
  dlog(`[handleCheckoutCompleted] event.id=${eventId}`)
  dlog(`   - session.id=${session.id}`)
  dlog(`   - session.metadata=${JSON.stringify(session.metadata)}`)
  dlog(`   - session.client_reference_id=${session.client_reference_id ?? 'null'}`)

  const userId =
    session.metadata?.userId ??
    session.client_reference_id ??
    null

  if (!userId) {
    derr(`[handleCheckoutCompleted] ❌ No userId in metadata or client_reference_id — CANNOT update profile.`)
    derr(`   session.metadata=${JSON.stringify(session.metadata)}`)
    derr(`   session.client_reference_id=${session.client_reference_id}`)
    derr(`   👉 Fix: /api/stripe/checkout 이 metadata.userId 를 설정하는지 확인하세요.`)
    return
  }
  dlog(`   - target userId=${userId}`)

  let customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null

  dlog(`   - stripe customerId=${customerId ?? 'null'}, subscriptionId=${subscriptionId ?? 'null'}`)

  if (subscriptionId && !customerId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      dlog(`   - resolved customerId from subscription: ${customerId}`)
    } catch (err) {
      derr('[handleCheckoutCompleted] Failed to retrieve subscription for customer lookup:', err)
    }
  }

  let subscriptionEndsAt: string | null = null
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cpe = (sub as any).current_period_end
      if (typeof cpe === 'number') {
        subscriptionEndsAt = new Date(cpe * 1000).toISOString()
        dlog(`   - subscription_ends_at=${subscriptionEndsAt}`)
      }
    } catch (err) {
      derr('[handleCheckoutCompleted] Could not fetch current_period_end:', err)
    }
  }

  dlog(`[handleCheckoutCompleted] → UPDATE profiles WHERE id=${userId} SET plan='pro' pro_subscriber=true ...`)
  const { data, error, count } = await supabase
    .from('profiles')
    .update({
      plan: 'pro',
      pro_subscriber: true,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_ends_at: subscriptionEndsAt,
      cancel_at_period_end: false,
      grace_period_active: false,
      grace_period_ends_at: null,
      last_payment_failed_at: null,
    })
    .eq('id', userId)
    .select('id, plan, pro_subscriber')

  if (error) {
    derr(`[handleCheckoutCompleted] ❌ UPDATE failed for userId=${userId}: ${error.message}`)
    derr(`   code=${error.code}, details=${error.details}, hint=${error.hint}`)
    throw new Error(`Failed to upgrade profile ${userId}: ${error.message}`)
  }

  const updatedRows = Array.isArray(data) ? data.length : (data ? 1 : 0)
  dlog(`[handleCheckoutCompleted] ✅ UPDATE returned. error=${error}, data rows=${updatedRows}, count=${count}`)
  if (updatedRows === 0) {
    derr(`[handleCheckoutCompleted] ⚠️  UPDATE matched 0 rows for userId=${userId}`)
    derr(`   - 이 userId 가 profiles 테이블에 존재하지 않을 수 있음.`)
    derr(`   - 또는 RLS 가 service_role 을 막고 있을 수 있음. (service_role 은 RLS 우회해야 정상)`)
    derr(`   - 확인: SELECT id, role, plan, pro_subscriber FROM profiles WHERE id='${userId}'`)
  } else if (data && Array.isArray(data) && data[0]) {
    dlog(`   - profile state after update:`, JSON.stringify(data[0]))
  }

  try {
    await pushNotification(supabase, userId, {
      type: 'subscription_recovered',
      title: '🎉 HireVan PRO 플랜이 활성화되었어요!',
      body: '이제 모든 구직자의 상세 프로필을 무제한으로 열람할 수 있어요.',
      link: '/profile',
      metadata: { subscription_id: subscriptionId },
    })
  } catch (notifErr) {
    derr(`[handleCheckoutCompleted] notification insert failed (non-fatal):`, notifErr)
  }

  dlog(`[handleCheckoutCompleted] ✅ Upgraded ${userId} to PRO (sub=${subscriptionId})`)
}

/**
 * 갱신 결제 성공 → PRO 유지, 유예기간 해제
 */
async function handleInvoicePaymentSucceeded(
  supabase: AnySupabase,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  dlog(`[handleInvoicePaymentSucceeded] event.id=${eventId}, invoice.id=${invoice.id}`)

  const subscriptionId = typeof (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription === 'string'
    ? (invoice as unknown as { subscription: string }).subscription
    : (invoice as unknown as { subscription?: { id: string } }).subscription?.id ?? null

  if (!subscriptionId) {
    derr('[handleInvoicePaymentSucceeded] ⚠️  no subscription ref — skipping')
    return
  }
  dlog(`   - subscriptionId=${subscriptionId}`)

  const userId = await resolveUserId(supabase, subscriptionId)
  if (!userId) {
    derr(`[handleInvoicePaymentSucceeded] ⚠️  no matching user for subscription=${subscriptionId}`)
    return
  }
  dlog(`   - target userId=${userId}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodEnd = (invoice as any).period_end
  const subscriptionEndsAt = typeof periodEnd === 'number'
    ? new Date(periodEnd * 1000).toISOString()
    : null

  const { data, error } = await supabase
    .from('profiles')
    .update({
      plan: 'pro',
      pro_subscriber: true,
      cancel_at_period_end: false,
      grace_period_active: false,
      grace_period_ends_at: null,
      last_payment_failed_at: null,
      subscription_ends_at: subscriptionEndsAt,
      stripe_subscription_id: subscriptionId,
    })
    .eq('id', userId)
    .select('id, plan')

  if (error) {
    derr(`[handleInvoicePaymentSucceeded] ❌ UPDATE failed: ${error.message}`)
    throw new Error(`Failed to recover subscription for ${userId}: ${error.message}`)
  }
  const updatedRows = Array.isArray(data) ? data.length : (data ? 1 : 0)
  dlog(`[handleInvoicePaymentSucceeded] ✅ UPDATE returned. rows=${updatedRows}`)
  if (updatedRows === 0) {
    derr(`[handleInvoicePaymentSucceeded] ⚠️  0 rows updated for userId=${userId}`)
  }

  try {
    await pushNotification(supabase, userId, {
      type: 'subscription_recovered',
      title: '✅ 결제가 성공적으로 완료되었어요',
      body: 'PRO 플랜이 정상적으로 유지됩니다. 감사합니다!',
      link: '/profile',
      metadata: { invoice_id: invoice.id, subscription_id: subscriptionId },
    })
  } catch (notifErr) {
    derr('[handleInvoicePaymentSucceeded] notification failed (non-fatal):', notifErr)
  }

  dlog(`[handleInvoicePaymentSucceeded] ✅ PRO recovered for ${userId}`)
}

/**
 * 결제 실패 → 3일 유예기간 시작 (즉시 차단 X)
 */
async function handleInvoicePaymentFailed(
  supabase: AnySupabase,
  invoice: Stripe.Invoice,
  eventId: string,
) {
  dlog(`[handleInvoicePaymentFailed] event.id=${eventId}, invoice.id=${invoice.id}`)

  const subscriptionId = typeof (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription === 'string'
    ? (invoice as unknown as { subscription: string }).subscription
    : (invoice as unknown as { subscription?: { id: string } }).subscription?.id ?? null

  if (!subscriptionId) {
    derr('[handleInvoicePaymentFailed] ⚠️  no subscription ref — skipping')
    return
  }

  const userId = await resolveUserId(supabase, subscriptionId)
  if (!userId) {
    derr(`[handleInvoicePaymentFailed] ⚠️  no matching user for subscription=${subscriptionId}`)
    return
  }
  dlog(`   - target userId=${userId}`)

  const now = new Date()
  const gracePeriodEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) // +3일

  const { data, error } = await supabase
    .from('profiles')
    .update({
      // plan은 그대로 'pro' 유지 (유예기간 동안)
      grace_period_active: true,
      grace_period_ends_at: gracePeriodEndsAt.toISOString(),
      last_payment_failed_at: now.toISOString(),
    })
    .eq('id', userId)
    .select('id')

  if (error) {
    derr(`[handleInvoicePaymentFailed] ❌ UPDATE failed: ${error.message}`)
    throw new Error(`Failed to start grace period for ${userId}: ${error.message}`)
  }
  const updatedRows = Array.isArray(data) ? data.length : (data ? 1 : 0)
  dlog(`[handleInvoicePaymentFailed] ✅ UPDATE returned. rows=${updatedRows}`)

  try {
    await pushNotification(supabase, userId, {
      type: 'payment_failed',
      title: '⚠️ 다음 결제에 실패했어요',
      body: `3일 이내에 결제가 복구되지 않으면 PRO 혜택이 종료됩니다. (${gracePeriodEndsAt.toLocaleDateString('ko-KR')}까지)`,
      link: '/profile',
      metadata: {
        invoice_id: invoice.id,
        subscription_id: subscriptionId,
        grace_period_ends_at: gracePeriodEndsAt.toISOString(),
      },
    })
  } catch (notifErr) {
    derr('[handleInvoicePaymentFailed] notification failed (non-fatal):', notifErr)
  }

  dlog(`[handleInvoicePaymentFailed] ⏰ Grace period started for ${userId} (ends ${gracePeriodEndsAt.toISOString()})`)
}
async function handleSubscriptionUpdated(
  supabase: AnySupabase,
  subscription: Stripe.Subscription,
  eventId: string,
) {
  dlog(`[handleSubscriptionUpdated] event.id=${eventId}, sub.id=${subscription.id}, status=${subscription.status}`)

  const userId = await resolveUserId(supabase, subscription)
  if (!userId) {
    derr(`[handleSubscriptionUpdated] ⚠️  no matching user for sub=${subscription.id}`)
    return
  }
  dlog(`   - target userId=${userId}`)

  // 1. Stripe의 current_period_end(초 단위)를 안전하게 ISO String 날짜로 변환
  // 💡 취소 신청 유무와 상관없이 이 날짜는 이번 결제 주기의 종료일(즉, 취소 시 만료일)이 됩니다.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cpe = (subscription as any).current_period_end
  const subscriptionEndsAt = typeof cpe === 'number'
    ? new Date(cpe * 1000).toISOString()
    : null

  // 2. 구독 취소 예약 상태(cancel_at_period_end) 확인
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cancelAtPeriodEnd = (subscription as any).cancel_at_period_end ?? false

  const activeStatuses: Stripe.Subscription.Status[] = ['active', 'trialing']

  if (activeStatuses.includes(subscription.status)) {
    // 💡 정석 비즈니스 로직 고정:
    // 취소가 예약(`cancel_at_period_end: true`)되었더라도, status가 'active'인 동안에는 
    // 유저의 플랜은 무조건 'pro'이고 pro_subscriber도 true여야 합니다!
    const currentPlan = 'pro'
    const isProSubscriber = true

    dlog(`[handleSubscriptionUpdated] 🔄 Processing active status. cancel_at_period_end=${cancelAtPeriodEnd}, plan=${currentPlan}, ends_at=${subscriptionEndsAt}`)

    const { data, error } = await supabase
      .from('profiles')
      .update({
        plan: currentPlan,
        pro_subscriber: isProSubscriber,
        stripe_subscription_id: subscription.id,
        subscription_ends_at: subscriptionEndsAt, // 👈 프론트에서 만료 안내용/결제일 안내용으로 쓸 날짜
        cancel_at_period_end: cancelAtPeriodEnd,   // 👈 프론트에서 '해지 예약 배너' 분기용 플래그
        grace_period_active: false,
        grace_period_ends_at: null,
        last_payment_failed_at: null,
      })
      .eq('id', userId)
      .select('id')

    if (error) {
      derr(`[handleSubscriptionUpdated] ❌ UPDATE failed: ${error.message}`)
      throw new Error(`Failed to sync active sub for ${userId}: ${error.message}`)
    }
    
    const updatedRows = Array.isArray(data) ? data.length : (data ? 1 : 0)
    dlog(`[handleSubscriptionUpdated] ✅ rows=${updatedRows} (status=${subscription.status}, plan=${currentPlan}, cancel_at_period_end=${cancelAtPeriodEnd})`)
  } else {
    dlog(`[handleSubscriptionUpdated] ⏭  no-op for status=${subscription.status} (awaiting invoice.* events)`)
  }
}
/**
 * 구독 취소 확정 (구독이 완전히 종료된 상태)
 * → 즉시 FREE 다운그레이드
 */
async function handleSubscriptionDeleted(
  supabase: AnySupabase,
  subscription: Stripe.Subscription,
  eventId: string,
) {
  dlog(`[handleSubscriptionDeleted] event.id=${eventId}, sub.id=${subscription.id}`)

  const userId = await resolveUserId(supabase, subscription)
  if (!userId) {
    derr(`[handleSubscriptionDeleted] ⚠️  no matching user for sub=${subscription.id}`)
    return
  }
  dlog(`   - target userId=${userId}`)

  const { data, error } = await supabase
    .from('profiles')
    .update({
      plan: 'free',
      pro_subscriber: false,
      grace_period_active: false,
      grace_period_ends_at: null,
      stripe_subscription_id: null,
      subscription_ends_at: null,
    })
    .eq('id', userId)
    .select('id')

  if (error) {
    derr(`[handleSubscriptionDeleted] ❌ UPDATE failed: ${error.message}`)
    throw new Error(`Failed to downgrade ${userId}: ${error.message}`)
  }
  const updatedRows = Array.isArray(data) ? data.length : (data ? 1 : 0)
  dlog(`[handleSubscriptionDeleted] ✅ rows=${updatedRows}`)

  try {
    await pushNotification(supabase, userId, {
      type: 'subscription_canceled',
      title: '구독이 종료되었습니다',
      body: 'HireVan PRO 플랜이 종료되어 FREE 플랜으로 전환되었습니다. 언제든 다시 구독할 수 있어요.',
      link: '/profile',
      metadata: { subscription_id: subscription.id },
    })
  } catch (notifErr) {
    derr('[handleSubscriptionDeleted] notification failed (non-fatal):', notifErr)
  }

  dlog(`[handleSubscriptionDeleted] ⬇️  Downgraded ${userId} to FREE`)
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * subscription → userId 매핑
 * 1) subscription.metadata.userId
 * 2) profiles.stripe_customer_id = subscription.customer
 * 3) profiles.stripe_subscription_id = subscription.id (fallback)
 */
async function resolveUserId(
  supabase: AnySupabase,
  subscriptionOrId: Stripe.Subscription | string,
): Promise<string | null> {
  let metadata: Stripe.Metadata | null = null
  let customerId: string | null = null

  if (typeof subscriptionOrId === 'string') {
    const { data: sub } = await supabase
      .from('profiles')
      .select('id, stripe_customer_id')
      .eq('stripe_subscription_id', subscriptionOrId)
      .maybeSingle()
    if (sub?.id) return sub.id
    dlog(`[resolveUserId] no profile found with stripe_subscription_id=${subscriptionOrId}`)
    return null
  }

  metadata = subscriptionOrId.metadata
  customerId = typeof subscriptionOrId.customer === 'string'
    ? subscriptionOrId.customer
    : subscriptionOrId.customer.id

  if (metadata?.userId) {
    dlog(`[resolveUserId] using metadata.userId=${metadata.userId}`)
    return metadata.userId
  }

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (data?.id) {
    dlog(`[resolveUserId] found profile via stripe_customer_id=${customerId} → id=${data.id}`)
    return data.id
  }

  // 3rd fallback: try subscription.id
  const { data: subById } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_subscription_id', subscriptionOrId.id)
    .maybeSingle()
  if (subById?.id) {
    dlog(`[resolveUserId] found profile via stripe_subscription_id=${subscriptionOrId.id} → id=${subById.id}`)
    return subById.id
  }

  derr(`[resolveUserId] ❌ could not resolve userId. customerId=${customerId}, sub.id=${subscriptionOrId.id}`)
  return null
}

/**
 * notification row 삽입 (service role)
 */
async function pushNotification(
  supabase: AnySupabase,
  userId: string,
  payload: {
    type: string
    title: string
    body: string
    link: string
    metadata: Record<string, unknown>
  },
) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      link: payload.link,
      metadata: payload.metadata,
    })

  if (error) {
    derr(`[pushNotification] failed for ${userId}: ${error.message}`)
    // 알림 삽입 실패는 throw 하지 않음 — 비즈니스 로직에 영향 X
  } else {
    dlog(`[pushNotification] ✅ notification inserted for ${userId} (type=${payload.type})`)
  }
}
