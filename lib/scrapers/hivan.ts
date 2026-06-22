import { requireSupabaseAdmin } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient;

// ============================================================
// hivan.jaebae.net 데이터 수집기
// ============================================================
// 이 모듈은 hivan.jaebae.net의 WrapAPI Proxy를 통해
// 여러 구인구직 게시판(밴조선, 카페다음, K-Bang 등)의
// 게시글을 수집합니다.
// ============================================================

const BASE_API = 'https://wa.api.jaebae.net/hivancouver';
const API_KEY = '48voXfwzDZPeNwxOpvF6Jd4YsgpAfTv1';
const REFERER = 'https://hivan.jaebae.net/';
const ORIGIN = 'https://hivan.jaebae.net';

/** 오늘 날짜 (2026-06-21) */
const SCRAPE_DATE = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Vancouver"}))
  .toISOString()
  .split('T')[0];
/** 광고성 키워드 (제목/본문 포함 시 스킵) */
const AD_KEYWORDS = ['광고', '홍보', '업체제휴'];

// ============================================================
// 수집 대상 소스 정의
// ============================================================
interface SourceConfig {
  name: string;        // 소스 이름 (식별자)
  slug: string;        // API 경로
  method: 'GET' | 'POST';
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  /** 각 아이템에서 source_url을 만드는 함수 */
  makeUrl: (item: Record<string, unknown>) => string;
  /** 각 아이템에서 작성일을 파싱하는 함수 */
  makeDate: (item: Record<string, unknown>) => string;
}

const SOURCES: SourceConfig[] = [
  {
    name: 'vcs-job',
    slug: 'vcs-job/latest',
    method: 'GET',
    query: { page: '1', page_size: '100' },
    makeUrl: (item) => `https://www.vanchosun.com/market/main/frame.php?main=job&cpage1=1&bdId=${item.id}`,
    makeDate: (item) => String(item.date ?? '').split(' ')[0], // "2026-06-21 20:44:48" -> "2026-06-21"
  },
  {
    name: 'kbang-job',
    slug: 'kb_api/latest',
    method: 'GET',
    query: { service: 'job', area: 'YVR', page: '1', page_size: '100' },
    makeUrl: (item) => `https://vancouver.k-bang.com/ko/listings/${item.id}`,
    makeDate: (item) => {
      const d = item.date as string;
      if (d) return d.split('T')[0];
      return '';
    },
  },
  {
    name: 'uvanu-job',
    slug: 'daumcafe-js2/latest',
    method: 'GET',
    query: { grpid: 'hPc', fldid: '1xBD', page: '1', page_size: '100' },
    makeUrl: (item) => `https://m.cafe.daum.net/ourvancouver/1xBD/${item.dataid}`,
    makeDate: (item) => {
      const d = item.date as string;
      if (d) return d.split('T')[0];
      return '';
    },
  },
];

// ============================================================
// API 호출
// ============================================================
async function fetchFromSource(source: SourceConfig, page = 1): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams();
  if (source.query) {
    for (const [k, v] of Object.entries(source.query)) {
      params.set(k, k === 'page' ? String(page) : v);
    }
  }

  const url = `${BASE_API}/${source.slug}?${params.toString()}`;
  console.log(`[hivan/scraper] 📡 요청: ${url}`);

  const headers: Record<string, string> = {
    'wrapAPIKey': API_KEY,
    'Referer': REFERER,
    'Origin': ORIGIN,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };

  const response = await fetch(url, {
    method: source.method,
    headers,
    ...(source.body ? { body: JSON.stringify(source.body) } : {}),
  });

  if (!response.ok) {
    console.warn(`[hivan/scraper] ⚠️ ${source.name} HTTP ${response.status}: ${response.statusText}`);
    return [];
  }

  const json = await response.json() as { success?: boolean; data?: { items?: Record<string, unknown>[] }; messages?: string[] };

  if (!json.success) {
    console.warn(`[hivan/scraper] ⚠️ ${source.name} API 오류:`, json.messages?.join('; '));
    return [];
  }

  const items = json.data?.items ?? [];
  console.log(`[hivan/scraper] ✅ ${source.name}: ${items.length}개 수신`);
  return items;
}

