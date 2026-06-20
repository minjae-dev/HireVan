import { runPipeline } from '@/lib/scrapers/banjosun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  const expected = process.env.CRON_SECRET

  console.log(`[cron/banjosun] CRON_SECRET set=${!!expected}, providedKey=${key ? 'present' : '(none)'}`)

  // 1. 보안 체크
  if (!expected) {
    console.error('[cron/banjosun] CRON_SECRET 환경변수가 없습니다.')
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  // 이제 헤더가 아니라 URL 파라미터(key)를 확인합니다.
  if (key !== expected) {
    console.warn(`[cron/banjosun] 인증 실패: 제공된 키=${key}`)
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