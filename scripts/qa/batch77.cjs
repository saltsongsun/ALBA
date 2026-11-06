// 묶음 77: 서류 서명 동의 칸 — 체크 없이 '서명하고 제출하기'를 누르면 휴대폰 기본 말풍선 대신 화면 안내(빨간 칸·흔들림·'위 동의 칸에 체크해야…')
//          · 서버로 보내지 않음 · 체크하면 안내가 사라지고 제출됨 · 관리자 공고: 아무도 안 봤으면 '(가입자 0명)' 없이 · '지금 보는 중 0명' 붙여 쓰기
// node scripts/qa/batch77.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const [d0] = await rest(`signed_docs?id=eq.${DOC}`)
  ok('준비: 서명할 서류 (pending)', d0?.status === 'pending', d0?.status)
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 서명은 했는데 동의 체크 없이 제출 ──
  const p = await pg(W)
  let posts = 0
  p.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts++ })
  await p.goto(`${D}/docs/${DOC}`)
  await p.locator('#sign').waitFor({ timeout: 10000 }).catch(() => {})
  await p.waitForLoadState('networkidle').catch(() => {})
  const pad = p.locator('[data-sign-pad] canvas')
  await pad.scrollIntoViewIfNeeded()
  const box = await pad.boundingBox()
  await p.mouse.move(box.x + 30, box.y + 90)
  await p.mouse.down()
  for (let i = 1; i <= 12; i++) await p.mouse.move(box.x + 30 + i * 18, box.y + 90 + (i % 2 ? -25 : 25))
  await p.mouse.up()
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  await p.waitForTimeout(600)
  const hint = p.locator('[data-sign-agree-hint]')
  ok('서버로 보내지 않음 · 같은 화면', posts === 0 && new URL(p.url()).pathname === `/docs/${DOC}`, `posts=${posts}`)
  ok("화면 안내: '위 동의 칸에 체크해야 제출할 수 있어요'", (await hint.count()) === 1 && (await hint.innerText()).includes('동의 칸에 체크'))
  ok('동의 칸: 빨간 표시 · aria-invalid', (await p.locator('[data-sign-agree]').getAttribute('class')).includes('ring-rose-300') && (await p.locator('input[name=agree]').getAttribute('aria-invalid')) === 'true')
  ok('브라우저 기본 말풍선 안 씀 (form novalidate)', (await p.locator('#sign').getAttribute('novalidate')) !== null)
  ok('360px: 옆으로 안 밀림 (서명)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await p.locator('input[name=agree]').check()
  ok('체크하면 안내가 사라짐', (await hint.count()) === 0)
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  await p.waitForURL((u) => u.pathname === '/me', { timeout: 15000 }).catch(() => {})
  ok('제출됨', (await rest(`signed_docs?id=eq.${DOC}`))[0]?.status === 'signed', p.url())

  // ── 2. 관리자 공고: 확인 · 지금 보는 중 ──
  await rest(`job_views?job_id=eq.${J}`, 'DELETE')
  const ad = await pg(A)
  await ad.goto(`${D}/admin/jobs/${J}`)
  const live = ad.locator('[data-view-live]')
  await live.waitFor({ timeout: 10000 }).catch(() => {})
  ok("아무도 안 봤으면 '(가입자 0명)' 없음", (await ad.locator('[data-view-split]').count()) === 0)
  ok("'지금 보는 중 0명' (숫자와 '명' 사이 띄움 없음)", /지금 보는 중 0명/.test((await live.innerText()).replace(/\s+/g, ' ')), await live.innerText())
  await rest('job_views', 'POST', { job_id: J, viewer: 'g-test-viewer-1', user_id: null, first_seen: new Date().toISOString(), last_seen: new Date().toISOString(), visits: 1 })
  await ad.reload()
  await ad.locator('[data-view-split]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("본 사람이 생기면 '(가입자 0명 · 비회원 1명)'", (await ad.locator('[data-view-split]').innerText().catch(() => '')).includes('비회원 1명'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
