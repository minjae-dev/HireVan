#!/usr/bin/env node
// scripts/check-stripe-webhook.mjs
//
// 로컬에서 Stripe 웹훅이 정상적으로 연결되어 있는지 진단하는 스크립트.
// .env.local 을 직접 파싱하므로 dotenv 패키지가 필요 없음.
//
// 사용법:
//   node --env-file=.env.local scripts/check-stripe-webhook.mjs
//   npm run check:webhook

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let failed = 0

function ok(label, detail = '') {
  console.log(`${GREEN}✅ ${label}${RESET}${detail ? `  ${detail}` : ''}`)
}
function fail(label, detail = '') {
  failed += 1
  console.log(`${RED}❌ ${label}${RESET}${detail ? `\n   ${detail}` : ''}`)
}
function warn(label, detail = '') {
  console.log(`${YELLOW}⚠️  ${label}${RESET}${detail ? `\n   ${detail}` : ''}`)
}

function parseEnvFile(path) {
  // 매우 단순한 .env 파서 (key=value, 따옴표/주석 무시)
  if (!existsSync(path)) return {}
  const text = readFileSync(path, 'utf-8')
  const out = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const k = trimmed.slice(0, eq).trim()
    let v = trimmed.slice(eq + 1).trim()
    // 따옴표 제거
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

async function main() {
  console.log('\n🔍 Stripe Webhook 진단 — HireVan\n')
  console.log('────────────────────────────────────────')

  // ────────────────────────────────────────────────────────
  // 1) .env.local 파싱
  // ────────────────────────────────────────────────────────
  const envPath = join(process.cwd(), '.env.local')
  const env = parseEnvFile(envPath)

  if (Object.keys(env).length > 0) {
    ok('.env.local 파일 발견', `(${Object.keys(env).length} keys)`)
  } else {
    fail('.env.local 파일을 찾을 수 없음', '루트에 .env.local 을 생성하세요')
  }

  // ────────────────────────────────────────────────────────
  // 2) Stripe 시크릿들 검증
  // ────────────────────────────────────────────────────────
  const secretKey = env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY
  if (secretKey && secretKey.startsWith('sk_')) {
    ok('STRIPE_SECRET_KEY', `(len=${secretKey.length}, prefix=${secretKey.slice(0, 7)}…)`)
  } else {
    fail('STRIPE_SECRET_KEY 가 유효하지 않음', '.env.local 에 sk_test_... 또는 sk_live_... 가 들어있는지 확인')
  }

  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
  if (webhookSecret && webhookSecret.startsWith('whsec_')) {
    ok('STRIPE_WEBHOOK_SECRET', `(len=${webhookSecret.length}, prefix=whsec_…)`)
  } else if (!webhookSecret) {
    fail('STRIPE_WEBHOOK_SECRET 가 비어있음', [
      '이 키는 `stripe listen` 을 실행할 때마다 새로 발급됩니다.',
      '해결:',
      '  1) 다른 터미널에서 `stripe listen --forward-to localhost:3000/api/stripe/webhook` 실행',
      '  2) 출력된 줄 "Your webhook signing secret is whsec_..." 의 whsec_... 값을 복사',
      '  3) .env.local 의 STRIPE_WEBHOOK_SECRET=whsec_... 로 붙여넣기',
      '  4) `next dev` 를 재시작 (env 변경은 자동 반영되지 않음)',
    ].join('\n   '))
  } else {
    fail('STRIPE_WEBHOOK_SECRET 가 whsec_ 로 시작하지 않음', `value=${webhookSecret.slice(0, 20)}…`)
  }

  // ────────────────────────────────────────────────────────
  // 3) Supabase 환경
  // ────────────────────────────────────────────────────────
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseUrl.startsWith('https://')) {
    ok('NEXT_PUBLIC_SUPABASE_URL', `(${supabaseUrl})`)
  } else {
    fail('NEXT_PUBLIC_SUPABASE_URL 가 유효하지 않음')
  }

  if (serviceKey && serviceKey.startsWith('eyJ')) {
    ok('SUPABASE_SERVICE_ROLE_KEY (or alias)', `(len=${serviceKey.length}, JWT prefix=eyJ…)`)
  } else {
    fail('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) 가 없거나 JWT 형식이 아님',
      'Supabase 대시보드 → Settings → API → service_role (secret) 키를 복사하세요.')
  }

  // ────────────────────────────────────────────────────────
  // 4) profiles 테이블 접근 + 컬럼 존재 검사
  // ────────────────────────────────────────────────────────
  if (supabaseUrl && serviceKey) {
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await sb
      .from('profiles')
      .select('id, plan, pro_subscriber, stripe_customer_id, stripe_subscription_id, subscription_ends_at')
      .limit(1)

    if (error) {
      fail('profiles 테이블 SELECT 실패', `error: ${error.message}\n   code: ${error.code}\n   → service_role 키가 잘못되었거나, DB 의 RLS 가 service_role 조차 차단`)
    } else {
      const sample = data && data[0]
      const samplePlan = sample ? sample.plan : 'null'
      const samplePro = sample ? sample.pro_subscriber : 'null'
      ok('profiles 테이블 SELECT 성공 (service_role 정상)',
        `(rows=${data ? data.length : 0}, sample.plan=${samplePlan}, sample.pro_subscriber=${samplePro})`)
    }
  } else {
    warn('Supabase 환경변수가 없어서 profiles 테이블 검사는 건너뜀')
  }

  // ────────────────────────────────────────────────────────
  // 요약
  // ────────────────────────────────────────────────────────
  console.log('────────────────────────────────────────')
  if (failed === 0) {
    console.log(`${GREEN}🎉 모든 점검 통과!${RESET}`)
    console.log('\n다음 단계:')
    console.log('  1. 다른 터미널에서: stripe listen --forward-to localhost:3000/api/stripe/webhook')
    console.log('  2. 다른 터미널에서: npm run dev')
    console.log('  3. 테스트 결제: stripe trigger checkout.session.completed')
    console.log('  4. Next.js 콘솔에서 [stripe/webhook] 로그 확인\n')
    process.exit(0)
  } else {
    console.log(`${RED}⚠️  ${failed}개 항목 실패${RESET} — 위의 안내를 따라 수정 후 다시 실행하세요.`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error('진단 스크립트 자체가 실패:', err)
  process.exit(1)
})
