import * as cheerio from 'cheerio'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSupabaseAdmin } from '@/lib/supabase-admin'

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

const BOARD_API_URL = 'https://www.vanchosun.com/api/boards'
const DETAIL_URL =
  'https://www.vanchosun.com/market/main/frame.php?main=job&boardId=7&bdId='
const AD_KEYWORDS = ['LMIA', 'RCIP', '영주권', '이민', '대행']

function getDetailUrl(bdId: string) {
  return `${DETAIL_URL}${encodeURIComponent(bdId)}`
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeLabel(value: string) {
  return normalizeText(value).replace(/[:：]$/, '')
}

function includesAdKeyword(value: unknown) {
  const text = String(value ?? '')
  return AD_KEYWORDS.some((keyword) => text.includes(keyword))
}

function collectBdIds(value: unknown, result: string[] = []): string[] {
  if (!value || typeof value !== 'object') return result

  if (Array.isArray(value)) {
    value.forEach((item) => collectBdIds(item, result))
    return result
  }

  const record = value as Record<string, unknown>
  if (!includesAdKeyword(JSON.stringify(record)) && record.bdId != null) {
    result.push(String(record.bdId))
  }

  Object.values(record).forEach((item) => collectBdIds(item, result))
  return result
}

export async function fetchBdIds(page: number): Promise<string[]> {
  const url = `${BOARD_API_URL}?main=job&boardId=7&page=${page}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`밴조선 목록 API 오류: ${response.status}`)
  }

  const data = await response.json()
  return Array.from(new Set(collectBdIds(data)))
}

export async function fetchAndParseDetail(bdId: string): Promise<ParsedJob | null> {
  const response = await fetch(getDetailUrl(bdId))

  if (!response.ok) {
    throw new Error(`밴조선 상세 페이지 오류: ${response.status}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)
  const fields = new Map<string, string>()

  $('td.board_section_frame1').each((_, element) => {
    const key = normalizeLabel($(element).text())
    const value = normalizeText($(element).next('td.board_section_frame2').text())
    if (key) fields.set(key, value)
  })

  const companyName = fields.get('업체명') ?? ''
  const contact = fields.get('구인문의') ?? ''
  const title =
    normalizeText($('title').first().text()) ||
    fields.get('제목') ||
    fields.get('공고명') ||
    ''
  const location = fields.get('근무지역') ?? ''
  const category = fields.get('모집분야') ?? ''
  const description = normalizeText(
    $('td.board_section_frame2')
      .last()
      .text() || $('body').text(),
  )

  if (!companyName || !contact || description.length < 10) {
    return null
  }

  return {
    bdId,
    companyName,
    contact,
    title,
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

const choseong = [
  'g',
  'kk',
  'n',
  'd',
  'tt',
  'r',
  'm',
  'b',
  'pp',
  's',
  'ss',
  '',
  'j',
  'jj',
  'ch',
  'k',
  't',
  'p',
  'h',
]
const jungseong = [
  'a',
  'ae',
  'ya',
  'yae',
  'eo',
  'e',
  'yeo',
  'ye',
  'o',
  'wa',
  'wae',
  'oe',
  'yo',
  'u',
  'wo',
  'we',
  'wi',
  'yu',
  'eu',
  'ui',
  'i',
]
const jongseong = [
  '',
  'k',
  'k',
  'ks',
  'n',
  'nj',
  'nh',
  't',
  'l',
  'lk',
  'lm',
  'lb',
  'ls',
  'lt',
  'lp',
  'lh',
  'm',
  'p',
  'ps',
  't',
  't',
  'ng',
  't',
  't',
  'k',
  't',
  'p',
  't',
]

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

export async function upsertTempEmployerAccount(companyName: string): Promise<string> {
  const supabase = requireSupabaseAdmin() as AnySupabase
  const email = `${sanitizeEmailPrefix(companyName)}@hire-van.com`

  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (profileError) throw profileError
  if (existingProfile?.id) return existingProfile.id

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) throw new Error('임시 employer 계정 UUID를 생성하지 못했습니다.')

  const { error: insertError } = await supabase.from('profiles').insert({
    id: userId,
    email,
    role: 'employer',
    is_temp_account: true,
    name: companyName,
  })

  if (insertError) throw insertError
  return userId
}

export async function runPipeline(
  pages: number,
): Promise<{ inserted: number; skipped: number; errors: number }> {
  const supabase = requireSupabaseAdmin() as AnySupabase
  const result = { inserted: 0, skipped: 0, errors: 0 }

  for (let page = 1; page <= pages; page += 1) {
    const bdIds = await fetchBdIds(page)

    for (const bdId of bdIds) {
      let title = bdId

      try {
        const sourceUrl = getDetailUrl(bdId)
        const { data: existing, error: existingError } = await supabase
          .from('scraped_jobs')
          .select('id, title')
          .eq('source_url', sourceUrl)
          .maybeSingle()

        if (existingError) throw existingError
        if (existing) {
          console.log(`⏭️ 스킵: ${existing.title ?? bdId} (중복)`)
          result.skipped += 1
          continue
        }

        const parsed = await fetchAndParseDetail(bdId)
        if (!parsed) {
          console.log(`⏭️ 스킵: ${bdId} (필수 항목 누락)`)
          result.skipped += 1
          continue
        }

        title = parsed.title
        const employerId = await upsertTempEmployerAccount(parsed.companyName)

        const { error: scrapedError } = await supabase.from('scraped_jobs').insert({
          title: parsed.title,
          company_name: parsed.companyName,
          neighborhood: parsed.location,
          source_url: sourceUrl,
          employer_phone: parsed.contact,
          employer_id: employerId,
        })

        if (scrapedError) throw scrapedError

        const { error: jobPostError } = await supabase.from('job_posts').insert({
          employer_id: employerId,
          title: parsed.title,
          description: parsed.description,
          location: parsed.location,
          category: mapCategory(parsed.category),
          contact_phone: parsed.contact,
          source: 'banjosun',
          status: 'open',
        })

        if (jobPostError) throw jobPostError

        console.log(`✅ 삽입: ${parsed.title}`)
        result.inserted += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`❌ 오류: ${title} (${message})`)
        result.errors += 1
      }
    }
  }

  return result
}
