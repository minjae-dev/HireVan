import { sendSMS } from '@/lib/sms';
import { requireSupabaseAdmin } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
export interface ParsedJob {
  bdId: string
  companyName: string
  contact: string
  contact_phone: string | null
  contact_email: string | null
  title: string
  description: string
  location: string
  category: string
}

type AnySupabase = SupabaseClient

const BASE_URL = 'https://www.vanchosun.com'
const FRAME_URL = `${BASE_URL}/market/main/frame.php`
const AD_KEYWORDS = ['LMIA', 'RCIP', '영주권', '이민', '대행']

// [추가] 이메일/전화번호 분리 유틸리티
function extractContactInfo(text: string) {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  const phoneMatch = text.match(/\d{3}[-.]?\d{3}[-.]?\d{4}|\d{3}[-.]?\d{4}/)
  return {
    email: emailMatch ? emailMatch[0] : null,
    phone: phoneMatch ? phoneMatch[0] : null
  }
}

function getListUrl(page: number) {
  const url = new URL(FRAME_URL)
  url.searchParams.set('main', 'job')
  url.searchParams.set('cpage1', String(page))
  return url.toString()
}

function getDetailUrl(bdId: string) {
  const url = new URL(FRAME_URL)
  url.searchParams.set('bdId', bdId)
  return url.toString()
}

async function fetchHtml(url: string): Promise<string> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY || '93K3RSMRWTK55YOTF3GSYYC0TJM6C5TPGY49SYSMMAD0F9FEN8LWX0UKPPGHBZT0222THDZAEDH3S0B0';
  const targetUrl = url;
  const scrapingbeeUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(targetUrl)}&render_js=true&device=desktop&block_ads=true&timeout=10000&wait_for=3000`;
  
  const response = await fetch(scrapingbeeUrl);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[scraper] ScrapingBee Error Status: ${response.status}`);
    console.error(`[scraper] ScrapingBee Error Body: ${errorBody}`);
    throw new Error(`ScrapingBee failed with status ${response.status}: ${url}`)
  }
  return response.text()
}


function normalizeText(value: string) { return value.replace(/\s+/g, ' ').trim() }
function normalizeLabel(value: string) { return normalizeText(value).replace(/[:：]$/, '').trim() }
function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(String(error ?? 'Unknown error'))
}
function includesAdKeyword(value: string) { return AD_KEYWORDS.some((keyword) => value.includes(keyword)) }
function setField(fields: Map<string, string>, key: string, value: string) {
  const normalizedKey = normalizeLabel(key)
  const normalizedValue = normalizeText(value)
  if (!normalizedKey || !normalizedValue) return
  if (!fields.has(normalizedKey)) fields.set(normalizedKey, normalizedValue)
}

function readBoardClassFields($: cheerio.CheerioAPI, fields: Map<string, string>) {
  $('td.board_section_frame1').each((_, element) => {
    const key = normalizeLabel($(element).text())
    const value = normalizeText($(element).next('td.board_section_frame2').text())
    if (key && value) setField(fields, key, value)
  })
}

function readTableFields($: cheerio.CheerioAPI, fields: Map<string, string>) {
  const knownLabels = ['업체명', '회사명', '상호', '구인문의', '연락처', '전화', '근무지역', '지역', '모집분야', '직종', '업종', '제목', '직무', '공고명']
  $('tr').each((_, row) => {
    const cells = $(row).children('th,td').map((__, cell) => normalizeText($(cell).text())).get().filter(Boolean)
    for (let index = 0; index < cells.length - 1; index += 1) {
      const key = normalizeLabel(cells[index])
      if (knownLabels.some((label) => key.includes(label))) setField(fields, key, cells[index + 1])
    }
  })
}

function findField(fields: Map<string, string>, labels: string[], bodyText: string) {
  for (const [key, value] of fields) { if (labels.some((label) => key.includes(label))) return value }
  for (const label of labels) {
    const match = bodyText.match(new RegExp(`${label}\\s*[:：]?\\s*(.{1,120})`))
    if (match?.[1]) return normalizeText(match[1])
  }
  return ''
}

function parseTitle($: cheerio.CheerioAPI, fields: Map<string, string>, bodyText: string) {
  const title = findField(fields, ['제목', '공고명', '직무'], bodyText) || normalizeText($('title').first().text())
  return title === '등록일' ? '제목 없음' : title
}

function prepareDetailDom($: cheerio.CheerioAPI) {
  $('script, style, noscript, iframe, form, nav, header, footer, .ad, .ads, .banner, .list, .paging, .pagination').remove()
}