// ============================================================
// 수집된 데이터 구조
// ============================================================
export interface HivanJob {
  title: string;
  company: string;
  description: string;
  contact: string;
  phone: string | null;
  email: string | null;
  wage: string | null;
  location: string | null;
  source_url: string;
  source_name: string;
  created_at: string;
}

// ============================================================
// 날짜 필터링
// ============================================================
function isToday(dateStr: string): boolean {
  if (!dateStr) return false;
  // dateStr이 "2026-06-21" 형식이거나 "2026-06-21T..." 형식
  const normalized = dateStr.split('T')[0].split(' ')[0];
  return normalized === SCRAPE_DATE;
}

// ============================================================
// 광고 키워드 체크
// ============================================================
function containsAdKeyword(text: string): boolean {
  if (!text) return false;
  return AD_KEYWORDS.some((keyword) => text.includes(keyword));
}

// ============================================================
// 필드 추출 유틸리티
// ============================================================
function extractByPattern(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** 긴 문자열에서 의미 있는 키워드만 추출 (100자 제한) */
function cleanLongText(text: string, maxLen = 100): string {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  // 100자 넘으면 첫 100자 + '...' 처리
  return cleaned.slice(0, maxLen).trim() + '…';
}

// ============================================================
// 본문 HTML → 텍스트 변환
// ============================================================
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// 연락처 추출
// ============================================================
function extractContact(text: string): {
  contact: string;
  phone: string | null;
  email: string | null;
} {
  // 전화번호 패턴 강화:
  // - 기본: 778-872-8382, 604.786.6211
  // - 괄호 포함: (778) 872-8382
  // - 국가코드 포함: +1 778-872-8382, 1-778-872-8382
  // - 7자리: 872-8382
  const phonePatterns = [
    /(\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    /(\d{3}[-.]?\d{4})/g, // 7자리 번호
  ];

  // 이메일 패턴 (한글 도메인 등 일부 케이스도 커버)
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

  // 카톡/오픈채팅 패턴
  const kakaoPatterns = [
    /(?:카톡|카카오?|오픈채팅|kakao)[:\s]*([가-힣a-zA-Z0-9_.-]+)/i,
    /open\.kakao\.com\/[a-zA-Z0-9_/-]+/g,
  ];

  let phone: string | null = null;
  let email: string | null = null;

  // 전화번호 추출 (우선순위: 국가코드 있는 번호 > 10자리 > 7자리)
  const phoneMatches = text.match(phonePatterns[0]);
  if (phoneMatches) {
    // 가장 긴 전화번호를 선택 (국가코드 포함된 번호 우선)
    phone = phoneMatches.sort((a, b) => b.length - a.length)[0].trim();
    // 전화번호 정규화: 공백/특수문자 제거 (가독성 유지)
    phone = phone.replace(/[^\d+\-.\s()]/g, '').trim();
  } else {
    const shortPhoneMatches = text.match(phonePatterns[1]);
    if (shortPhoneMatches) {
      // 7자리 번호는 연속된 7자리만 추출 (다른 숫자와 구분)
      phone = shortPhoneMatches[0].trim();
    }
  }

  // 이메일 추출
  const emailMatches = text.match(emailPattern);
  if (emailMatches) {
    email = emailMatches[0].toLowerCase().trim();
  }

  // contact 문자열 구성 (중복 제거)
  const parts: string[] = [];
  if (phone) parts.push(phone);
  if (email) parts.push(email);

  // 카톡 ID도 contact에 포함
  for (const pat of kakaoPatterns) {
    const m = text.match(pat);
    if (m) {
      const kakaoVal = m[0].startsWith('open.kakao.com') ? m[0] : `카톡:${m[1]}`;
      // 중복 방지
      if (!parts.some((p) => p.includes(kakaoVal))) {
        parts.push(kakaoVal);
      }
    }
  }

  return {
    contact: parts.length > 0 ? parts.join(' / ') : '',
    phone,
    email,
  };
}

// ============================================================
// 업체명 추출
// ============================================================
/** 업체명에 포함되면 안 되는 불용어 */
const COMPANY_STOP_WORDS = [
  '안녕하세요', '구합니다', '모집합니다', '모십니다', '채용합니다',
  '구인', '모집', '채용', '파트타임', '풀타임', '함께', '일하실',
  '직원', '아르바이트', '알바', '경력', '신입',
];

/** 업체명 후보에서 불용어를 제거한 깨끗한 이름만 반환 */
function cleanCompanyName(candidate: string): string {
  let name = candidate
    .replace(/에서$/, '')
    .replace(/업체$/, '')
    .replace(/회사$/, '')
    // 복합 접미사 (중식당 → 중식 제거, 일식당 → 일식 제거 등)
    .replace(/(?:중식|일식|한식|양식|분식)당$/, '')
    .replace(/식당$/, '')
    .replace(/카페$/, '')
    .replace(/마트$/, '')
    .replace(/샵$/, '')
    .replace(/스튜디오$/, '')
    .replace(/레스토랑$/, '')
    .trim();

  // 불용어 제거
  for (const stopWord of COMPANY_STOP_WORDS) {
    const idx = name.indexOf(stopWord);
    if (idx >= 0) {
      name = name.slice(0, idx).trim();
    }
  }

  // 남은 게 너무 짧거나, 괄호/특수문자로만 구성되어 있으면 빈값
  name = name.replace(/^[^가-힣a-zA-Z0-9]+/, '').trim();
  if (name.length < 2) return '';
  if (name.length > 100) name = name.slice(0, 100).trim() + '…';
  return name;
}

function extractCompany(text: string, title: string): string {
  // 제목만 먼저 시도 (title)
  // 1. 제목에서 "[XX] 구인" 패턴
  let titleMatch = title.match(/^\[?([가-힣a-zA-Z0-9\s&.-]+?)\](?:\s|$)/);
  if (titleMatch) {
    const cleaned = cleanCompanyName(titleMatch[1]);
    if (cleaned) return cleaned;
  }

  // 2. 제목에서 "XX에서" 패턴 (제목만)
  titleMatch = title.match(/([가-힣a-zA-Z0-9\s&.-]+?)(?:에서|업체|회사|식당|카페|마트|샵|스튜디오)/);
  if (titleMatch) {
    const cleaned = cleanCompanyName(titleMatch[1]);
    if (cleaned) return cleaned;
  }

  // 3. 본문에서 "XX에서" 패턴 (첫 100자만 - 너무 긴 본문은 노이즈)
  const previewSnippet = text.replace(title, '').trim().slice(0, 100);
  const bodyMatch = previewSnippet.match(/([가-힣a-zA-Z0-9\s&.-]+?)(?:에서|업체|회사|식당|카페|마트|샵|스튜디오|레스토랑)/);
  if (bodyMatch) {
    const cleaned = cleanCompanyName(bodyMatch[1]);
    if (cleaned) return cleaned;
  }

  // 4. 제목 첫 단어 (너무 긴 거나 불용어 제외)
  const firstWord = title.split(/\s+/)[0].replace(/[\[\]●♡■\-=#,]+/g, '').trim();
  if (firstWord.length >= 2 && firstWord.length <= 30
      && !COMPANY_STOP_WORDS.some((w) => firstWord.includes(w))) {
    const cleaned = cleanCompanyName(firstWord);
    if (cleaned) return cleaned;
  }

  return '';
}

// ============================================================
// 시급 추출
// ============================================================
function extractWage(text: string): string | null {
  const patterns = [
    /시급[:\s]*\$?(\d+(?:\.\d+)?)/i,
    /\$(\d+(?:\.\d+)?)\s*\/?\s*(?:시|hour)/i,
    /(?:시급|급여|페이)[:\s]*([\d$,.]+(?:\s*~?\s*[\d$,.]+)?)/i,
    /(\d+)\s*불\s*(?:\+?\s*팁|tips?)/i,
    /시급은?\s*(?:약\s*)?(\d+)/i,
    /(\d{2}\.?\d*)\s*\/\s*hr/i,
  ];

  const result = extractByPattern(text, patterns);
  if (result === null) return null;
  const cleaned = result.replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

// ============================================================
// 지역 추출
// ============================================================
/** 지역명으로 의심되는 단어 중 실제 지역이 아닌 불용어 */
const LOCATION_STOP_WORDS = [
  '안녕하세요', '구합니다', '모집합니다', '모십니다', '채용합니다',
  '만드실', '전문', '함께', '위치해', '소재한', '있는', '알바',
  '직원', '경력', '무관', '주방', '서빙', '홀', '주방장',
  '해있어서', '위치해있', '자리', '구인', '모집', '됩니다',
  '드립니다', '원합니다', '바랍니다', '가능',
];

function extractLocation(text: string, title: string): string | null {
  const knownAreas = [
    '밴쿠버', '버너비', '번나비', '코퀴틀람', '써리', '리치먼드',
    '버나비', '뉴웨스트민스터', '델타', '랭리', '애버츠포드',
    '칠리왁', '포트무디', '포트코퀴틀람', '노스밴쿠버', '웨스트밴쿠버',
    '화이트락', '메이플릿지', '피트메도우즈', '미션', '버논',
    '켈로우나', '나나이모', '빅토리아', '파크빌', '포트앨버니',
    '컴벌랜드', '코모크스', '캠룹스', '프린스조지',
    '다운타운', '다운타운밴쿠버', '메트로타운',
  ];

  const patterns = [
    // "근무지: XX" 패턴
    /(?:근무지|위치|지역|장소|근무\s*지역|place|Location)[:\s]*([가-힣a-zA-Z\s]+?)(?:\s|$|\)|\]|,|\.)/i,
    // "XX 소재/위치"
    /([가-힣]+(?:시|구|군|동|읍|면))\s*(?:소재|위치|지역)/i,
  ];

  // 패턴 기반 추출 시도
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const loc = m[1].trim();
      // 불용어 체크
      if (LOCATION_STOP_WORDS.some((w) => loc.includes(w))) continue;
      if (loc.length >= 2) return loc;
    }
  }

  // 제목/본문에서 알려진 지역명 검색
  const combined = title + ' ' + text;
  const foundAreas: { area: string; index: number }[] = [];
  for (const area of knownAreas) {
    const idx = combined.indexOf(area);
    if (idx >= 0) {
      foundAreas.push({ area, index: idx });
    }
  }
  // 가장 먼저 등장하는 지역명을 반환
  if (foundAreas.length > 0) {
    foundAreas.sort((a, b) => a.index - b.index);
    return foundAreas[0].area;
  }

  return null;
}

// ============================================================
// 단일 게시글 파싱
// ============================================================
function parseItem(
  item: Record<string, unknown>,
  source: SourceConfig,
): HivanJob | null {
  const title = normalizeText(String(item.title ?? ''));
  const rawDate = source.makeDate(item);
  const preview = stripHtml(String(item.preview ?? ''));
  const combined = `${title} ${preview}`;

  // 1. 날짜 필터링
  if (!isToday(rawDate)) return null;

  // 2. 광고 키워드 체크
  if (containsAdKeyword(title) || containsAdKeyword(preview)) {
    console.log(`[hivan/scraper] 🚫 광고 스킵: ${title}`);
    return null;
  }

  // 3. 업체명 추출
  const company = extractCompany(combined, title);

  // 4. 연락처 추출
  const { contact, phone, email } = extractContact(combined);

  // 5. 시급 추출
  const rawWage = extractWage(combined);
  const wage = rawWage ?? null;

  // 6. 지역 추출
  const rawLocation = extractLocation(combined, title);
  const location = rawLocation ?? null;

  // 7. 필수값 검증 (null-safe) — 전화번호는 위에서 이미 검증했으므로 보조 필드만 체크
  if (!company && !wage && !location && !email) {
    console.log(`[hivan/scraper] ⏭️ 부가정보 부족 스킵: ${title}`);
    return null;
  }

  const sourceUrl = source.makeUrl(item);

  return {
    title,
    company,
    description: preview,
    contact,
    phone,
    email,
    wage,
    location,
    source_url: sourceUrl,
    source_name: source.name,
    created_at: rawDate,
  };
}

// ============================================================
// 모든 소스 페이지 순회
// ============================================================
async function crawlSource(source: SourceConfig, maxPages = 5): Promise<HivanJob[]> {
  const allJobs: HivanJob[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const items = await fetchFromSource(source, page);
    if (items.length === 0) break;

    for (const item of items) {
      const parsed = parseItem(item, source);
      if (parsed) allJobs.push(parsed);
    }

    // 수집된 아이템 중에 오늘 날짜가 더 이상 없으면 중단
    const hasTodayItem = items.some((item) => {
      const d = source.makeDate(item);
      return isToday(d);
    });
    if (!hasTodayItem) {
      console.log(`[hivan/scraper] ⏹️ ${source.name}: 오늘 날짜 게시글 없음, 중단`);
      break;
    }
  }

  return allJobs;
}

// ============================================================
// DB 저장
// ============================================================
async function saveToDatabase(jobs: HivanJob[], supabase: AnySupabase): Promise<number> {
  let savedCount = 0;

  for (const job of jobs) {
    // 중복 체크: 같은 source_url이 이미 있는지 확인
    const { data: existing } = await supabase
      .from('job_posts')
      .select('id')
      .eq('source', `hivan-${job.source_name}`)
      .eq('title', job.title)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`[hivan/scraper] ⏭️ 중복 스킵: ${job.title}`);
      continue;
    }

    const { error } = await supabase.from('job_posts').insert({
      title: job.title,
      description: job.description || '',
      location: job.location ?? '',
      company_name: job.company || null,
      contact_phone: job.phone,
      contact_email: job.email,
      source: `hivan-${job.source_name}`,
      source_url: job.source_url,
      status: 'pending_activation',
      employer_id: null,
    });

    if (error) {
      console.error(`[hivan/scraper] ❌ 삽입 실패 (${job.title}):`, error.message);
    } else {
      console.log(`[hivan/scraper] ✅ 삽입 성공: ${job.title}`);
      savedCount++;
    }
  }

  return savedCount;
}

