import { requireSupabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

export interface ParsedJob {
  bdId: string
  companyName: string
  contact: string
  title: string
  description: string
  location: string
  category: string
}

type AnySupabase = SupabaseClient

const BASE_URL = 'https://www.vanchosun.com'
const FRAME_URL = `${BASE_URL}/market/main/frame.php`
const AD_KEYWORDS = ['LMIA', 'RCIP', '영주권', '이민', '대행']
const REQUEST_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  referer: `${BASE_URL}/market/main/frame.php?main=job`,
}

function getListUrl(page: number) {
  const url = new URL(FRAME_URL)
  url.searchParams.set('main', 'job')
  url.searchParams.set('cpage1', String(page))
  return url.toString()
}

function getDetailUrl(bdId: string) {
  const url = new URL(FRAME_URL)
  url.searchParams.set('main', 'job')
  url.searchParams.set('bdId', bdId)
  return url.toString()
}

async function fetchHtml(url: string) {
  const response = await fetch(url, { headers: REQUEST_HEADERS })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`)
  }
  return response.text()
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeLabel(value: string) {
  return normalizeText(value).replace(/[:：]$/, '').trim()
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  if (error && typeof error === 'object') {
    if ('message' in error && typeof error.message === 'string') {
      return new Error(error.message)
    }
    return new Error(JSON.stringify(error))
  }
  return new Error(String(error ?? 'Unknown error'))
}

function includesAdKeyword(value: string) {
  return AD_KEYWORDS.some((keyword) => value.includes(keyword))
}

function setField(fields: Map<string, string>, key: string, value: string) {
  const normalizedKey = normalizeLabel(key)
  const normalizedValue = normalizeText(value)

  if (!normalizedKey || !normalizedValue) return
  if (!fields.has(normalizedKey)) fields.set(normalizedKey, normalizedValue)
}

function readBoardClassFields($: cheerio.CheerioAPI, fields: Map<string, string>) {
  let count = 0

  $('td.board_section_frame1').each((_, element) => {
    const key = normalizeLabel($(element).text())
    const value = normalizeText($(element).next('td.board_section_frame2').text())
    if (key && value) {
      setField(fields, key, value)
      count += 1
    }
  })

  if (count === 0) {
    console.warn('[banjosun:parse] selector failed: td.board_section_frame1 + td.board_section_frame2')
  } else {
    console.log(`[banjosun:parse] board_section_frame key-value ${count}개 추출`)
  }
}

function readTableFields($: cheerio.CheerioAPI, fields: Map<string, string>) {
  let count = 0
  const knownLabels = ['업체명', '회사명', '상호', '구인문의', '연락처', '전화', '근무지역', '지역', '모집분야', '직종', '업종', '제목', '직무', '공고명']

  $('tr').each((_, row) => {
    const cells = $(row)
      .children('th,td')
      .map((__, cell) => normalizeText($(cell).text()))
      .get()
      .filter(Boolean)

    for (let index = 0; index < cells.length - 1; index += 1) {
      const key = normalizeLabel(cells[index])
      const value = cells[index + 1]
      if (knownLabels.some((label) => key.includes(label))) {
        setField(fields, key, value)
        count += 1
      }
    }

    cells.forEach((cell) => {
      const inlineMatch = cell.match(/^(.{2,24}?)[\s]*[:：][\s]*(.+)$/)
      if (inlineMatch?.[1] && inlineMatch[2]) {
        setField(fields, inlineMatch[1], inlineMatch[2])
        count += 1
      }
    })
  })

  if (count === 0) {
    console.warn('[banjosun:parse] selector failed: tr > th/td key-value scan')
  } else {
    console.log(`[banjosun:parse] table key-value ${count}개 후보 추출`)
  }
}

function findField(fields: Map<string, string>, labels: string[], bodyText: string) {
  for (const [key, value] of fields) {
    if (labels.some((label) => key.includes(label))) return value
  }

  for (const label of labels) {
    const match = bodyText.match(new RegExp(`${label}\\s*[:：]?\\s*(.{1,120})`))
    if (match?.[1]) return normalizeText(match[1])
  }

  return ''
}

function isInvalidTitle(value: string) {
  const normalized = normalizeText(value)
  return (
    !normalized ||
    normalized === '등록일' ||
    normalized.includes('등록일') ||
    normalized === '제목' ||
    normalized === '구인구직'
  )
}

function firstTextBySelectors($: cheerio.CheerioAPI, selectors: string[], label: string) {
  for (const selector of selectors) {
    const text = normalizeText($(selector).first().text())
    if (text && !isInvalidTitle(text)) {
      console.log(`[banjosun:parse] ${label} selector ok: ${selector}`)
      return text
    }
    console.warn(`[banjosun:parse] ${label} selector empty/invalid: ${selector}`)
  }
  return ''
}

function parseTitle($: cheerio.CheerioAPI, fields: Map<string, string>, bodyText: string) {
  const title =
    firstTextBySelectors(
      $,
      [
        '#cf_middle font[size="3"] b',
        '#cf_middle font b',
        '.title_area',
        '.subject',
        '.board_title',
        'h1',
        'h2',
      ],
      'title',
    ) ||
    findField(fields, ['제목', '공고명', '직무'], bodyText) ||
    normalizeText($('title').first().text())

  if (isInvalidTitle(title)) {
    console.warn(`[banjosun:parse] title fallback applied: invalid title="${title || 'empty'}"`)
    return '제목 없음'
  }

  return title
}

function prepareDetailDom($: cheerio.CheerioAPI) {
  $('script, style, noscript, iframe').remove()
  $('form, nav, header, footer, .ad, .ads, .banner, .list, .paging, .pagination').remove()
  $('table, tr, div').each((_, element) => {
    const text = normalizeText($(element).text())
    const isBoardList =
      text.includes('등록일') &&
      text.includes('조회') &&
      text.includes('제목') &&
      text.match(/bdId=/)

    if (isBoardList) {
      $(element).remove()
    }
  })
}

function isContaminatedDescription(text: string) {
  const normalized = normalizeText(text)
  const listSignals = ['등록일', '조회', '제목', '번호']
  const signalCount = listSignals.filter((signal) => normalized.includes(signal)).length
  const repeatedBdIds = (normalized.match(/bdId=/g) ?? []).length
  const repeatedDates = (normalized.match(/\d{4}-\d{2}-\d{2}/g) ?? []).length

  return signalCount >= 3 || repeatedBdIds >= 2 || repeatedDates >= 8
}

function extractDescription($: cheerio.CheerioAPI, fields: Map<string, string>) {
  const selectors = [
    '#div_overflow',
    '#tr_fontbox #div_overflow',
    '.view_content',
    '#view_content',
    '.board_view .content',
    '.board_view_content',
    '.board_content',
    'td.board_content',
    'td.board_section_content',
    '.view-area',
    '.viewArea',
  ]
  const fieldValues = new Set(Array.from(fields.values()))
  const candidates: { selector: string; text: string }[] = []

  selectors.forEach((selector) => {
    const elements = $(selector)
    if (elements.length === 0) {
      console.warn(`[banjosun:parse] body selector not found: ${selector}`)
      return
    }

    elements.each((_, element) => {
      const clone = $(element).clone()
      clone.find('script, style, noscript, iframe, form, .ad, .ads, .banner, .paging, .pagination').remove()
      const text = normalizeText(clone.text())

      if (isContaminatedDescription(text)) {
        console.warn(`[banjosun:parse] body selector contaminated: ${selector}`)
        return
      }

      if (text.length >= 10 && !fieldValues.has(text)) {
        candidates.push({ selector, text })
      }
    })
  })

  if (candidates.length === 0) {
    console.warn(`[banjosun:parse] body selector candidates empty: ${selectors.join(', ')}`)
    return ''
  }

  candidates.sort((a, b) => b.text.length - a.text.length)
  console.log(
    `[banjosun:parse] body selector ok: ${candidates[0].selector} (${candidates[0].text.length}자)`,
  )
  return candidates[0].text
}

function logMissingFields(sourceUrl: string, missingFields: string[], fields: Map<string, string>) {
  console.warn(
    `[banjosun:parse] SKIP url=${sourceUrl}, missing=${missingFields.join(', ')}, parsedKeys=${Array.from(fields.keys()).join(', ') || '없음'}`,
  )
}

export async function fetchBdIds(page: number): Promise<string[]> {
  const listUrl = getListUrl(page)
  console.log(`[banjosun:list] fetch ${listUrl}`)

  const html = await fetchHtml(listUrl)
  const $ = cheerio.load(html)
  const bdIds: string[] = []

  $('tr.marketListTr.job_findworker a[href*="bdId="]').each((_, element) => {
    const href = $(element).attr('href')
    const title = normalizeText($(element).text())

    if (!href || includesAdKeyword(title)) return

    const url = new URL(href, FRAME_URL)
    const bdId = url.searchParams.get('bdId')
    if (bdId) bdIds.push(bdId)
  })

  const uniqueBdIds = Array.from(new Set(bdIds))
  if (uniqueBdIds.length === 0) {
    console.warn(
      `[banjosun:list] selector failed: tr.marketListTr.job_findworker a[href*="bdId="], url=${listUrl}`,
    )
  } else {
    console.log(`[banjosun:list] page=${page}, bdId=${uniqueBdIds.length}개`)
  }

  return uniqueBdIds
}

export async function fetchAndParseDetail(bdId: string): Promise<ParsedJob | null> {
  const sourceUrl = getDetailUrl(bdId)
  console.log(`[banjosun:detail] fetch bdId=${bdId}, url=${sourceUrl}`)

  const html = await fetchHtml(sourceUrl)
  const $ = cheerio.load(html)
  prepareDetailDom($)

  const fields = new Map<string, string>()
  readBoardClassFields($, fields)
  readTableFields($, fields)

  const bodyText = normalizeText($('body').text())
  const title = parseTitle($, fields, bodyText)
  const description = extractDescription($, fields)
  const companyName = findField(fields, ['업체명', '회사명', '상호'], bodyText)
  const contact = findField(fields, ['구인문의', '연락처', '전화', '문의'], bodyText)
  const location = findField(fields, ['근무지역', '지역', '위치'], bodyText)
  const category = findField(fields, ['모집분야', '직종', '업종', '분야'], bodyText)

  console.log(
    `[banjosun:parse] bdId=${bdId}, title=${title ? 'OK' : '누락'}, body=${description.length}자, company=${companyName ? 'OK' : '누락'}, contact=${contact ? 'OK' : '누락'}`,
  )

  const missingFields = [
    !title || title === '등록일' ? '제목' : '',
    description.length < 10 ? '본문(10자 이상)' : '',
    !companyName ? '업체명' : '',
    !contact ? '구인문의/연락처' : '',
  ].filter(Boolean)

  if (missingFields.length > 0) {
    logMissingFields(sourceUrl, missingFields, fields)
    return null
  }

  return {
    bdId,
    companyName,
    contact,
    title: title === '등록일' ? '제목 없음' : title,
    description,
    location,
    category,
  }
}

const romanizedWords: Record<string, string> = {
  미소: 'miso',
  클린: 'clean',
  홍: 'hong',
  씨: 'ssi',
  네일: 'nail',
}

const choseong = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const jungseong = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const jongseong = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 't', 'l', 'lk', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'p', 'ps', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't']

function romanizeHangulChar(char: string) {
  const code = char.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return char

  const index = code - 0xac00
  const initial = Math.floor(index / 588)
  const medial = Math.floor((index % 588) / 28)
  const final = index % 28

  return `${choseong[initial]}${jungseong[medial]}${jongseong[final]}`
}

export function sanitizeEmailPrefix(companyName: string): string {
  let value = companyName.trim()

  Object.entries(romanizedWords).forEach(([from, to]) => {
    value = value.replaceAll(from, to)
  })

  value = Array.from(value).map(romanizeHangulChar).join('')
  value = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return value || 'company'
}

export function mapCategory(raw: string): string {
  if (raw.includes('카페') || raw.includes('커피')) return '카페'
  if (
    raw.includes('식당') ||
    raw.includes('요식') ||
    raw.includes('주방') ||
    raw.includes('서버') ||
    raw.includes('레스토랑')
  ) {
    return '식당'
  }
  if (raw.includes('네일')) return '네일숍'
  if (raw.includes('편의점') || raw.includes('마트')) return '편의점'
  return '기타'
}

function normalizePhoneForEmail(phone: string) {
  return phone.replace(/\D+/g, '') || 'unknown'
}

export async function activateEmployer(phone: string): Promise<{
  employerId: string
  activatedJobs: number
}> {
  const supabase = requireSupabaseAdmin() as AnySupabase
  const contactPhone = phone.trim()

  if (!contactPhone) {
    throw new Error('전화번호가 필요합니다.')
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('job_posts')
    .select('id, title, contact_phone, employer_id')
    .eq('contact_phone', contactPhone)
    .eq('source', 'banjosun')

  if (jobsError) throw toError(jobsError)
  if (!jobs || jobs.length === 0) {
    throw new Error(`활성화할 밴조선 공고를 찾지 못했습니다. phone=${contactPhone}`)
  }

  const { data: scrapedJob, error: scrapedJobError } = await supabase
    .from('scraped_jobs')
    .select('company_name')
    .eq('employer_phone', contactPhone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (scrapedJobError) throw toError(scrapedJobError)

  const companyName = scrapedJob?.company_name || `밴조선 사장님 ${contactPhone}`
  const email = `employer-${normalizePhoneForEmail(contactPhone)}@hire-van.com`
  let employerId = jobs.find((job) => job.employer_id)?.employer_id as string | undefined

  if (!employerId) {
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    })

    if (userError) throw toError(userError)
    employerId = userData.user?.id
    if (!employerId) throw new Error('employer 계정 UUID를 생성하지 못했습니다.')

    const { error: insertError } = await supabase.from('profiles').insert({
      id: employerId,
      role: 'employer',
      is_temp_account: false,
      name: companyName,
    })

    if (insertError) throw toError(insertError)
  }

  const { error: updateJobsError } = await supabase
    .from('job_posts')
    .update({
      employer_id: employerId,
      status: 'open',
    })
    .eq('contact_phone', contactPhone)
    .eq('source', 'banjosun')

  if (updateJobsError) throw toError(updateJobsError)

  const { error: updateScrapedJobsError } = await supabase
    .from('scraped_jobs')
    .update({ employer_id: employerId })
    .eq('employer_phone', contactPhone)

  if (updateScrapedJobsError) throw toError(updateScrapedJobsError)

  console.log(
    `[banjosun:activate] phone=${contactPhone}, employer_id=${employerId}, jobs=${jobs.length}`,
  )

  return {
    employerId,
    activatedJobs: jobs.length,
  }
}

export async function runPipeline(
  pages = 2,
): Promise<{ inserted: number; skipped: number; errors: number }> {
  const supabase = requireSupabaseAdmin() as AnySupabase
  const result = { inserted: 0, skipped: 0, errors: 0 }

  for (let page = 1; page <= pages; page += 1) {
    const bdIds = await fetchBdIds(page)

    for (const bdId of bdIds) {
      let title = bdId

      try {
        const sourceUrl = getDetailUrl(bdId)
        const parsed = await fetchAndParseDetail(bdId)
        if (!parsed) {
          console.log(`⏭️ 스킵: ${bdId} (파싱 실패)`)
          result.skipped += 1
          continue
        }

        if (parsed.title === '등록일' || !parsed.description) {
          console.warn(
            `[banjosun:pipeline] DB 삽입 전 검증 실패: bdId=${bdId}, title=${parsed.title}, description=${parsed.description ? 'OK' : 'empty'}`,
          )
          result.skipped += 1
          continue
        }

        const { data: existing, error: existingError } = await supabase
          .from('scraped_jobs')
          .select('id, title')
          .eq('source_url', sourceUrl)
          .maybeSingle()

        if (existingError) throw toError(existingError)
        const hasDirtyExistingScrapedJob = existing?.title === '등록일'

        if (existing && !hasDirtyExistingScrapedJob) {
          console.log(`⏭️ 스킵: ${existing.title ?? bdId} (중복)`)
          result.skipped += 1
          continue
        }
        if (hasDirtyExistingScrapedJob) {
          console.warn(
            `[banjosun:pipeline] 기존 오염 데이터 감지: source_url=${sourceUrl}, 새 title=${parsed.title}. 재삽입을 진행합니다.`,
          )
        }

        title = parsed.title
        console.log(
          `[banjosun:pipeline] 계정 생성 생략: employer_id=null, status=pending_activation, title=${parsed.title}`,
        )

        const scrapedJobPayload = {
          title: parsed.title,
          company_name: parsed.companyName,
          neighborhood: parsed.location,
          source_url: sourceUrl,
          employer_phone: parsed.contact,
          employer_id: null,
        }

        const { error: scrapedError } = hasDirtyExistingScrapedJob
          ? await supabase.from('scraped_jobs').update(scrapedJobPayload).eq('id', existing.id)
          : await supabase.from('scraped_jobs').insert(scrapedJobPayload)

        if (scrapedError) throw toError(scrapedError)

        const jobPostPayload = {
          employer_id: null,
          title: parsed.title,
          description: parsed.description,
          location: parsed.location,
          category: mapCategory(parsed.category),
          contact_phone: parsed.contact,
          source: 'banjosun',
          status: 'pending_activation',
        }

        const { data: dirtyJobPost, error: dirtyJobPostError } = await supabase
          .from('job_posts')
          .select('id')
          .eq('source', 'banjosun')
          .eq('title', '등록일')
          .eq('contact_phone', parsed.contact)
          .limit(1)
          .maybeSingle()

        if (dirtyJobPostError) throw toError(dirtyJobPostError)

        const { error: jobPostError } = dirtyJobPost
          ? await supabase.from('job_posts').update(jobPostPayload).eq('id', dirtyJobPost.id)
          : await supabase.from('job_posts').insert(jobPostPayload)

        if (jobPostError) throw toError(jobPostError)

        console.log(
          `✅ DB ${dirtyJobPost ? '정정' : '삽입'} 완료: ${parsed.title} (pending_activation)`,
        )
        result.inserted += 1
      } catch (error) {
        const normalizedError = toError(error)
        console.error(`❌ 오류: ${title} (${normalizedError.message})`)
        result.errors += 1
      }
    }
  }

  return result
}
