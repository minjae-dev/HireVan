import { runPipeline } from '@/lib/scrapers/banjosun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── 수동 트리거 (테스트용) ─────────────────────────────────
// URL: /api/cron/banjosun/manual?secret=xxx
export async function POST(req: Request) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  console.log(`[cron/banjosun/manual] CRON_SECRET set=${!!expected}, secret=${!!secret}`)

  if (!expected || secret !== expected) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/banjosun/manual] 수동 실행 시작')
  try {
    const result = await runPipeline(3)
    return Response.json({ ...result, triggered: 'manual' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ error: message }, { status: 500 })
  }
}

// ── Vercel Cron 자동 실행 ─────────────────────────────────
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const expected = process.env.CRON_SECRET

  console.log(`[cron/banjosun] CRON_SECRET set=${!!expected}, authHeader=${authHeader ?? '(none)'}`)

  if (!expected) {
    console.error('[cron/banjosun] CRON_SECRET 환경변수가 없습니다. Vercel 환경변수에 설정해주세요.')
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${expected}`) {
    console.warn(`[cron/banjosun] 인증 실패: expected=Bearer ${expected}, got=${authHeader}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron/banjosun] 인증 성공 — 파이프라인 시작')
  try {
    const result = await runPipeline(3)
    console.log(`[cron/banjosun] 완료:`, result)
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[cron/banjosun] 실행 오류:`, message)
    return Response.json({ error: message }, { status: 500 })
  }
}