function extractDescription($: cheerio.CheerioAPI, fields: Map<string, string>) {
  const selector = '.view_content, #view_content, .board_content, td.board_content'
  return normalizeText($(selector).first().text())
}

export async function fetchBdIds(page: number): Promise<string[]> {
  const html = await fetchHtml(getListUrl(page))
  const $ = cheerio.load(html)
  const bdIds: string[] = []

  $('tr.marketListTr.job_findworker a[href*="bdId="]').each((_, element) => {
    const url = new URL($(element).attr('href')!, FRAME_URL)
    const bdId = url.searchParams.get('bdId')
    if (bdId && !includesAdKeyword(bdId)) bdIds.push(bdId)
  })
  return Array.from(new Set(bdIds))
}

export async function fetchAndParseDetail(bdId: string): Promise<ParsedJob | null> {
  const html = await fetchHtml(getDetailUrl(bdId))
  const $ = cheerio.load(html)
  prepareDetailDom($)
  const fields = new Map<string, string>()
  readBoardClassFields($, fields)
  readTableFields($, fields)
  const bodyText = normalizeText($('body').text())
  
  const title = parseTitle($, fields, bodyText)
  const description = extractDescription($, fields)
  const contact = findField(fields, ['구인문의', '연락처', '전화', '문의'], bodyText)
  
  const contactInfo = extractContactInfo(contact + " " + bodyText)
  
  if (!description || description.length < 10) return null

  return {
    bdId, 
    companyName: findField(fields, ['업체명', '회사명', '상호'], bodyText),
    contact, 
    contact_phone: contactInfo.phone, 
    contact_email: contactInfo.email,
    title, 
    description, 
    location: findField(fields, ['근무지역', '지역', '위치'], bodyText),
    category: findField(fields, ['모집분야', '직종', '업종', '분야'], bodyText)
  }
}

export function mapCategory(raw: string): string {
  if (raw.includes('카페') || raw.includes('커피')) return '카페'
  if (raw.includes('식당') || raw.includes('요식') || raw.includes('주방') || raw.includes('서버') || raw.includes('레스토랑')) return '식당'
  if (raw.includes('네일')) return '네일숍'
  if (raw.includes('편의점') || raw.includes('마트')) return '편의점'
  return '기타'
}

export async function runPipeline(pages = 2) {
  const supabase = requireSupabaseAdmin() as AnySupabase
  const newJobs: { title: string; contact_phone: string | null }[] = []

  for (let page = 1; page <= pages; page += 1) {
    const bdIds = await fetchBdIds(page)
  for (const bdId of bdIds) {
    let parsed: ParsedJob | null = null
    try {
      parsed = await fetchAndParseDetail(bdId)
    } catch (error) {
      console.warn(`[scraper] 게시글 ${bdId} 로드 실패, 건너뜁니다.`)
      continue
    }
    if (!parsed) continue

      const { data: existing } = await supabase
        .from('job_posts')
        .select('id')
        .eq('source', 'banjosun')
        .eq('title', parsed.title)
        .limit(1)

      if (existing && existing.length > 0) {
        console.log(`⏭️ 중복 스킵: ${parsed.title}`)
        continue
      }

      const { error } = await supabase.from('job_posts').insert({
        title: parsed.title,
        description: parsed.description,
        location: parsed.location,
        category: mapCategory(parsed.category),
        company_name: parsed.companyName || null,
        contact_phone: parsed.contact_phone, 
        contact_email: parsed.contact_email,
        source: 'banjosun',
        status: 'pending_activation',
        employer_id: null
      })

      if (error) {
        console.error(`❌ 삽입 실패 (${parsed.title}):`, error.message)
      } else {
        console.log(`✅ 삽입 성공: ${parsed.title}`)
        newJobs.push({ title: parsed.title, contact_phone: parsed.contact_phone })
      }
    }
  }

  console.log(`[scraper] 수집 완료: 총 ${newJobs.length}개 신규 공고`)
  for (const job of newJobs) {
    if (job.contact_phone) {
      const smsBody = `[HireVan] 새로운 구인공고가 등록되었습니다: "${job.title}"`
      const result = await sendSMS({ to: job.contact_phone, body: smsBody })
      if (result.ok) {
        console.log(`📱 SMS 발송 성공: ${job.contact_phone} ← ${job.title}`)
      } else {
        console.log(`⚠️ SMS 발송 생략 (환경변수 미설정 또는 오류): ${job.contact_phone}`)
      }
    }
  }

  return { scraped: newJobs.length, jobs: newJobs }
}