'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { SeekerMatch } from '@/lib/database.types'
import BlurredSeekerCard from './BlurredSeekerCard'
import ProUpsellModal from './ProUpsellModal'
import { useSeekerAccess } from '@/lib/useSeekerAccess'

interface SeekerMatchListProps {
  jobId: string
}

/**
 * SeekerMatchList
 *
 * 특정 공고에 대한 매칭 추천 구직자 목록을 보여주는 컴포넌트.
 * - `match_seekers_to_job` RPC를 호출해 점수순 정렬
 * - PRO 구독자만 사용 가능 (RPC 자체가 권한 체크)
 * - 카드 클릭 시 useSeekerAccess 로 상세 열람 시도
 *   - 크레딧 부족하면 ProUpsellModal 표시
 */
export default function SeekerMatchList({ jobId }: SeekerMatchListProps) {
  const [matches, setMatches] = useState<SeekerMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [upsellOpen, setUpsellOpen] = useState(false)

  const access = useSeekerAccess()

  const runMatch = async () => {
    setLoading(true)
    setError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase as any).rpc('match_seekers_to_job', {
        p_job_id: jobId,
      })
      if (rpcError) {
        setError(rpcError.message)
        // PRO 권한이 없으면 업셀 모달 오픈
        if (rpcError.message?.includes('pro_required')) {
          setUpsellOpen(true)
        }
      } else {
        setMatches((data as SeekerMatch[]) ?? [])
        setSearched(true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleCardClick = async (seekerId: string) => {
    await access.open(seekerId)
    if (access.status === 'blocked') {
      setUpsellOpen(true)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-900">🎯 매칭 추천 구직자</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            요일 · 자격증 조건이 가장 잘 맞는 순서로 표시됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={runMatch}
          disabled={loading}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {loading ? '분석 중...' : searched ? '🔄 다시 분석' : '🎯 매칭 보기'}
        </button>
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {!searched && !loading && !error && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-3xl">🔍</p>
          <p className="mt-2 text-sm font-semibold text-gray-700">
            &ldquo;매칭 보기&rdquo; 버튼을 눌러 추천 구직자를 받아보세요
          </p>
          <p className="mt-1 text-xs text-gray-500">
            PRO 플랜에서만 사용 가능한 기능이에요.
          </p>
        </div>
      )}

      {searched && matches.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-3xl">😶</p>
          <p className="mt-2 text-sm font-semibold text-gray-700">
            매칭되는 구직자가 아직 없어요
          </p>
          <p className="mt-1 text-xs text-gray-500">
            매칭 조건을 변경하거나, 조금 더 기다려보세요.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {matches.map(match => (
          <MatchCardWrapper
            key={match.seeker_id}
            match={match}
            onClick={() => handleCardClick(match.seeker_id)}
          />
        ))}
      </div>

      <ProUpsellModal
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        reason={access.reason === 'no_credit' ? 'no_credit' : 'pro_required'}
        featureLabel="스마트 매칭 추천"
      />
    </div>
  )
}

function MatchCardWrapper({
  match,
  onClick,
}: {
  match: SeekerMatch
  onClick: () => void
}) {
  // Match RPC는 기본 필드만 반환하므로, 카드용 최소 객체 구성
  // 실제 상세는 카드 클릭 시 view_seeker_profile RPC가 다시 마스킹 해제
  return (
    <BlurredSeekerCard
      seeker={{
        id: match.seeker_id,
        name: match.name,
        avatar_url: null,
        bio: null,
        // 매칭 결과로 받은 메타데이터를 표시
        neighborhood: null,
        has_sir: match.matched_certs.some(c => c.toLowerCase().includes('sir')) ? true : null,
        has_foodsafe: match.matched_certs.some(c => c.toLowerCase().includes('foodsafe')) ? true : null,
        english_level: null,
        visa_status: null,
        visa_type: null,
        visa_expiry: null,
        availability: null,
      }}
      canViewForFree={false}
      interactive
      onUnlockClick={onClick}
    />
  )
}
