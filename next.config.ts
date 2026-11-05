import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 어떤 프레임워크로 만들었는지 응답에 드러내지 않음 (공격 도구가 약점을 고르기 어렵게)
  poweredByHeader: false,
  // 공유 미리보기 그림에 쓰는 한글 글꼴(OTF)을 그 그림을 만드는 서버 함수에만 함께 올림
  outputFileTracingIncludes: {
    '/opengraph-image': ['./src/fonts/og/*.otf'],
    '/jobs/[id]/opengraph-image': ['./src/fonts/og/*.otf'],
    '/og/company/[id]': ['./src/fonts/og/*.otf'],
    // 서류 PDF에 넣는 한글 글꼴 (부분 글꼴 TTF)
    '/admin/docs/pdf': ['./src/fonts/pdf/*.ttf'],
  },
  experimental: {
    // 한 번 연 화면은 30초 동안 휴대폰에 두었다가 다시 열 때 바로 보여 줌 (탭을 오갈 때 기다림 없음).
    // 내가 무언가를 저장·보내면(서버 동작) 그 즉시 비워져 새로 받아 옴. 자동 새로 고침 화면은 그대로 최신으로
    staleTimes: {
      dynamic: 30,
    },
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
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), bluetooth=(), serial=(), hid=()' },
          // 다른 사이트가 이 사이트의 파일(사진·자료)을 몰래 끌어다 쓰지 못하게
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
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
        // 이모티콘·아이콘·시작 화면 그림: 하루 동안은 다시 묻지 않고 바로 씀 (그 뒤 일주일은 쓰면서 뒤에서 새로 확인)
        source: '/:dir(stickers|icons|splash)/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
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
