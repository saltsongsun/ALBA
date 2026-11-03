// 보안 강화 (AI를 통한 공격 대비):
// · AI 수집 로봇은 모든 화면 막힘(robots.txt만 허용) · 자동화 도구(파이썬·curl 등)는 로그인 뒤 화면·개인정보·서버 함수에서 막힘, 공개 화면은 그대로
// · 화면마다 새 일회용 값(nonce)으로 '이 앱이 넣은 스크립트만'(CSP), 다른 서버로 연결 금지 · 주요 화면 CSP 위반 0
// · 근무자 명단을 한 시간에 너무 많이 열면 막힘
// node scripts/qa/security-ai.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const get = (path, ua, extra = {}) => fetch(`${D}${path}`, { redirect: 'manual', ...extra, headers: { 'user-agent': ua, ...(extra.headers || {}) } })
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

;(async () => {
  // ── 1. AI 수집 로봇 ──
  for (const ua of ['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'CCBot/2.0 (https://commoncrawl.org/faq/)', 'Mozilla/5.0 (compatible; PerplexityBot/1.0)', 'Mozilla/5.0 (compatible; Bytespider)']) {
    const name = ua.match(/GPTBot|ClaudeBot|CCBot|PerplexityBot|Bytespider/)[0]
    const [home, job] = await Promise.all([get('/', ua), get(`/jobs/${J}`, ua)])
    ok(`${name}: 공고 목록·공고 화면 막힘`, home.status === 403 && job.status === 403, `${home.status} ${job.status}`)
  }
  const robots = await get('/robots.txt', 'Mozilla/5.0 (compatible; GPTBot/1.2)')
  const rtxt = await robots.text()
  ok('AI 로봇도 robots.txt는 읽을 수 있고, 전부 금지라고 적혀 있음', robots.status === 200 && /User-Agent: GPTBot[\s\S]*?Disallow: \//.test(rtxt) && rtxt.includes('ClaudeBot'), rtxt.slice(0, 120).replace(/\n/g, ' | '))

  // ── 2. 자동화 도구 ──
  const admin = { cookie: `alba_session=${cookie(A)}` }
  for (const ua of ['python-requests/2.32.3', 'curl/8.5.0', 'Go-http-client/1.1', 'Wget/1.21']) {
    const [pub, priv, me, api] = await Promise.all([get('/', ua), get('/admin', ua, { headers: admin }), get('/me', ua), get(`/api/jobs/${J}/viewers`, ua, { headers: admin })])
    ok(`${ua.split('/')[0]}: 공개 공고는 그대로, 관리자·내 정보·API는 막힘`, pub.status === 200 && priv.status === 403 && me.status === 403 && api.status === 403, `${pub.status} ${priv.status} ${me.status} ${api.status}`)
  }
  const act = await fetch(`${D}/login`, { method: 'POST', headers: { 'user-agent': 'python-requests/2.32.3', 'next-action': 'x', 'content-type': 'text/plain' }, body: '[]', redirect: 'manual' })
  ok('자동화 도구로 서버 함수(로그인 등) 직접 부르기 막힘', act.status === 403, String(act.status))
  const cron = await get('/api/cron/remind', 'vercel-cron/1.0')
  ok('예약 작업(Vercel cron)은 막지 않음 (비밀값 검사는 그대로)', cron.status !== 403, String(cron.status))
  const people = await get('/admin', CHROME, { headers: admin })
  ok('휴대폰 브라우저는 그대로', people.status === 200, String(people.status))

  // ── 3. CSP: 일회용 값, 다른 서버로 연결 금지, 위반 0 ──
  const [r1, r2] = await Promise.all([get('/', CHROME), get('/', CHROME)])
  const c1 = r1.headers.get('content-security-policy') || '', c2 = r2.headers.get('content-security-policy') || ''
  const n1 = (c1.match(/'nonce-([^']+)'/) || [])[1], n2 = (c2.match(/'nonce-([^']+)'/) || [])[1]
  ok('CSP: 화면마다 새 일회용 값', !!n1 && !!n2 && n1 !== n2)
  ok("CSP: 허락한 스크립트만('strict-dynamic')·이 사이트로만 연결·끼워 넣기 금지", /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(c1) && /connect-src 'self'(;|$)/.test(c1) && /frame-ancestors 'none'/.test(c1) && /object-src 'none'/.test(c1) && !/unsafe-eval/.test(c1), c1)
  const html = await r1.text()
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1])
  ok('화면의 스크립트에 모두 그 값이 붙음', scripts.length > 0 && scripts.every((a) => a.includes(`nonce="${n1}"`)), `${scripts.filter((a) => !a.includes('nonce=')).length}/${scripts.length}`)

  const b = await chromium.launch()
  const errs = [], csp = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(`${p.url().replace(D, '')}: ${m.text().slice(0, 160)}`) })
    return p
  }
  const wk = await pg(W)
  for (const path of ['/', `/jobs/${J}`, '/me', '/me/chat', '/me/history', '/me/profile']) {
    await wk.goto(`${D}${path}`)
    await wk.waitForLoadState('networkidle').catch(() => {})
  }
  ok('근무자 화면들: 버튼이 동작 (스크립트가 막히지 않음)', await wk.evaluate(() => typeof window.next === 'object' || !!document.querySelector('[data-bottom-nav]')))
  await wk.locator('nav[data-bottom-nav] a[href="/me"]').click()
  await wk.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 8000 }).catch(() => {})
  ok('근무자: 화면 이동 동작', new URL(wk.url()).pathname === '/me')
  const ad = await pg(A)
  for (const path of ['/admin', `/admin/jobs/${J}`, '/admin/workers', `/admin/workers/${W}`, '/admin/chat', '/admin/settings']) {
    await ad.goto(`${D}${path}`)
    await ad.waitForLoadState('networkidle').catch(() => {})
  }
  const anon = await pg(null)
  for (const path of ['/', '/login', '/signup?type=worker', `/jobs/${J}`]) {
    await anon.goto(`${D}${path}`)
    await anon.waitForLoadState('networkidle').catch(() => {})
  }
  ok('주요 화면 CSP 위반 없음', csp.length === 0, csp.slice(0, 4).join(' | '))

  // ── 4. 명단 대량 열람 막기 ──
  const now = new Date().toISOString()
  await fetch(`${MD}/rest/v1/rate_events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Array.from({ length: 150 }, () => ({ bucket: `roster-detail:${A}`, created_at: now }))) })
  await ad.goto(`${D}/admin/workers/${W}`)
  ok('한 시간에 근무자 상세 150번 넘으면 막힘', await ad.locator('[data-roster-too-many]').waitFor({ timeout: 6000 }).then(() => true, () => false))
  await ad.goto(`${D}/admin/workers`)
  ok('목록은 따로 셈 (아직 열림)', (await ad.getByText(/근무자 \d+명/).count()) > 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
