// ============================================================
// 집계 소스 수집기 (Aggregator Scraper)
//
// 배경: 기존 hivan 스크래퍼는 hivan.jaebae.net의 WrapAPI 프록시
// (wa.api.jaebae.net)를 경유했는데, 2026-10-20 확인 결과 서버 측
// 호출이 403으로 차단됨 (브라우저에서는 정상). 집계 사이트 자체는
// 살아 있으므로, ScrapingBee로 렌더링된 /jobs 페이지를 받아
// 카드(제목·출처·날짜·원본 링크)를 파싱하고, 전화번호 등 상세는
// 원본 게시판 상세 페이지를 직접 조회해 추출한다.
//
// 수집 정책 (기존 파이프라인과 동일):
// - 오늘(밴쿠버 날짜) 게시글만 수집
// - 전화번호 없는 공고는 스킵 (지원 시 SMS 활성화에 필수)
// - 중복 체크: source_url 기준, 최근 30일 이내 삽입 건이 있으면 스킵
// - 삽입 상태: pending_activation
// ============================================================

import { requireSupabaseAdmin } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

type AnySupabase = SupabaseClient;

const AGGREGATOR_JOBS_URL = 'https://hivan.jaebae.net/jobs/';
const SCRAPINGBEE_API_URL = 'https://app.scrapingbee.com/api/v1/';

/** 광고성 키워드 (제목 포함 시 스킵) — 기존 스크래퍼들과 동일 기준 */
const AD_KEYWORDS = ['LMIA', 'RCIP', '영주권', '이민', '대행', '광고', '홍보', '업체제휴'];

/** 집계 카드의 출처 배지 → DB source 값 + 상세 조회 가능 여부 */
const SOURCE_MAP: Record<string, { source: string; detailFetch: boolean }> = {
  '밴조선': { source: 'aggregator-vcs', detailFetch: true },
  '우밴유': { source: 'aggregator-uvanu', detailFetch: true },
  '케이방': { source: 'aggregator-kbang', detailFetch: true },
  // 헬로밴(네이버 카페)은 비로그인 조회가 막혀 있어 카드 미리보기에서만 추출 시도
  '헬로밴': { source: 'aggregator-hellovan', detailFetch: false },
};

