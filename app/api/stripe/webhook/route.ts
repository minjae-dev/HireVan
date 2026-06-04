import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!secret) {
    console.error('[stripe/webhook] STRIPE_SECRET_KEY is not set')
    return NextResponse.json(
      { error: 'Stripe secret key is not configured.' },
      { status: 503 },
    )
  }

  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json(
      { error: 'Stripe webhook secret is not configured.' },
      { status: 503 },
    )
  }

  // 1. RAW body (서명 검증용)
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    console.error('[stripe/webhook] Signature verification failed:', message)
    return NextResponse.json(
      { error: `Webhook signature error: ${message}` },
      { status: 400 },
    )
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    console.error('[stripe/webhook] Supabase admin client unavailable')
    return NextResponse.json(
      { error: 'Supabase admin client unavailable.' },
      { status: 503 },
    )
  }

  // 2. 디스패치
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, stripe, event.data.object as Stripe.Checkout.Session)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(supabase, event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
        break

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[stripe/webhook] Handler failed for ${event.type}:`, message)
    // Stripe가 재시도하도록 500 반환
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ────────────────────────────────────────────────────────────────────────
// Event handlers
// ────────────────────────────────────────────────────────────────────────

/**
 * Checkout 완료 → PRO 활성화 + customer / subscription ID 저장
 */
async function handleCheckoutCompleted(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const userId =
    session.metadata?.userId ??
    session.client_reference_id ??
    null

  if (!userId) {
    console.error('[stripe/webhook] checkout.session.completed without userId')
    return
  }

  let customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null
  let subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null

  if (subscriptionId && !customerId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    } catch (err) {
      console.error('[stripe/webhook] Failed to retrieve subscription for customer lookup:', err)
    }
  }

  // 구독의 current_period_end를 subscription_ends_at로 저장
  let subscriptionEndsAt: string | null = null
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cpe = (sub as any).current_period_end
      if (typeof cpe === 'number') {
        subscriptionEndsAt = new Date(cpe * 1000).toISOString()
      }
    } catch (err) {
      console.warn('[stripe/webhook] Could not fetch current_period_end:', err)
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      plan: 'pro',
      pro_subscriber: true,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_ends_at: subscriptionEndsAt,
      grace_period_active: false,
      grace_period_ends_at: null,
      last_payment_failed_at: null,
    })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to upgrade profile ${userId}: ${error.message}`)
  }

  await pushNotification(supabase, userId, {
    type: 'subscription_recovered',
    title: '🎉 HireVan PRO 플랜이 활성화되었어요!',
    body: '이제 모든 구직자의 상세 프로필을 무제한으로 열람할 수 있어요.',
    link: '/profile',
    metadata: { subscription_id: subscriptionId },
  })

  console.log(`[stripe/webhook] ✅ Upgraded ${userId} to PRO (sub=${subscriptionId})`)
}

/**
 * 갱신 결제 성공 → PRO 유지, 유예기간 해제
 */
async function handleInvoicePaymentSucceeded(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  invoice: Stripe.Invoice,
) {
  const subscriptionId = typeof (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription === 'string'
    ? (invoice as unknown as { subscription: string }).subscription
    : (invoice as unknown as { subscription?: { id: string } }).subscription?.id ?? null

  if (!subscriptionId) {
    console.warn('[stripe/webhook] invoice.payment_succeeded: no subscription ref')
    return
  }

  const userId = await resolveUserId(supabase, subscriptionId)
  if (!userId) {
    console.warn('[stripe/webhook] invoice.payment_succeeded: no matching user')
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodEnd = (invoice as any).period_end
  const subscriptionEndsAt = typeof periodEnd === 'number'
    ? new Date(periodEnd * 1000).toISOString()
    : null

  const { error } = await supabase
    .from('profiles')
    .update({
      plan: 'pro',
      pro_subscriber: true,
      grace_period_active: false,
      grace_period_ends_at: null,
      last_payment_failed_at: null,
      subscription_ends_at: subscriptionEndsAt,
      stripe_subscription_id: subscriptionId,
    })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to recover subscription for ${userId}: ${error.message}`)
  }

  // 이전에 결제 실패 알림이 있었다면 회수 알림
  await pushNotification(supabase, userId, {
    type: 'subscription_recovered',
    title: '✅ 결제가 성공적으로 완료되었어요',
    body: 'PRO 플랜이 정상적으로 유지됩니다. 감사합니다!',
    link: '/profile',
    metadata: { invoice_id: invoice.id, subscription_id: subscriptionId },
  })

  console.log(`[stripe/webhook] 💳 Invoice paid → PRO recovered for ${userId}`)
}

/**
 * 결제 실패 → 3일 유예기간 시작 (즉시 차단 X)
 */
async function handleInvoicePaymentFailed(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  invoice: Stripe.Invoice,
) {
  const subscriptionId = typeof (invoice as unknown as { subscription?: string | Stripe.Subscription }).subscription === 'string'
    ? (invoice as unknown as { subscription: string }).subscription
    : (invoice as unknown as { subscription?: { id: string } }).subscription?.id ?? null

  if (!subscriptionId) {
    console.warn('[stripe/webhook] invoice.payment_failed: no subscription ref')
    return
  }

  const userId = await resolveUserId(supabase, subscriptionId)
  if (!userId) {
    console.warn('[stripe/webhook] invoice.payment_failed: no matching user')
    return
  }

  const now = new Date()
  const gracePeriodEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) // +3일

  const { error } = await supabase
    .from('profiles')
    .update({
      // plan은 그대로 'pro' 유지 (유예기간 동안)
      grace_period_active: true,
      grace_period_ends_at: gracePeriodEndsAt.toISOString(),
      last_payment_failed_at: now.toISOString(),
    })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to start grace period for ${userId}: ${error.message}`)
  }

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

  console.log(`[stripe/webhook] ⏰ Grace period started for ${userId} (ends ${gracePeriodEndsAt.toISOString()})`)
}

