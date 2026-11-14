// 묶음 254 (정기 개선 2026-11-15 01:35 KST)
// · 공고 화면 '확정자에게 공지': 마지막 공지를 지금 확정자 중 몇 명이 읽었는지 — 제목 옆 '읽음 1/2' (접혀 있어도) · 모두 읽으면 '모두 읽음'
// · 펼치면 '마지막 공지 읽음 1/2명' + 막대가 차오름 + '안 읽음 · 김지원' + [문자 1명] (안 읽은 사람에게만 같은 내용 문자)
//   (확정이 풀린 사람 · 예전 다른 공지는 안 셈 · 이 공고·우리 회사 글만)
// node scripts/qa/batch254.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003', AP_APP = '11111111-0000-4000-8000-000000000012'
const C1 = '99999999-0000-4000-8000-000000000099', X = 'bbbbbbbb-0000-4000-8000-000000025401'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const TEXT = '내일 집결은 08:30 정문이에요.'

;(async () => {
  // 확정자 둘 (근무자 · 김지원) · 예전 다른 공지 하나 (읽음) — 셈에 안 들어감
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', available_dates: null })
  await rest('messages', 'POST', { id: 925401, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: '📢 공지\n예전 공지', read_at: new Date().toISOString(), created_at: new Date(Date.now() - 5 * 3600e3).toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const fold = a.locator('details', { hasText: '확정자에게 공지' })
  const summary = fold.locator('summary')
  const badge = fold.locator('[data-notice-read-count]')
  const card = fold.locator('[data-notice-reads]')
  const open = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' }); await fold.waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 예전 공지(근무자 한 명에게만, 읽음)만 있으면 '모두 읽음'이 아니라 그 묶음 기준 — 1/1
  await open()
  ok("예전 공지 묶음 기준: '모두 읽음' (그때 받은 1명 읽음)", one(await badge.innerText().catch(() => '')) === '모두 읽음', one(await badge.innerText().catch(() => '')))

  // ── 2. 새 공지를 둘에게 보냄 → '읽음 0/2'
  await summary.click()
  await fold.locator('textarea[name=body]').fill(TEXT)
  await fold.getByRole('button', { name: /앱으로 보내기/ }).click()
  await fold.locator('.animate-pop', { hasText: '문자로도' }).waitFor({ timeout: 15000 }).catch(() => {})
  const sent = (await rest(`messages?job_id=eq.${J}`)).filter((m) => m.body === `📢 공지\n${TEXT}`)
  ok('둘에게 보냄 (근무자 · 김지원)', sent.length === 2 && new Set(sent.map((m) => m.thread_user_id)).size === 2, String(sent.length))
  // 확정이 아닌 사람에게 같은 글이 간 기록이 있어도 셈에 안 들어감
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: X, name: '확정아님', phone: '01077772541', created_at: new Date().toISOString() })
  await rest('messages', 'POST', { id: 925402, thread_user_id: X, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: `📢 공지\n${TEXT}`, read_at: null, created_at: sent[0]?.created_at })
  await open()
  ok("제목 옆 '읽음 0/2' (접힌 채로 · 확정 아닌 사람은 안 셈)", one(await badge.innerText().catch(() => '')) === '읽음 0/2', one(await badge.innerText().catch(() => '')))
  ok('제목 줄 한 줄 (360px)', await summary.evaluate((el) => el.querySelector('span.flex').getBoundingClientRect().height < 30).catch(() => false))

  // ── 3. 근무자가 읽음 → '읽음 1/2' · 펼치면 막대 + '안 읽음 · 김지원' + [문자 1명]
  await rest(`messages?thread_user_id=eq.${W}&job_id=eq.${J}`, 'PATCH', { read_at: new Date().toISOString() })
  await open()
  ok("'읽음 1/2' (노란 표)", one(await badge.innerText().catch(() => '')) === '읽음 1/2' && ((await badge.getAttribute('class')) ?? '').includes('amber'))
  await summary.click()
  await card.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  const head = one(await card.locator('p').first().textContent().catch(() => ''))
  ok("펼치면 '마지막 공지 읽음 1/2명 · 방금'", /^마지막 공지 읽음 1\/2명 ?(방금|1분 전)$/.test(head), head)
  ok("'안 읽음 · 김지원'", one(await card.locator('[data-unread-names]').textContent().catch(() => '')) === '안 읽음 · 김지원')
  const sms = card.locator('a[href^="sms:"]')
  const href = decodeURIComponent((await sms.getAttribute('href').catch(() => '')) ?? '')
  ok("[문자 1명] — 안 읽은 사람 번호만 · 같은 내용", one(await sms.textContent().catch(() => '')) === '문자 1명' && href.includes('01077778888') && !href.includes('01033334444') && href.includes(TEXT), href)
  await a.waitForTimeout(400)
  const bar = await card.locator('[data-read-bar]').evaluate((el) => ({ w: Math.round((el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width) * 100), dur: getComputedStyle(el).animationDuration, name: getComputedStyle(el).animationName })).catch(() => null)
  ok('막대 절반 (차오르는 움직임 0.3초)', !!bar && bar.w === 50 && bar.name === 'grow' && bar.dur === '0.3s', JSON.stringify(bar))
  const rows = await card.evaluate((el) => [...el.children].map((c) => Math.round(c.getBoundingClientRect().height)))
  ok('칸 안 줄이 각각 한 줄 (360px)', rows[0] < 26 && rows[2] < 44, JSON.stringify(rows))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(400)
    const bx = await fold.boundingBox()
    const cb = await card.boundingBox()
    if (bx && cb) await a.screenshot({ path: `${SHOTS}/notice-reads.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(320, cb.y + cb.height - bx.y + 70) } }).catch(() => {})
  }

  // ── 4. 모두 읽으면 '모두 읽음' · '✓ 모두 읽었어요' (문자 버튼 없음)
  await rest(`messages?thread_user_id=eq.${AP}&job_id=eq.${J}`, 'PATCH', { read_at: new Date().toISOString() })
  await open()
  ok("'모두 읽음' (초록 표)", one(await badge.innerText().catch(() => '')) === '모두 읽음' && ((await badge.getAttribute('class')) ?? '').includes('emerald'))
  await summary.click()
  await card.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("'✓ 모두 읽었어요' · 문자 버튼 없음", one(await card.locator('[data-all-read]').textContent().catch(() => '')) === '✓ 모두 읽었어요' && (await card.locator('a[href^="sms:"]').count()) === 0)
  if (SHOTS) {
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(400)
    await card.screenshot({ path: `${SHOTS}/notice-all-read.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