const KNOWN_HOSTS = [
  'vanchosun.com',
  'm.cafe.daum.net',
  'cafe.daum.net',
  'vancouver.k-bang.com',
  'k-bang.com',
  'm.cafe.naver.com',
  'cafe.naver.com',
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function vancouverToday(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Vancouver' }))
    .toISOString()
    .split('T')[0];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export interface AggregatorCard {
  title: string;
  preview: string;
  badge: string;
  date: string;
  url: string;
}

export interface AggregatorJob extends AggregatorCard {
  company: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  description: string;
}

// ============================================================
// 1. ScrapingBee로 집계 페이지 렌더링 HTML 가져오기
// ============================================================
async function fetchAggregatorHtml(): Promise<string> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    throw new Error('SCRAPINGBEE_API_KEY 환경변수가 없습니다.');
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    url: AGGREGATOR_JOBS_URL,
    render_js: 'true',
    wait: '3000',
  });

  const response = await fetch(`${SCRAPINGBEE_API_URL}?${params.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`ScrapingBee 응답 오류: HTTP ${response.status}`);
  }

  return response.text();
}

// ============================================================
// 2. 카드 파싱 — 카드 전체가 원본 상세 링크(a)이고 안에 h3 제목,
//    출처 배지 텍스트, YYYY-MM-DD 날짜 텍스트가 들어 있다.
// ============================================================
export function parseCards(html: string): AggregatorCard[] {
  const $ = cheerio.load(html);
  const cards: AggregatorCard[] = [];
  const seenUrls = new Set<string>();

  $('a').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (!href.startsWith('http')) return;
    if (!KNOWN_HOSTS.some((host) => href.includes(host))) return;

    const title = normalizeText($(el).find('h3').first().text());
    if (!title) return;

    const cardText = normalizeText($(el).text());

    const dateMatch = cardText.match(/\d{4}-\d{2}-\d{2}/);
    if (!dateMatch) return;

    const badge = Object.keys(SOURCE_MAP).find((b) => cardText.includes(b));
    if (!badge) return;

    // 미리보기: 카드 안 가장 긴 p 텍스트 (제목·날짜 제외)
    let preview = '';
    $(el)
      .find('p')
      .each((__, p) => {
        const t = normalizeText($(p).text());
        if (t.length > preview.length && !/^\d{4}-\d{2}-\d{2}/.test(t)) preview = t;
      });

    if (seenUrls.has(href)) return;
    seenUrls.add(href);

    cards.push({ title, preview, badge, date: dateMatch[0], url: href });
  });

  return cards;
}

// ============================================================
// 3. 상세 페이지에서 연락처·업체명·지역 추출
// ============================================================
function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|\d{3}[-.]\d{4}/);
  return m ? m[0].trim() : null;
}

function extractEmail(text: string): string | null {
  const m = text.match(/(?<![0-9A-Za-z._%+-])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?![a-zA-Z])/);
  return m ? m[0] : null;
}

/** 밴조선 상세의 라벨형 필드 (td.board_section_frame1/2) 읽기 */
function readLabelFields($: cheerio.CheerioAPI): Map<string, string> {
  const fields = new Map<string, string>();
  $('td.board_section_frame1').each((_, el) => {
    const key = normalizeText($(el).text()).replace(/[:：]$/, '');
    const value = normalizeText($(el).next('td.board_section_frame2').text());
    if (key && value && !fields.has(key)) fields.set(key, value);
  });
  return fields;
}

function findField(fields: Map<string, string>, labels: string[]): string | null {
  for (const [key, value] of fields) {
    if (labels.some((label) => key.includes(label))) return value;
  }
  return null;
}

export async function enrichFromDetail(card: AggregatorCard): Promise<AggregatorJob> {
  const base: AggregatorJob = {
    ...card,
    company: null,
    phone: extractPhone(card.preview),
    email: extractEmail(card.preview),
    location: null,
    description: card.preview,
  };

  if (!SOURCE_MAP[card.badge]?.detailFetch) return base;

  try {
    const response = await fetch(card.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    });
    if (!response.ok) {
      console.warn(`[aggregator] 상세 HTTP ${response.status}: ${card.url}`);
      return base;
    }

    const html = (await response.text()).replace(/></g, '> <');
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe').remove();
    const bodyText = normalizeText($('body').text());
    const fields = readLabelFields($);

    // 연락처는 라벨 필드(구인문의/연락처)를 우선하고, 없으면 본문에서 추출
    const contactField = findField(fields, ['구인문의', '연락처', '전화', '문의']);
    const phone = (contactField && extractPhone(contactField)) || extractPhone(bodyText);
    const company = findField(fields, ['업체명', '회사명', '상호']);
    const location = findField(fields, ['근무지역', '근무지', '지역', '위치']);

    return {
      ...base,
      phone: phone ?? base.phone,
      email: extractEmail(bodyText) ?? base.email,
      company: company ?? base.company,
      location: location ?? base.location,
      description: base.description || bodyText.slice(0, 500),
    };
  } catch (error) {
    console.warn(`[aggregator] 상세 조회 실패 (${card.url}):`, error);
    return base;
  }
}

// ============================================================
// 4. DB 저장 — source_url 기준 최근 30일 중복 체크
// ============================================================
async function saveToDatabase(jobs: AggregatorJob[], supabase: AnySupabase): Promise<number> {
  let saved = 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const job of jobs) {
    const { data: existing } = await supabase
      .from('job_posts')
      .select('id')
      .eq('source_url', job.url)
      .gte('created_at', thirtyDaysAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[aggregator] ⏭️ 중복 스킵: ${job.title}`);
      continue;
    }

    const { error } = await supabase.from('job_posts').insert({
      title: job.title,
      description: job.description || '',
      location: job.location ?? '',
      company_name: job.company,
      contact_phone: job.phone,
      contact_email: job.email,
      source: SOURCE_MAP[job.badge].source,
      source_url: job.url,
      status: 'pending_activation',
      employer_id: null,
    });

    if (error) {
      console.error(`[aggregator] ❌ 삽입 실패 (${job.title}):`, error.message);
    } else {
      console.log(`[aggregator] ✅ 삽입 성공: ${job.title}`);
      saved++;
    }
  }

  return saved;
}

// ============================================================
// 메인 파이프라인
// ============================================================
export async function runAggregatorPipeline(): Promise<{
  scraped: number;
  saved: number;
  jobs: AggregatorJob[];
}> {
  const today = vancouverToday();
  console.log(`[aggregator] 🚀 수집 시작 (기준일 ${today})`);

  const html = await fetchAggregatorHtml();
  const allCards = parseCards(html);
  console.log(`[aggregator] 카드 ${allCards.length}개 파싱`);

  const todayCards = allCards.filter((c) => c.date === today);
  console.log(`[aggregator] 오늘 카드 ${todayCards.length}개`);

  const jobs: AggregatorJob[] = [];
  for (const card of todayCards) {
    if (AD_KEYWORDS.some((k) => card.title.includes(k))) {
      console.log(`[aggregator] 🚫 광고 스킵: ${card.title}`);
      continue;
    }
    const job = await enrichFromDetail(card);
    if (!job.phone) {
      console.log(`[aggregator] ⏭️ 전화번호 없음 스킵: ${card.title}`);
      continue;
    }
    jobs.push(job);
  }

  console.log(`[aggregator] 📊 수집 완료: ${jobs.length}개 (전화번호 보유)`);

  let saved = 0;
  if (jobs.length > 0) {
    const supabase = requireSupabaseAdmin() as AnySupabase;
    saved = await saveToDatabase(jobs, supabase);
  }
  console.log(`[aggregator] 💾 DB 저장: ${saved}개`);

  return { scraped: jobs.length, saved, jobs };
}
