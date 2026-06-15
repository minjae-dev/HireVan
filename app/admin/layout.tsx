'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const sidebarLinks = [
  { href: '/admin/dashboard', label: '대시보드', icon: '📊' },
  { href: '/admin/members', label: '회원 관리', icon: '👥' },
  { href: '/admin/jobs', label: '채용 관리', icon: '💼' },
  { href: '/admin/notifications', label: '알림 관리', icon: '🔔' },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    // 로그인 페이지는 가드에서 제외
    if (pathname === '/admin/login') return

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session?.user) {
        router.replace('/admin/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profile?.is_admin) {
        router.replace('/admin/login')
        return
      }

      setAuthorized(true)
      setLoading(false)
    }

    checkAuth()
  }, [pathname, router])

  // 로그인 페이지는 레이아웃 없이 렌더링
  if (pathname === '/admin/login') {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">관리자 인증 확인 중...</p>
        </div>
      </div>
    )
  }

  if (!authorized) {
    return null
  }

  return (
    <div className="min-h-dvh flex bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 left-0 z-40">
        {/* 로고 */}
        <div className="h-16 flex items-center px-6 border-b border-gray-100">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <span className="text-lg font-bold text-gray-900">Admin</span>
            <span className="text-[10px] font-medium bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">
              HireVan
            </span>
          </Link>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {sidebarLinks.map((link) => {
            const isActive = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{link.icon}</span>
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* 하단 */}
        <div className="px-3 py-4 border-t border-gray-100 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all"
          >
            <span className="text-base">🏠</span>
            메인 사이트
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/admin/login')
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all w-full"
          >
            <span className="text-base">🚪</span>
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 ml-64">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}