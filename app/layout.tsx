import type { Metadata } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import Navbar from '@/components/Navbar'

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto',
})

export const metadata: Metadata = {
  title: 'HireVan — 밴쿠버 한인 구인구직',
  description: '밴쿠버 한인 영세업체 × 워홀러 구인구직 플랫폼',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.variable} font-sans bg-gray-50 min-h-screen`}>
        <AuthProvider>
          <Navbar />
          <main className="max-w-2xl mx-auto px-4 pb-16 pt-4">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
