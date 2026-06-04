'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Certificate {
  id: string
  code: string
  label_ko: string
  label_en: string
  category: string
}

interface CertificateTogglesProps {
  /** 보유한 certificate id 배열 */
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

/**
 * CertificateToggles
 *
 * 구직자 프로필의 자격증 보유 여부 토글 컴포넌트.
 * certificates 마스터 테이블에서 목록을 가져와 토글 UI를 표시하고,
 * seeker_certificates 테이블에 (seeker_id, certificate_id) 행을 관리한다.
 *
 * - 카테고리별로 그룹핑 (liquor / food / safety / ...)
 * - 토글 시점에 별도 API 호출 없이 부모의 selectedIds 상태만 갱신
 *   → 부모가 supabase upsert를 일괄 처리 (페이지 레벨 최적화)
 */
export default function CertificateToggles({ selectedIds, onChange }: CertificateTogglesProps) {
  const [list, setList] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: fetchError } = await supabase
        .from('certificates')
        .select('id, code, label_ko, label_en, category')
        .order('category', { ascending: true })
        .order('label_ko', { ascending: true })

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setList((data as Certificate[]) ?? [])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(x => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        자격증 목록 불러오는 중...
      </div>
    )
  }

  if (error) {
    return <p className="text-xs text-red-500">자격증 목록을 불러오지 못했어요: {error}</p>
  }

  // 카테고리별 그룹
  const byCategory = list.reduce<Record<string, Certificate[]>>((acc, cert) => {
    if (!acc[cert.category]) acc[cert.category] = []
    acc[cert.category].push(cert)
    return acc
  }, {})

  const CATEGORY_LABEL: Record<string, string> = {
    liquor: '🍷 주류 서비스',
    food: '🥗 식품 위생',
    safety: '🛟 안전 / 응급',
    general: '기타',
  }

  return (
    <div className="space-y-4">
      {Object.entries(byCategory).map(([cat, certs]) => (
        <div key={cat}>
          <p className="mb-2 text-xs font-semibold text-gray-500">
            {CATEGORY_LABEL[cat] ?? cat}
          </p>
          <div className="flex flex-wrap gap-2">
            {certs.map(cert => {
              const active = selectedIds.includes(cert.id)
              return (
                <button
                  key={cert.id}
                  type="button"
                  onClick={() => toggle(cert.id)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all active:scale-95 ${
                    active
                      ? 'border-green-300 bg-green-50 text-green-800'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {active ? '✓ ' : '+ '}
                  {cert.label_ko}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
