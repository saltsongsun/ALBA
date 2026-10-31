import type { MetadataRoute } from 'next'
import { APP_DESCRIPTION, APP_NAME, BRAND_COLOR } from '@/lib/brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    lang: 'ko',
    start_url: '/me',
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
