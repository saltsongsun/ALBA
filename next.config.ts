import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 서명 이미지·직인 이미지(data URL)를 폼으로 보냄
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          // 항상 https로만 (중간에서 가로채기 방지)
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // 다른 사이트에 끼워 넣기·폼 가로채기·플러그인 실행 막기
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        // 로그인해야 보이는 화면은 검색·AI 수집 로봇이 저장하지 않게
        source: '/:dir(admin|me|docs|print|photo|api|login|signup|setup)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        // 서비스 워커는 항상 새로 받아 바로 갱신되도록
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
