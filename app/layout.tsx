import Navbar from '@/components/Navbar'
import NotificationProvider from '@/components/NotificationProvider'
import NotificationToaster from '@/components/NotificationToaster'
import { AuthProvider } from '@/lib/auth-context'
import type { Metadata } from 'next'
import './globals.css'


export const metadata: Metadata = {
  title: {
    default: 'HireVan — 밴쿠버 한인 채용 플랫폼',
    template: '%s | HireVan',
  },
  description: '채팅으로 바로 연락, 면접 약속까지 한 번에. 밴쿠버 한인을 위한 구인구직 플랫폼',
  keywords: ['밴쿠버 구인구직', '밴쿠버 알바', '한인 채용', '워홀 취업', '밴쿠버 워킹홀리데이', 'Vancouver Korean jobs', 'HireVan'],
  authors: [{ name: 'HireVan' }],
  metadataBase: new URL('https://www.hire-van.com'),
  openGraph: {
    title: 'HireVan — 밴쿠버 한인 채용 플랫폼',
    description: '채팅으로 바로 연락, 면접 약속까지 한 번에. 밴쿠버 한인을 위한 채용 플랫폼.',
    url: 'https://www.hire-van.com',
    siteName: 'HireVan',
    images: [
      {
        url: '/og-image.png', // 1200x630 이미지 만들어서 public에 넣으세요
        width: 1200,
        height: 630,
        alt: 'HireVan 밴쿠버 한인 채용 플랫폼',
      },
    ],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HireVan — 밴쿠버 한인 채용',
    description: '채팅으로 바로 연락하고 면접 약속까지, 밴쿠버 한인 채용 플랫폼',
    images: ['/og-image.jpg'],
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png', // 180x180
  },
  robots: {
    index: true,
    follow: true,
  },
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
      className="font-sans bg-gray-50 min-h-screen"
      suppressHydrationWarning
    >
        <AuthProvider>
          <NotificationProvider>
            <Navbar />
            <main className="max-w-2xl mx-auto px-4 pb-16 pt-4">
              {children}
            </main>
            <NotificationToaster />
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
