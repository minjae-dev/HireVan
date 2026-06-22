/**
 * hivan 스크래퍼 단독 테스트 스크립트
 *
 * 사용법: npx tsx scripts/test-hivan-scraper.ts
 */
import { collectHivanJobs } from '../lib/scrapers/hivan.js';

async function main() {
  console.log('========================================');
  console.log('[test] 🧪 hivan 스크래퍼 테스트 시작');
  console.log('========================================\n');

  // --------------------------------------------------
  // 1) 데이터 수집 (DB 저장 없음)
  // --------------------------------------------------
  console.log('[test] 📡 데이터 수집 중... (collectHivanJobs)');
  const result = await collectHivanJobs(1); // 첫 페이지만 (빠른 테스트)
  console.log(`[test] 성공 여부: ${result.success}`);
  console.log(`[test] 수집 일자: ${result.date}`);
  console.log(`[test] 소스 목록: ${result.sources.join(', ')}`);
  console.log(`[test] 수집된 총 건수: ${result.count}`);

  const jobs = result.jobs;

  // --------------------------------------------------
  // 2) 수집 결과 상세 출력 (최대 10개)
  // --------------------------------------------------
  console.log('\n========================================');
  console.log('[test] 📋 수집된 공고 목록');
  console.log('========================================\n');

  const showCount = Math.min(jobs.length, 10);
  for (let i = 0; i < showCount; i++) {
    const job = jobs[i];
    console.log(`--- ${i + 1} ---`);
    console.log(`  제목:        ${job.title}`);
    console.log(`  업체명:      ${job.company || '(없음)'}`);
    console.log(`  연락처:      ${job.contact || '(없음)'}`);
    console.log(`  전화:        ${job.phone || '(없음)'}`);
    console.log(`  이메일:      ${job.email || '(없음)'}`);
    console.log(`  시급:        ${job.wage || '(없음)'}`);
    console.log(`  지역:        ${job.location || '(없음)'}`);
    console.log(`  본문(앞100): ${(job.description || '(없음)').slice(0, 100)}`);
    console.log(`  소스:        ${job.source_name}`);
    console.log(`  작성일:      ${job.created_at}`);
    console.log(`  URL:         ${job.source_url}`);
    console.log('');
  }

  if (jobs.length > showCount) {
    console.log(`  ... 외 ${jobs.length - showCount}개\n`);
  }

  // --------------------------------------------------
  // 3) 검증: 오늘 날짜(2026-06-21) 필터링 확인
  // --------------------------------------------------
  console.log('========================================');
  console.log('[test] 🔍 데이터 검증');
  console.log('========================================\n');

  const allToday = jobs.every((j) => j.created_at === '2026-06-21');
  console.log(`[test] ✅ 모든 데이터가 오늘 날짜(2026-06-21)인가? ${allToday}`);

  const hasContact = jobs.filter((j) => j.contact).length;
  const hasCompany = jobs.filter((j) => j.company).length;
  const hasWage = jobs.filter((j) => j.wage).length;
  const hasLocation = jobs.filter((j) => j.location).length;
  const hasDescription = jobs.filter((j) => j.description).length;

  console.log(`[test] 📊 연락처 있음:     ${hasContact}/${jobs.length}`);
  console.log(`[test] 📊 업체명 있음:     ${hasCompany}/${jobs.length}`);
  console.log(`[test] 📊 시급 있음:       ${hasWage}/${jobs.length}`);
  console.log(`[test] 📊 지역 있음:       ${hasLocation}/${jobs.length}`);
  console.log(`[test] 📊 본문(description) 있음: ${hasDescription}/${jobs.length}`);

  // description이 JSON 객체가 아니라 평문인지 검증
  const jsonLikeDescs = jobs.filter((j) => {
    try {
      const parsed = JSON.parse(j.description);
      return typeof parsed === 'object';
    } catch {
      return false;
    }
  });
  if (jsonLikeDescs.length > 0) {
    console.log(`[test] ❌ 경고: ${jsonLikeDescs.length}개 공고의 description이 JSON 객체(메타데이터)입니다!`);
  } else {
    console.log(`[test] ✅ 모든 description이 JSON이 아닌 평문(실제 본문)입니다.`);
  }

  // --------------------------------------------------
  // 4) 완료
  // --------------------------------------------------
  console.log('\n========================================');
  console.log('[test] 🎉 테스트 완료!');
  console.log(`[test] 총 ${jobs.length}개 공고 수집됨`);
  console.log('========================================');
}

main().catch((err) => {
  console.error('[test] ❌ 테스트 실패:', err);
  process.exit(1);
});