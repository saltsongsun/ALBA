import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '소켓 알바',
    short_name: '소켓 알바',
    description: '행사 단기 아르바이트 지원 · 출퇴근 · 근로계약 · 정산',
    start_url: '/me',
    display: 'standalone',
    background_color: '#f2f4f6',
    theme_color: '#2557e8',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
