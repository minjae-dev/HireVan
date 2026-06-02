'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function Navbar() {
  const { user, profile, signOut, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg" style={{ color: 'var(--brand)' }}>
          HireVan
        </Link>

        {loading ? (
          <div className="w-16 h-8 bg-gray-100 rounded animate-pulse" />
        ) : user && profile ? (
          <div className="flex items-center gap-4">
            <Link
              href="/jobs"
              className={`text-sm font-medium ${pathname.startsWith('/jobs') ? 'text-orange-500' : 'text-gray-600'}`}
            >
              구인글
            </Link>
            <Link
              href="/chat"
              className={`text-sm font-medium ${pathname.startsWith('/chat') ? 'text-orange-500' : 'text-gray-600'}`}
            >
              채팅
            </Link>
            <Link
              href="/reviews"
              className={`text-sm font-medium ${pathname.startsWith('/reviews') ? 'text-orange-500' : 'text-gray-600'}`}
            >
              후기
            </Link>
            <Link
              href="/profile"
              className={`text-sm font-medium ${pathname === '/profile' ? 'text-orange-500' : 'text-gray-600'}`}
            >
              내 정보
            </Link>
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold text-white px-4 py-1.5 rounded-full"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              회원가입
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