// ============================================================
// 메인 파이프라인
// ============================================================
export async function runHivanPipeline(maxPages = 5): Promise<{
  scraped: number;
  jobs: HivanJob[];
}> {
  console.log('========================================');
  console.log(`[hivan/scraper] 🚀 수집 시작: ${SCRAPE_DATE}`);
  console.log(`[hivan/scraper] 대상 소스: ${SOURCES.map((s) => s.name).join(', ')}`);
  console.log('========================================');

  const allJobs: HivanJob[] = [];

  for (const source of SOURCES) {
    console.log(`\n[hivan/scraper] 📌 소스 처리: ${source.name}`);
    const jobs = await crawlSource(source, maxPages);
    console.log(`[hivan/scraper] 📊 ${source.name}: ${jobs.length}개 수집`);
    allJobs.push(...jobs);
  }

  console.log(`\n[hivan/scraper] 📊 총 수집: ${allJobs.length}개`);

  // DB 저장
  if (allJobs.length > 0) {
    const supabase = requireSupabaseAdmin() as AnySupabase;
    const saved = await saveToDatabase(allJobs, supabase);
    console.log(`[hivan/scraper] 💾 DB 저장 완료: ${saved}/${allJobs.length}개`);
  }

  // JSON 출력 (poster 모듈 연동용)
  const jsonOutput = JSON.stringify(allJobs, null, 2);
  console.log('\n========================================');
  console.log('[hivan/scraper] 📋 수집 데이터 (JSON):');
  console.log(jsonOutput);
  console.log('========================================');

  return { scraped: allJobs.length, jobs: allJobs };
}

// ============================================================
// 데이터만 반환 (DB 저장 없음) - poster 모듈 연동용
// ============================================================
export async function collectHivanJobs(maxPages = 5): Promise<{
  success: boolean;
  count: number;
  jobs: HivanJob[];
  date: string;
  sources: string[];
}> {
  const allJobs: HivanJob[] = [];

  for (const source of SOURCES) {
    const jobs = await crawlSource(source, maxPages);
    allJobs.push(...jobs);
  }

  return {
    success: true,
    count: allJobs.length,
    jobs: allJobs,
    date: SCRAPE_DATE,
    sources: SOURCES.map((s) => s.name),
  };
}