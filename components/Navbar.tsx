'use client'

import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/context/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import NavbarNotificationBell from '@/components/NavbarNotificationBell'

export default function Navbar() {
  const { user, profile, signOut, loading } = useAuth()
  const { t } = useLanguage()
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

        <div className="flex items-center gap-2 sm:gap-4">
          <LanguageToggle />
          {loading ? (
            <div className="w-16 h-8 bg-gray-100 rounded animate-pulse" />
          ) : user && profile ? (
            <>
              {profile.role === 'employer' ? (
                <>
                  <Link
                    href="/employer/jobs"
                    className={`text-sm font-medium ${pathname.startsWith('/employer/jobs') ? 'text-orange-500' : 'text-gray-600'}`}
                  >
                    {t('nav.my_jobs')}
                  </Link>
                  <Link
                    href="/chat"
                    className={`text-sm font-medium ${pathname.startsWith('/chat') ? 'text-orange-500' : 'text-gray-600'}`}
                  >
                    {t('nav.chat')}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/jobs"
                    className={`text-sm font-medium ${
                      pathname.startsWith('/jobs') && !pathname.startsWith('/employer')
                        ? 'text-orange-500'
                        : 'text-gray-600'
                    }`}
                  >
                    {t('nav.jobs')}
                  </Link>
                  <Link
                    href="/seeker/dashboard"
                    className={`text-sm font-medium ${
                      pathname.startsWith('/seeker/dashboard') ? 'text-orange-500' : 'text-gray-600'
                    }`}
                  >
                    {t('nav.customized_jobs')}
                  </Link>
                  <Link
                    href="/chat"
                    className={`text-sm font-medium ${pathname.startsWith('/chat') ? 'text-orange-500' : 'text-gray-600'}`}
                  >
                    {t('nav.chat')}
                  </Link>
                  <Link
                    href="/reviews"
                    className={`text-sm font-medium ${pathname.startsWith('/reviews') ? 'text-orange-500' : 'text-gray-600'}`}
                  >
                    {t('nav.reviews')}
                  </Link>
                </>
              )}
              <Link
                href="/notifications"
                className={`text-sm font-medium ${pathname.startsWith('/notifications') ? 'text-orange-500' : 'text-gray-600'}`}
              >
                {t('nav.notifications')}
              </Link>
              <NavbarNotificationBell />
              <Link
                href="/profile"
                className={`text-sm font-medium ${pathname === '/profile' ? 'text-orange-500' : 'text-gray-600'}`}
              >
                {t('nav.profile')}
              </Link>
              {profile?.role === 'employer' && (
                <Link
                  href="/employer/dashboard"
                  className={`text-sm font-medium ${
                    pathname.startsWith('/employer/dashboard') ? 'text-orange-500' : 'text-gray-600'
                  }`}
                >
                  {t('nav.dashboard')}
                </Link>
              )}
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                {t('nav.login')}
              </Link>
              <Link
                href="/signup"
                className="text-sm font-semibold text-white px-4 py-1.5 rounded-full"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {t('nav.signup')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
