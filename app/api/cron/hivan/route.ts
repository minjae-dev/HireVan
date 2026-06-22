import { runHivanPipeline } from '@/lib/scrapers/hivan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const expected = process.env.CRON_SECRET;

  console.log(`[cron/hivan] CRON_SECRET set=${!!expected}, providedKey=${key ? 'present' : '(none)'}`);

  if (!expected) {
    console.error('[cron/hivan] CRON_SECRET 환경변수가 없습니다.');
    return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  if (key !== expected) {
    console.warn(`[cron/hivan] 인증 실패`);
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron/hivan] 인증 성공 — 파이프라인 시작');
  try {
    const result = await runHivanPipeline(5);
    console.log(`[cron/hivan] 완료: scraped=${result.scraped}`);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cron/hivan] 실행 오류:`, message);
    return Response.json({ error: message }, { status: 500 });
  }
}
