import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/lib/auth-context'
import type { Metadata } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import './globals.css'

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
    {/* 🌟 html 태그와 body 태그 모두에 suppressHydrationWarning을 넣어주는 것이 가장 안전합니다 */}
    <body 
      className={`${notoSansKr.variable} font-sans bg-gray-50 min-h-screen`}
      suppressHydrationWarning
    >
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
