<<<<<<< HEAD
import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the page.tsx file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={16}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
=======
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
>>>>>>> 3f45f245777d09941b1fd3d5a9bc48a1cc8df28b
}
