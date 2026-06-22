#!/usr/bin/env tsx
/**
 * 운영용 스크래퍼 자동화 스크립트
 *
 * 기능:
 *   1. node-cron 스케줄링: 매일 09:00, 18:00 자동 실행
 *   2. hivan 스크래퍼 실행 → DB 저장 (runHivanPipeline)
 *   3. 결과 요약 출력 (총 수집 건수, DB 적재 성공 건수, 에러 발생 시 에러 메시지)
 *   4. 에러 발생 시 /logs/scraper-error.log 에 타임스탬프 기록
 *
 * 사용법:
 *   npx tsx scripts/run-scraper.ts            # 수동 1회 실행
 *   npx tsx scripts/run-scraper.ts --schedule  # 스케줄러 모드로 실행
 */
import { runHivanPipeline } from '../lib/scrapers/hivan.js';
import * as cron from 'node-cron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';

// ──────────────────────────────────────────────
// 설정
// ──────────────────────────────────────────────
const LOG_DIR = path.resolve(import.meta.dirname, '..', 'logs');
const SCRAPER_LOG = path.join(LOG_DIR, 'scraper.log');
const ERROR_LOG = path.join(LOG_DIR, 'scraper-error.log');
const CRON_SCHEDULE = {
  morning: '0 9 * * *',   // 매일 09:00
  evening: '0 18 * * *',  // 매일 18:00
};

// ──────────────────────────────────────────────
// 로깅 유틸리티
// ──────────────────────────────────────────────

/** 로그 디렉토리 보장 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** 에러 로그 파일에 기록 */
function logError(message: string, error?: unknown): void {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const errMsg = error instanceof Error ? error.message : error ? String(error) : '';
  const logLine = `[${timestamp}] ERROR: ${message}${errMsg ? ` | ${errMsg}` : ''}\n`;
  fs.appendFileSync(ERROR_LOG, logLine, 'utf-8');
  console.error(`  ❌ ${message}${errMsg ? `: ${errMsg}` : ''}`);
}

/** 일반 로그 (info) - 콘솔 출력 */
function logInfo(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`  ℹ️  [${timestamp}] ${message}`);
}

/** 스크래퍼 전용 로그 파일(scraper.log)에 기록 */
function logToFile(message: string): void {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(SCRAPER_LOG, logLine, 'utf-8');
}

// ──────────────────────────────────────────────
// 메인 실행 함수
// ──────────────────────────────────────────────

async function runScraper(): Promise<void> {
  const startTime = Date.now();
  const dateStr = new Date().toISOString();

  // 스크래퍼 로그 파일에 시작 기록
  logToFile('스크래핑 시작');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     🚀 HireVan 스크래퍼 실행                            ║');
  console.log(`║     실행 시간: ${dateStr}                  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  let scrapedCount = 0;

  try {
    // ── 1단계: 스크래퍼 실행 및 DB 저장 ──
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📡 스크래퍼 실행 중...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const result = await runHivanPipeline(2); // 2페이지까지 수집

    scrapedCount = result.scraped;

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅ 실행 완료');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (err: unknown) {
    // ── 에러 처리 ──
    const errMsg = err instanceof Error ? err.message : String(err);
    logError('스크래퍼 실행 중 예외 발생', errMsg);
  }

    // ── 결과 요약 ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // 스크래퍼 로그 파일에 완료 기록
  logToFile(`총 ${scrapedCount}개 공고 수집 완료`);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     📊 실행 결과 요약                                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  🕐 실행 시간:     ${dateStr}`);
  console.log(`  ⏱  소요 시간:     ${elapsed}초`);
  console.log(`  📥 총 수집 건수:  ${scrapedCount}개`);
  console.log('  💾 DB 적재 건수:  runHivanPipeline 내부에서 처리 (위 로그 참고)');
  console.log('');
  console.log('  📝 상세 로그는 위 출력 내용을 참고하세요.');
  console.log('');
}

// ──────────────────────────────────────────────
// 스케줄러 등록
// ──────────────────────────────────────────────

function startScheduler(): void {
  console.log('========================================');
  console.log('  ⏰ 스크래퍼 스케줄러 시작');
  console.log(`  🕐 09:00 - ${CRON_SCHEDULE.morning}`);
  console.log(`  🕐 18:00 - ${CRON_SCHEDULE.evening}`);
  console.log('========================================\n');

  // 아침 9시
  cron.schedule(CRON_SCHEDULE.morning, () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ⏰ 예약 실행: 오전 9시 스크래핑 시작');
    console.log('═══════════════════════════════════════════════════════\n');
    runScraper().catch((err) => {
      logError('오전 9시 스크래핑 실패', err);
    });
  });

  // 저녁 6시
  cron.schedule(CRON_SCHEDULE.evening, () => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ⏰ 예약 실행: 오후 6시 스크래핑 시작');
    console.log('═══════════════════════════════════════════════════════\n');
    runScraper().catch((err) => {
      logError('오후 6시 스크래핑 실패', err);
    });
  });

  // 프로세스 유지 (무한 대기)
  console.log('  ✅ 스케줄러가 등록되었습니다. (Ctrl+C로 종료)\n');
}

// ──────────────────────────────────────────────
// 엔트리 포인트
// ──────────────────────────────────────────────

const args = process.argv.slice(2);
const isScheduleMode = args.includes('--schedule');

if (isScheduleMode) {
  startScheduler();
} else {
  // 수동 1회 실행
  runScraper()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      logError('스크래퍼 실행 실패', err);
      process.exit(1);
    });
}