/**
 * 구독 상태 변경 (past_due / canceled / paused / incomplete 등)
 */
async function handleSubscriptionUpdated(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserId(supabase, subscription)
  if (!userId) {
    console.warn('[stripe/webhook] subscription.updated: no matching user')
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cpe = (subscription as any).current_period_end
  const subscriptionEndsAt = typeof cpe === 'number'
    ? new Date(cpe * 1000).toISOString()
    : null

  // active / trialing → PRO 유지
  // past_due / unpaid → 유예기간 활성화 (이미 invoice.payment_failed에서 했으면 그대로)
  // paused / incomplete_expired / canceled → canceled 이벤트에서 처리
  const activeStatuses: Stripe.Subscription.Status[] = ['active', 'trialing']

  if (activeStatuses.includes(subscription.status)) {
    const { error } = await supabase
      .from('profiles')
      .update({
        plan: 'pro',
        pro_subscriber: true,
        stripe_subscription_id: subscription.id,
        subscription_ends_at: subscriptionEndsAt,
        grace_period_active: false,
        grace_period_ends_at: null,
        last_payment_failed_at: null,
      })
      .eq('id', userId)

    if (error) {
      throw new Error(`Failed to sync active sub for ${userId}: ${error.message}`)
    }
    console.log(`[stripe/webhook] 🔄 sub.updated status=${subscription.status} → PRO for ${userId}`)
  } else {
    // past_due / unpaid / paused 등은 결제 실패 핸들러에 위임
    console.log(`[stripe/webhook] ℹ️  sub.updated status=${subscription.status} (no-op, awaiting invoice.* events) for ${userId}`)
  }
}

/**
 * 구독 취소 확정 (구독이 완전히 종료된 상태)
 * → 즉시 FREE 다운그레이드
 */
async function handleSubscriptionDeleted(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  subscription: Stripe.Subscription,
) {
  const userId = await resolveUserId(supabase, subscription)
  if (!userId) {
    console.warn('[stripe/webhook] subscription.deleted: no matching user')
    return
  }

  const { error } = await supabase
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

  if (error) {
    throw new Error(`Failed to downgrade ${userId}: ${error.message}`)
  }

  await pushNotification(supabase, userId, {
    type: 'subscription_canceled',
    title: '구독이 종료되었습니다',
    body: 'HireVan PRO 플랜이 종료되어 FREE 플랜으로 전환되었습니다. 언제든 다시 구독할 수 있어요.',
    link: '/profile',
    metadata: { subscription_id: subscription.id },
  })

  console.log(`[stripe/webhook] ⬇️  Downgraded ${userId} to FREE (sub deleted)`)
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

/**
 * subscription → userId 매핑
 * 1) subscription.metadata.userId
 * 2) profiles.stripe_customer_id = subscription.customer
 */
async function resolveUserId(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
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

    // customer_id로 fallback은 불가 (subscription string only)
    return null
  }

  metadata = subscriptionOrId.metadata
  customerId = typeof subscriptionOrId.customer === 'string'
    ? subscriptionOrId.customer
    : subscriptionOrId.customer.id

  if (metadata?.userId) return metadata.userId

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  return data?.id ?? null
}

/**
 * notification row 삽입 (service role)
 */
async function pushNotification(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string,
  payload: {
    type: string
    title: string
    body: string
    link: string
    metadata: Record<string, unknown>
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
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
    console.warn(`[stripe/webhook] Failed to insert notification for ${userId}:`, error.message)
  }
}
