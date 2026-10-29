import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '소켓 알바',
    short_name: '소켓 알바',
    description: '행사 단기 아르바이트 지원 · 출퇴근 · 근로계약 · 정산',
    lang: 'ko',
    start_url: '/me',
    scope: '/',
    display: 'standalone',
    background_color: '#f2f4f6',
    theme_color: '#2557e8',
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
