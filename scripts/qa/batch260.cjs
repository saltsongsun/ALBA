// 묶음 260 (정기 개선 2026-11-15 10:35 KST)
// · 공고 화면 '확정자에게 공지' 읽음 칸: 안 읽은 사람을 누르면 바로 전화하는 칩으로 ('안 읽음 [📞 김지원 🔕] [📞 근무자] … [문자 n명]')
//   휴대폰 알림을 꺼 둔 사람은 🔕 + 맨 앞 (앱 공지를 못 봤을 수 있음) · 그런 사람이 있으면 아래 줄에 '🔕 알림을 꺼 둔 사람이에요' + [문자 n명]
//   7명 이상이면 6명 + '외 n명'
// node scripts/qa/batch260.cjs <default 앱> <default 가짜> <shots>
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
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 확정자 둘 · 근무자는 알림 켬, 김지원은 알림 꺼짐
  await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { status: 'approved', available_dates: null })
  await rest('push_subscriptions', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000002600f1', user_id: W, endpoint: 'https://push.example/260', p256dh: 'x', auth: 'y', created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const fold = a.locator('details', { hasText: '확정자에게 공지' })
  const card = fold.locator('[data-notice-reads]')
  const people = card.locator('[data-unread-person]')
  const open = async () => {
    await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
    await fold.waitFor({ timeout: 15000 }).catch(() => {})
    await fold.locator('summary').click()
    await card.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  }

  // ── 1. 둘에게 공지 → 둘 다 안 읽음: 알림 꺼진 김지원이 앞 (🔕)
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
  await fold.locator('summary').click()
  await fold.locator('textarea[name=body]').fill('내일 집결은 08:30 정문이에요.')
  await fold.getByRole('button', { name: /앱으로 보내기/ }).click()
  await fold.locator('.animate-pop', { hasText: '문자로도' }).waitFor({ timeout: 15000 }).catch(() => {})
  await open()
  const names = (await people.allTextContents()).map(one)
  ok("안 읽음 칩: ['김지원 🔕', '근무자'] (알림 꺼진 사람이 앞)", JSON.stringify(names) === JSON.stringify(['김지원🔕', '근무자']), JSON.stringify(names))
  ok('칩을 누르면 바로 전화 (tel:)', (await people.nth(0).getAttribute('href')) === 'tel:01077778888' && (await people.nth(1).getAttribute('href')) === 'tel:01033334444')
  ok("알림 꺼짐 표시는 그 사람만 (data-unread-person='push-off')", (await people.nth(0).getAttribute('data-unread-person')) === 'push-off' && (await people.nth(1).getAttribute('data-unread-person')) === '')
  ok("'🔕 알림을 꺼 둔 사람이에요' (문자 버튼과 한 줄)", one(await card.locator('[data-push-off-note]').textContent().catch(() => '')) === '🔕 알림을 꺼 둔 사람이에요' && (await card.locator('[data-push-off-note]').evaluate((el) => el.parentElement.getBoundingClientRect().height < 44).catch(() => false)))
  ok("[문자 2명]은 그대로 (두 사람 번호)", one(await card.locator('a[href^="sms:"]').textContent().catch(() => '')) === '문자 2명' && decodeURIComponent((await card.locator('a[href^="sms:"]').getAttribute('href')) ?? '').includes('01077778888,01033334444'))
  const rowH = await card.locator('[data-unread-names]').evaluate((el) => Math.round(el.getBoundingClientRect().height))
  ok('칩 줄은 한 줄 (360px) · 옆으로 안 밀림', rowH < 44 && (await noSide(a)), String(rowH))
  if (SHOTS) {
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(400)
    await card.screenshot({ path: `${SHOTS}/notice-unread-chips.png` }).catch(() => {})
  }

  // ── 2. 알림 꺼진 김지원이 읽으면: 근무자만 남고 🔕 안내 없음
  await rest(`messages?thread_user_id=eq.${AP}&job_id=eq.${J}`, 'PATCH', { read_at: new Date().toISOString() })
  await open()
  ok("김지원이 읽으면 '근무자'만 · 🔕 안내 없음", JSON.stringify((await people.allTextContents()).map(one)) === '["근무자"]' && (await card.locator('[data-push-off-note]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
