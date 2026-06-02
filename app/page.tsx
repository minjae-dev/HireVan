'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

export default function HomePage() {
  const { user, profile } = useAuth()

  return (
    <div>
      {/* Hero */}
      <section className="text-center py-12 px-2">
        <div
          className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-4 text-white"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          밴쿠버 한인 구인구직
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">
          일 찾는 워홀러 ×<br />사람 찾는 한인 업체
        </h1>
        <p className="text-gray-500 text-base mb-8">
          구인글 올리고, 지원하고, 바로 채팅으로 연결되는<br className="hidden sm:block" />
          밴쿠버 한인 특화 구인구직 플랫폼
        </p>

        {user && profile ? (
          <div className="flex flex-col gap-3 items-center">
            {profile.role === 'employer' ? (
              <Link
                href="/jobs/new"
                className="inline-block text-white font-semibold text-base px-8 py-3 rounded-full transition-all active:scale-95"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                구인글 올리기
              </Link>
            ) : (
              <Link
                href="/jobs"
                className="inline-block text-white font-semibold text-base px-8 py-3 rounded-full transition-all active:scale-95"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                구인글 보기
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 items-center sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="inline-block text-white font-semibold text-base px-8 py-3 rounded-full transition-all active:scale-95"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              무료로 시작하기
            </Link>
            <Link
              href="/jobs"
              className="inline-block text-gray-700 font-medium text-base px-8 py-3 rounded-full border border-gray-300 bg-white transition-all hover:border-gray-400 active:scale-95"
            >
              구인글 둘러보기
            </Link>
          </div>
        )}
      </section>

      {/* Feature cards */}
      <section className="grid grid-cols-1 gap-4 mb-8">
        <FeatureCard
          icon="💼"
          title="구인글 등록"
          desc="업체 정보와 근무 조건을 입력하면 워홀러들에게 바로 노출됩니다."
        />
        <FeatureCard
          icon="🔍"
          title="일자리 탐색"
          desc="지역·업종별로 필터링해서 나에게 맞는 일자리를 찾아보세요."
        />
        <FeatureCard
          icon="💬"
          title="바로 채팅 연결"
          desc="지원하면 업체와 실시간 채팅으로 빠르게 소통할 수 있어요."
        />
        <FeatureCard
          icon="⭐"
          title="상호 후기 시스템"
          desc="면접 후 서로 후기를 남겨 신뢰도를 쌓아가세요."
        />
      </section>

      <div className="text-center py-8">
        <p className="text-sm text-gray-400">밴쿠버 한인 커뮤니티를 위한 플랫폼</p>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 flex gap-4 items-start">
      <div className="text-2xl mt-0.5">{icon}</div>
      <div>
        <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}
