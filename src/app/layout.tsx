import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import InstallGuide from '@/components/InstallGuide'
import NavProgress from '@/components/NavProgress'
// Pretendard 가변 폰트를 앱에 포함 (외부 CDN 없이, 화면에 쓰인 글자 묶음만 내려받음)
import '@/fonts/pretendard/pretendardvariable-dynamic-subset.css'
import './globals.css'

// 모든 화면이 로그인 상태·DB를 읽으므로 빌드 시 미리 만들지 않습니다.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { default: '소켓 알바', template: '%s · 소켓 알바' },
  description: '행사 단기 아르바이트 지원 · 출퇴근 · 근로계약 · 정산',
  applicationName: '소켓 알바',
  appleWebApp: { capable: true, title: '소켓 알바', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2557e8',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
        <InstallGuide />
      </body>
    </html>
  )
}
