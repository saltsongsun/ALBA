import { NextResponse, type NextRequest } from 'next/server'

/**
 * 보안 (모든 화면 요청 앞에서):
 * 1) 스스로 AI 수집 로봇이라고 밝히는 접근은 전부 막음 (개인정보·공고를 AI 학습·검색에 긁어 가지 못하게). robots.txt만 읽게 둠
 * 2) 사람이 아닌 자동화 도구(파이썬·curl 등)는 로그인 뒤 화면·개인정보 주소·서버 함수 요청에서 막음 (공개 공고·로그인 화면은 그대로)
 * 3) 화면마다 새 일회용 값(nonce)으로 '이 앱이 넣은 스크립트만 실행' 규칙(CSP)을 걸어, 누가 글·이름에 스크립트를 숨겨 넣어도
 *    실행되지 않고, 화면 내용을 다른 서버로 몰래 보내지 못하게 함 (연결은 이 사이트로만)
 */
const AI_BOTS =
  /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|Claude-Web|anthropic-ai|CCBot|PerplexityBot|Perplexity-User|Bytespider|Amazonbot|cohere-ai|cohere-training|Diffbot|meta-externalagent|meta-externalfetcher|ImagesiftBot|Omgilibot|omgili|YouBot|Timpibot|AI2Bot|Ai2Bot|DuckAssistBot|MistralAI|iaskspider|Kangaroo Bot|PanguBot|img2dataset|FriendlyCrawler|Webzio-Extended|Google-CloudVertexBot|GoogleOther|Applebot-Extended|PetalBot|SemrushBot-OCOB|Scrapy|Crawl4AI|FirecrawlAgent|Jina|Manus|Devin/i
const SCRIPTS = /python-requests|python-urllib|python-httpx|aiohttp|Go-http-client|^curl\/|Wget|libwww-perl|okhttp|HTTrack|^Java\/|node-fetch|axios\/|PostmanRuntime|httpie/i
// 로그인 뒤 화면·개인정보가 오가는 주소 (예약 작업 /api/cron은 Vercel이 부름)
const PRIVATE = /^\/(admin|ops|me|docs|print|photo|pro|quote|api\/(?!cron\/))/

function blocked(msg: string) {
  return new NextResponse(msg, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

/**
 * 대표 주소로 모으기: Vercel 환경 변수 CANONICAL_HOST(예: happywork.co.kr)를 정하면, 운영 배포의 예전 주소(*.vercel.app)로
 * 들어온 화면 열기(GET·HEAD)를 그 도메인의 같은 주소로 영구 이동(308). 로그인 쿠키·앱 설치·알림이 주소마다 따로라서 한곳으로 모음.
 * 미리보기 배포·예약 작업(/api/cron)·서버 함수(POST)는 그대로 · 값이 없으면 아무것도 안 함
 */
const CANONICAL = (process.env.CANONICAL_HOST ?? '').trim().toLowerCase()
const CANONICAL_OK = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(CANONICAL)

function toCanonical(request: NextRequest): NextResponse | null {
  if (!CANONICAL_OK || process.env.VERCEL_ENV !== 'production') return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const host = (request.headers.get('host') ?? '').toLowerCase()
  if (!host.endsWith('.vercel.app') || host === CANONICAL) return null
  if (request.nextUrl.pathname.startsWith('/api/cron/')) return null
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL}`)
  return NextResponse.redirect(url, 308)
}

export function proxy(request: NextRequest) {
  const moved = toCanonical(request)
  if (moved) return moved
  const ua = request.headers.get('user-agent') ?? ''
  const path = request.nextUrl.pathname
  if (path !== '/robots.txt' && AI_BOTS.test(ua)) return blocked('AI 수집 로봇의 접근은 허용되지 않아요.')
  const serverAction = request.method === 'POST' && request.headers.has('next-action')
  if (SCRIPTS.test(ua) && (PRIVATE.test(path) || serverAction)) return blocked('자동 접근은 허용되지 않아요.')

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const dev = process.env.NODE_ENV === 'development'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // 화면 안 style 속성(진행 막대 너비 등)은 써야 해서 허용 (스크립트와 달리 실행되지 않음)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    // 공고 화면 지도
    'frame-src https://maps.google.com https://www.google.com',
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ')

  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  // 화면 틀(layout)은 주소 뒤 ?값을 받지 못해서 함께 넘김 (관리자 첫 화면 이동에서 공고 모음 링크는 그대로 두려고)
  headers.set('x-search', request.nextUrl.search)
  headers.set('Content-Security-Policy', csp)
  const res = NextResponse.next({ request: { headers } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  // 화면·서버 함수·API만 (빌드된 파일·그림·아이콘은 빼고)
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon|icons/|stickers/|splash/|fonts/|sw.js|manifest.webmanifest|icon.svg|apple-icon).*)',
    },
  ],
}
