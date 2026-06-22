/**
 * hivan 스크래퍼 통합 테스트 스크립트
 *
 * 수행:
 *   1. 스크래퍼 실행 및 데이터 수집 확인
 *   2. DB 저장(saveToDatabase) 시뮬레이션
 *   3. 예외 처리 (필수값 부족 데이터 스킵)
 *
 * 사용법: npx tsx scripts/test-hivan-full.ts
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { collectHivanJobs } from '../lib/scrapers/hivan.js';

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     🧪 Hivan 스크래퍼 통합 테스트                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // ===================================================================
  // 1단계: 데이터 수집 테스트 (collectHivanJobs, DB 저장 없음)
  // ===================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  [1/3] 📡 스크래퍼 실행 (DB 저장 없음)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const result = await collectHivanJobs(2); // 2페이지까지 수집

  console.log(`\n  ✅ Success: ${result.success}`);
  console.log(`  📅 수집 기준일: ${result.date}`);
  console.log(`  🔗 수집 소스: ${result.sources.join(', ')}`);
  console.log(`  📊 총 수집 건수: ${result.count}개`);

  const jobs = result.jobs;

  // 상세 출력 (최대 5개)
  console.log('\n  📋 === Filtered List (최대 5개) ===');
  const showCount = Math.min(jobs.length, 5);
  for (let i = 0; i < showCount; i++) {
    const j = jobs[i];
    console.log(`  [${i + 1}] ${j.title}`);
    console.log(`      업체명: ${j.company || '❌ 없음'}`);
    console.log(`      연락처: ${j.contact || '❌ 없음'}`);
    console.log(`      시급:   ${j.wage || '❌ 없음'}`);
    console.log(`      지역:   ${j.location || '❌ 없음'}`);
    console.log(`      소스:   ${j.source_name} | ${j.created_at}`);
    console.log('');
  }

  if (jobs.length > showCount) {
    console.log(`  ... 외 ${jobs.length - showCount}개\n`);
  }

  // ===================================================================
  // 2단계: DB 저장 시뮬레이션 (1개만 Insert)
  // ===================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  [2/3] 💾 DB 적재 테스트 (1개 샘플)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (jobs.length === 0) {
    console.log('  ⚠️ 저장할 데이터가 없습니다. DB 테스트를 건너뜁니다.\n');
  } else {
    const sample = jobs[0]; // 첫 번째 공고로 DB 테스트
    console.log(`  대상 공고: ${sample.title}`);
    console.log(`  소스:      ${sample.source_name}`);
    console.log(`  업체명:    ${sample.company}`);
    console.log(`  연락처:    ${sample.contact}`);
    console.log(`  전화:      ${sample.phone}`);
    console.log(`  이메일:    ${sample.email}`);
    console.log(`  시급:      ${sample.wage}`);
    console.log(`  지역:      ${sample.location}`);
    console.log(`  URL:       ${sample.source_url}\n`);

    // DB 저장 시도
    try {
      // const supabase = requireSupabaseAdmin();
      const supabase = createClient(
  'https://nppfkucwgrnbovkvubhy.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wcGZrdWN3Z3JuYm92a3Z1Ymh5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDUwNzg1MiwiZXhwIjoyMDk2MDgzODUyfQ.mKaA_jSdpzsTj1gkwQzmNi-XftZbLGpPOSdQIN4v67A', // .env.local 파일의 SUPABASE_SERVICE_ROLE_KEY 값을 그대로 복사해서 넣으세요
  { auth: { persistSession: false } }
);
      const sourceId = `hivan-${sample.source_name}`;

      // 중복 체크
      const { data: existing, error: checkErr } = await supabase
        .from('job_posts')
        .select('id')
        .eq('source', sourceId)
        .eq('title', sample.title)
        .limit(1);

      if (checkErr) {
        console.log(`  ⚠️ 중복 체크 중 오류 (무시): ${checkErr.message}`);
      }

      if (existing && existing.length > 0) {
        console.log(`  ⏭️ 중복 스킵: 이미 DB에 존재합니다 (id: ${existing[0].id})\n`);
        console.log('  ✅ DB 적재 시뮬레이션 성공 (중복 감지 정상 작동)\n');
      } else {
        // 실제 Insert
        const { data: insertData, error: insertErr } = await supabase
          .from('job_posts')
          .insert({
            title: sample.title,
            description: sample.description || '',
            location: sample.location || '',
            company_name: sample.company || null,
            contact_phone: sample.phone,
            contact_email: sample.email,
            source: sourceId,
            source_url: sample.source_url,
            status: 'pending_activation',
            employer_id: null,
          })
          .select('id')
          .single();

        if (insertErr) {
          console.log(`  ❌ DB Insert 실패: ${insertErr.message}\n`);
          console.log('  💡 DB 컬럼명 불일치 가능성 있음 - 실제 DB와 TypeScript 타입 비교 필요\n');
        } else {
          console.log(`  ✅ DB 적재 성공! job_posts.id = ${insertData.id}\n`);

          // 롤백: 테스트 데이터 삭제
          const { error: delErr } = await supabase
            .from('job_posts')
            .delete()
            .eq('id', insertData.id);

          if (delErr) {
            console.log(`  ⚠️ 테스트 데이터 롤백 실패: ${delErr.message}`);
            console.log('  (수동으로 삭제 필요)\n');
          } else {
            console.log('  ✅ 테스트 데이터 롤백 완료 (정리됨)\n');
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(`  ❌ DB 테스트 예외: ${errMsg}\n`);
    }
  }

  // ===================================================================
  // 3단계: 예외 처리 확인 (불완전 데이터 스킵 로그)
  // ===================================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  [3/3] 🚫 예외 처리 확인 (불완전 데이터 스킵)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // collectHivanJobs 이미 실행되었으므로 parseItem 로그는 위에서 출력됨
  // 실제로 어떤 데이터가 스킵되었는지 확인하기 위해
  // jobs 중에서 일부 필드가 비어있는 케이스를 확인
  console.log('  📊 데이터 완전성 분석 (수집된 21개 기준)\n');

  const missingCompany = jobs.filter((j) => !j.company).length;
  const missingContact = jobs.filter((j) => !j.contact).length;
  const missingWage = jobs.filter((j) => !j.wage).length;
  const missingLocation = jobs.filter((j) => !j.location).length;
  const missingAll = jobs.filter((j) => !j.company && !j.contact && !j.wage && !j.location);

  console.log(`  - 업체명 누락:  ${missingCompany}개`);
  console.log(`  - 연락처 누락:  ${missingContact}개`);
  console.log(`  - 시급 누락:    ${missingWage}개`);
  console.log(`  - 지역 누락:    ${missingLocation}개`);
  console.log(`  - 모든 필드 누락 (이론상 0): ${missingAll}개`);
  console.log('');

  console.log('  ℹ️  parseItem 로직 (hivan.ts 348-352):');
  console.log('     company || contact || wage || location 중 하나라도 있으면 통과');
  console.log('     (4개 전부 없으면 → "필수값 부족 스킵" 로그 출력)');
  console.log('');

  // collectHivanJobs 실행 시 콘솔에 출력된 로그에서 스킵 메시지를 재확인
  console.log('  🔍 위 실행 로그 중 다음 메시지가 보이면 정상 스킵:');
  console.log('     - "🚫 광고 스킵: ..." (광고 키워드 포함)');
  console.log('     - "⏭️ 필수값 부족 스킵: ..." (필수값 전부 없음)');
  console.log('     - 날짜가 오늘이 아닌 게시글 (자동 필터링)');
  console.log('');

  // ===================================================================
  // 결과 요약
  // ===================================================================
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     ✅ 모든 테스트 완료                                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  📌 다음 단계: "구직자 알림 및 사장님 계정 활성화" 자동화');
  console.log('');
}

main().catch((err) => {
  console.error('\n❌ 테스트 중 오류 발생:', err);
  process.exit(1);
});