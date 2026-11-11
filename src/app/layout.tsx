import type { Metadata, Viewport } from 'next'
import { cookies, headers } from 'next/headers'
import { Suspense } from 'react'
import { ErrorToast } from '@/components/ErrorCopy'
import InstallGuide from '@/components/InstallGuide'
import NavProgress from '@/components/NavProgress'
import OfflineBar from '@/components/OfflineBar'
// Pretendard 가변 폰트를 앱에 포함 (외부 CDN 없이, 화면에 쓰인 글자 묶음만 내려받음)
import '@/fonts/pretendard/pretendardvariable-dynamic-subset.css'
import './globals.css'
import { APP_DESCRIPTION, APP_NAME, BRAND_COLOR } from '@/lib/brand'
import { SPLASH } from '@/lib/splash'
import KeyboardWatch from '@/components/KeyboardWatch'
import UsageTracker from '@/components/UsageTracker'

// 모든 화면이 로그인 상태·DB를 읽으므로 빌드 시 미리 만들지 않습니다.
export const dynamic = 'force-dynamic'

// 공유 미리보기(og:image)가 전체 주소로 나가도록 (카카오톡은 전체 주소만 읽음)
// 대표 도메인(CANONICAL_HOST)을 정했으면 그 주소로
const SITE = process.env.CANONICAL_HOST
  ? `https://${process.env.CANONICAL_HOST}`
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  // 아이폰: 홈 화면에서 열 때 보이는 시작 화면 (기기 크기별)
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: 'default', startupImage: SPLASH },
  formatDetection: { telephone: false },
  openGraph: { siteName: APP_NAME, locale: 'ko_KR', type: 'website', title: APP_NAME, description: APP_DESCRIPTION },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: BRAND_COLOR,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 보안 규칙(CSP): 이 화면에 허락된 스크립트만 실행되도록 요청마다 새로 만든 값 (src/proxy.ts)
  const nonce = (await headers()).get('x-nonce') ?? undefined
  // 앱 설치 안내는 로그인한 사람에게만 저절로 (처음 온 사람은 공고부터 보게)
  const signedIn = (await cookies()).has('alba_session')
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 글자 크게 보기 · 어두운 화면: 화면이 그려지기 전에 적용 (깜빡이지 않게) */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: "try{var d=document.documentElement;if(localStorage.getItem('text-size')==='lg')d.dataset.text='lg';if(localStorage.getItem('theme')==='dark')d.dataset.theme='dark'}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-dvh">
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {children}
        <InstallGuide auto={signedIn} />
        {/* 휴대폰 키보드가 올라와 있는 동안 아래 탭을 숨김 (html[data-kb]) */}
        <KeyboardWatch />
        {/* 인터넷이 끊기면 위에 안내 + 끊긴 동안 화면 이동·보내기를 막아 보던 화면과 쓰던 내용을 지킴 */}
        <OfflineBar />
        {/* 뒤에서 난 오류도 바로 복사해 보낼 수 있게 */}
        <ErrorToast />
        {/* 화면 이동 기록 (자체 분석 · 개인정보 없이) */}
        <UsageTracker />
      </body>
    </html>
  )
}
