import type { MetadataRoute } from 'next'
import { APP_DESCRIPTION, APP_NAME, BRAND_COLOR } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    lang: 'ko',
    // 앱 아이콘으로 열 때: 근무자는 내 근무, 관리자는 관리자 화면으로 (/me 가 ?app=1 을 보고 관리자를 보냄)
    // (인사이트: 관리자가 앱을 열면 근무자 '내 근무'부터 떠서 이리저리 눌러 관리자 화면을 찾아감)
    start_url: '/me?app=1',
    scope: '/',
    display: 'standalone',
    // 안드로이드 시작 화면: 흰 바탕에 아이콘과 앱 이름
    background_color: '#ffffff',
    theme_color: BRAND_COLOR,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '내 근무 · 출퇴근', url: '/me' },
      { name: '모집 중인 알바', url: '/' },
    ],
  }
}
