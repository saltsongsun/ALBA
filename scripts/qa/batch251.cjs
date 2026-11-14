// 묶음 251 (정기 개선 2026-11-14 19:35 KST)
// · 정산 탭 '계좌 미등록' 줄: 마지막 '계좌 등록 요청' 앱 알림 때를 옆에 ('2시간 전 보냄'처럼) · 30분 안에 또 누르면 '방금 보냈어요 · 또 보낼까요?'
//   (서류 탭 '서명 요청'과 같은 방식 · 같은 알림이 근무자에게 겹쳐 가지 않게) · 이 공고·우리 회사 알림만 셈
// · 보내고 나면 '방금 보냄'이 톡 나타남
// node scripts/qa/batch251.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000251d2'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000251c2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const msg = (id, job, co, ago) => ({ id, thread_user_id: W, sender_id: A, from_admin: true, company_id: co, job_id: job, body: '💳 계좌 등록 요청\n급여를 보내 드리려면 계좌가 필요해요.', read_at: null, created_at: new Date(Date.now() - ago).toISOString() })

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const box = a.locator('[data-no-account]').locator('xpath=..')
  const last = box.locator('[data-last-nudge]')
  const send = box.getByRole('button', { name: /앱 알림|보낼까요/ })
  const open = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=pay`, { waitUntil: 'networkidle' }); await a.locator('[data-no-account]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 보낸 적 없으면 표시 없음 · 확인 문구 그대로
  await open()
  ok("계좌 미등록 1명 · 보낸 적 없으면 '보냄' 표시 없음", one(await a.locator('[data-no-account]').innerText()).startsWith('계좌 미등록 1명') && (await last.count()) === 0)

  // ── 2. 2시간 전에 보냈으면 '오늘 HH:MM 보냄' (회색) · 다른 공고·다른 회사 알림은 안 섞임
  await rest('messages', 'POST', msg(925101, J, C1, 2 * 3600e3))
  await rest('messages', 'POST', msg(925102, J2, C1, 3 * 60e3))
  // (같은 공고의 글은 DB가 그 공고의 회사로 맞춤 — 다른 회사 글은 다른 공고로만 생김)
  await open()
  ok("2시간 전: '오늘 HH:MM 보냄' (다른 공고의 방금 알림은 안 섞임)", (await last.getAttribute('data-last-nudge').catch(() => null)) === 'old' && /^(오늘 \d{1,2}:\d\d|\d{1,2}\/\d{1,2}\([일월화수목금토]\) \d{1,2}:\d\d) 보냄$/.test(one(await last.innerText().catch(() => ''))), one(await last.innerText().catch(() => '')))
  await send.click()
  ok("오래전이면 확인 문구 그대로 '1명에게 보낼까요?'", (await box.getByRole('button', { name: '1명에게 보낼까요?' }).count()) === 1)
  ok('360px 옆으로 안 밀림', await noSide(a))

  // ── 3. 보내면 '방금 보냄' (톡) · 금방 또 누르면 한 번 더 확인
  await box.getByRole('button', { name: '1명에게 보낼까요?' }).click()
  await a.waitForURL((u) => new URL(u).searchParams.has('m'), { timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle')
  ok("보냄: '1명에게 앱 알림을 보냈어요.'", (await a.locator('main').innerText()).includes('1명에게 앱 알림을 보냈어요.'))
  await last.waitFor({ timeout: 8000 }).catch(() => {})
  ok("'방금 보냄' (노란 글씨 · 톡 나타남)", (await last.getAttribute('data-last-nudge')) === 'recent' && /^(방금|1분 전) 보냄$/.test(one(await last.innerText())) && ((await last.getAttribute('class')) ?? '').includes('animate-pop') === (one(await last.innerText()) === '방금 보냄'), one(await last.innerText().catch(() => '')))
  if (SHOTS) {
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(400)
    const bx = await box.boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/pay-account-nudged.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(200, bx.height + 24) } }).catch(() => {})
  }
  await send.click()
  const again = box.getByRole('button', { name: /보냈어요 · 또 보낼까요\?/ })
  ok("금방 또 누르면 '방금 보냈어요 · 또 보낼까요?'", /^(방금|1분 전에) 보냈어요 · 또 보낼까요\?$/.test(one(await again.innerText().catch(() => ''))), one(await again.innerText().catch(() => '')))
  if (SHOTS) {
    await a.waitForTimeout(250)
    const bx = await box.boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/pay-account-again.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: Math.min(220, bx.height + 24) } }).catch(() => {})
  }
  ok('360px 옆으로 안 밀림 (다시 확인 중)', await noSide(a))
  const sent = (await rest(`messages?thread_user_id=eq.${W}`)).filter((m) => m.job_id === J && (m.company_id ?? C1) === C1 && m.body.startsWith('💳 계좌 등록 요청'))
  ok('근무자 문의함: 이 공고 계좌 요청 2건 (예전 1 + 방금 1)', sent.length === 2, String(sent.length))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
