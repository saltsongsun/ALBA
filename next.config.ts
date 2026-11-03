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
          // 화면의 보안 규칙(CSP: 허락한 스크립트만·이 사이트로만 연결·끼워 넣기 금지)은 요청마다 새 값이 필요해 src/proxy.ts에서 붙임
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
