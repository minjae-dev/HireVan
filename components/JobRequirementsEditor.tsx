'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

interface Certificate {
  id: string
  code: string
  label_ko: string
  category: string
}

interface JobRequirementsEditorProps {
  jobId: string
  onChange?: (state: { dirty: boolean; preferredDays: string[]; requiredCertIds: string[] }) => void
}

const DAY_OPTIONS: { key: string; label: string }[] = [
  { key: 'monday', label: '월' },
  { key: 'tuesday', label: '화' },
  { key: 'wednesday', label: '수' },
  { key: 'thursday', label: '목' },
  { key: 'friday', label: '금' },
  { key: 'saturday', label: '토' },
  { key: 'sunday', label: '일' },
]

/**
 * JobRequirementsEditor
 *
 * employer가 구인글 작성 시 사용하는 "선호 요일 + 필수 자격증" 편집 컴포넌트.
 * job_post_requirements 테이블의 한 row를 관리한다.
 *
 * - PRO 구독자만 매칭 알림을 받지만, 요구사항 입력은 FREE 사용자도 가능
 *   (요구사항을 입력해두면 PRO 업그레이드 시점부터 매칭이 시작됨)
 * - 저장 시 job_post_requirements 테이블에 upsert
 */
export default function JobRequirementsEditor({ jobId, onChange }: JobRequirementsEditorProps) {
  const { profile } = useAuth()
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [preferredDays, setPreferredDays] = useState<string[]>([])
  const [requiredCertIds, setRequiredCertIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initial, setInitial] = useState({ days: [] as string[], certs: [] as string[] })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 1) 자격증 마스터
      const { data: certs } = await supabase
        .from('certificates')
        .select('id, code, label_ko, category')
        .order('category', { ascending: true })
        .order('label_ko', { ascending: true })

      if (cancelled) return
      setCertificates((certs as Certificate[]) ?? [])

      // 2) 현재 공고의 요구사항
      const { data: req } = await supabase
        .from('job_post_requirements')
        .select('preferred_days, required_certificate_ids')
        .eq('job_id', jobId)
        .maybeSingle()

      if (cancelled) return
      const days = ((req as { preferred_days?: string[] } | null)?.preferred_days ?? []) as string[]
      const certIds = ((req as { required_certificate_ids?: string[] } | null)?.required_certificate_ids ?? []) as string[]
      setPreferredDays(days)
      setRequiredCertIds(certIds)
      setInitial({ days, certs: certIds })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [jobId])

  const isDirty =
    preferredDays.join(',') !== initial.days.join(',') ||
    requiredCertIds.join(',') !== initial.certs.join(',')

  useEffect(() => {
    onChange?.({ dirty: isDirty, preferredDays, requiredCertIds })
  }, [isDirty, preferredDays, requiredCertIds, onChange])

  const toggleDay = (day: string) => {
    setPreferredDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
  }

  const toggleCert = (id: string) => {
    setRequiredCertIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  const handleSave = async () => {
    if (!profile || profile.role !== 'employer') return
    setSaving(true)
    setError(null)
    setSaved(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
      .from('job_post_requirements')
      .upsert(
        {
          job_id: jobId,
          preferred_days: preferredDays,
          preferred_shifts: [],
          required_certificate_ids: requiredCertIds,
        },
        { onConflict: 'job_id' },
      )

    if (upsertError) {
      setError(upsertError.message)
    } else {
      setInitial({ days: preferredDays, certs: requiredCertIds })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
        매칭 조건 불러오는 중...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* 요일 선택 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-800">선호 근무 요일</label>
          <span className="text-[11px] text-gray-500">{preferredDays.length}일 선택</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map(d => {
            const active = preferredDays.includes(d.key)
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                aria-pressed={active}
                className={`h-10 w-10 rounded-full border-2 text-sm font-bold transition-all active:scale-95 ${
                  active
                    ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                }`}
              >
                {d.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          💡 이 요일에 일할 수 있는 구직자만 매칭 알림으로 추천됩니다.
        </p>
      </div>

      {/* 자격증 선택 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-800">필수 자격증</label>
          <span className="text-[11px] text-gray-500">{requiredCertIds.length}개 선택</span>
        </div>
        {certificates.length === 0 ? (
          <p className="text-xs text-gray-400">자격증 마스터 데이터가 비어 있어요.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(
              certificates.reduce<Record<string, Certificate[]>>((acc, c) => {
                if (!acc[c.category]) acc[c.category] = []
                acc[c.category].push(c)
                return acc
              }, {}),
            ).map(([cat, list]) => {
              const CAT_LABEL: Record<string, string> = {
                liquor: '🍷 주류',
                food: '🥗 식품',
                safety: '🛟 안전',
                general: '기타',
              }
              return (
                <div key={cat}>
                  <p className="mb-1.5 text-[11px] font-semibold text-gray-500">
                    {CAT_LABEL[cat] ?? cat}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map(cert => {
                      const active = requiredCertIds.includes(cert.id)
                      return (
                        <button
                          key={cert.id}
                          type="button"
                          onClick={() => toggleCert(cert.id)}
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
              )
            })}
          </div>
        )}
      </div>

      {/* 저장 */}
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}
      {saved && (
        <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
          ✅ 저장되었어요. PRO 구독자에게 매칭 알림이 전송됩니다.
        </p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={!isDirty || saving}
        className="w-full rounded-2xl py-3 text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: 'var(--brand)' }}
      >
        {saving ? '저장 중...' : isDirty ? '매칭 조건 저장' : '저장됨'}
      </button>
    </div>
  )
}
