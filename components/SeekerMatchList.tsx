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
 *
 * 인증 가드:
 *   - RPC는 `auth.uid()`가 NULL이면 'unauthorized'로 실패한다.
 *   - supabase-js는 자동으로 Bearer 헤더를 붙이지만, 페이지 첫 진입 직후
 *     세션 하이드레이션이 늦으면 anon 상태로 호출되어 401이 난다.
 *   - 따라서 호출 직전에 `getSession()`으로 세션 확인 후 없으면 로그인 페이지로,
 *     있으면 한 번 더 보장한 뒤 RPC를 호출한다.
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
      // 1) 세션 가드: 로그인되지 않은 상태에서 RPC를 호출하면
      //    Postgres 측에서 'unauthorized' 예외가 발생한다.
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr) {
        setError('세션 확인 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.')
        return
      }
      if (!sessionData.session?.user) {
        setError('로그인이 필요해요. 다시 로그인해주세요.')
        return
      }

      // 2) RPC 호출 (supabase-js 가 Authorization 헤더를 자동 부착)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcError } = await (supabase as any).rpc('match_seekers_to_job', {
        p_job_id: jobId,
      })
      if (rpcError) {
        const msg = rpcError.message ?? 'Unknown error'
        setError(msg)
        // 권한/매칭 사유별 업셀 트리거
        if (msg.includes('pro_required') || msg.includes('unauthorized')) {
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
