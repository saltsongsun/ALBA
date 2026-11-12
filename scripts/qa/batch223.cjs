// 묶음 223 (정기 개선 2026-11-12 23:36 KST)
// · 지원자 탭: 마지막 날 근무까지 끝난 행사(오늘 저녁 포함)에 대기 지원자가 남았으면
//   '🙏 대기 n명 미선발 알림'이 먼저(파란 버튼) · '대기 n명 모두 확정'은 흰 버튼으로 뒤에 (확정은 한 번 더 확인 그대로)
//   — 전에는 오늘 끝난 행사도 '모두 확정'이 파란 첫 버튼이고 미선발은 '마감하고 …'로만 보였음
//   아직 근무가 남은 공고는 전과 같음 ('모두 확정' 파란 버튼 · '마감하고 대기 n명 미선발 알림')
// · 정산·신고자료 / 주간 근무·주휴로 갈 때: 대시보드 모양 대신 그 화면 모양의 회색 자리
// node scripts/qa/batch223.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)

;(async () => {
  const today = kst(0)
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const openApps = async () => {
    await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
    await a.locator('[data-approve-all]').waitFor({ timeout: 15000 }).catch(() => {})
  }
  const approveBtn = a.locator('[data-approve-all] button')
  const notify = a.locator('[data-ended-notify] button')

  // ── 1. 아직 근무가 남은 공고 (오늘 0시~23:59): 전과 같음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '23:59:00', status: 'open', headcount: 5 })
  await openApps()
  ok("근무가 남은 공고: '모두 확정'이 파란 버튼 · '마감하고 대기 1명 미선발 알림' · 끝난 행사 알림 버튼 없음", ((await approveBtn.getAttribute('class')) ?? '').includes('btn-primary') && (await a.locator('[data-close-notify]').count()) === 1 && (await notify.count()) === 0)

  // ── 2. 오늘 근무가 끝난 공고 (0시~0시 1분): 미선발 알림이 먼저 · 파란 버튼
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '00:01:00' })
  await openApps()
  ok("끝난 행사 표시 + '🙏 대기 1명 미선발 알림' 파란 버튼", (await a.locator('[data-apps-ended]').count()) === 1 && one(await notify.innerText().catch(() => '')) === '🙏 대기 1명 미선발 알림' && ((await notify.getAttribute('class')) ?? '').includes('btn-primary'))
  ok("'모두 확정'은 흰 버튼 · 미선발 알림 뒤에", ((await approveBtn.getAttribute('class')) ?? '').includes('btn-white') && (await a.locator('[data-ended-notify]').evaluate((el) => !!(el.compareDocumentPosition(document.querySelector('[data-approve-all]')) & Node.DOCUMENT_POSITION_FOLLOWING))))
  ok("'마감하고 …' 버튼은 겹쳐 나오지 않음", (await a.locator('[data-close-notify]').count()) === 0)
  ok('360px 옆으로 안 밀림 (지원자 탭)', await noSide(a))
  if (SHOTS) {
    await a.locator('[data-ended-notify]').scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(300)
    const bx = await a.locator('[data-ended-notify]').locator('xpath=ancestor::div[2]').boundingBox()
    if (bx) await a.screenshot({ path: `${SHOTS}/ended-notify.png`, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: Math.min(bx.height + 16, 260) } }).catch(() => {})
  }
  // '모두 확정'은 한 번 더 확인 (실수로 눌러도 바로 확정 안 됨)
  await approveBtn.click()
  await a.waitForTimeout(300)
  ok("'모두 확정' 첫 누름은 '끝난 행사 · 1명 모두 확정?' 확인만", one(await approveBtn.innerText()).includes('끝난 행사 · 1명 모두 확정?') && (await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`))[0]?.status === 'applied')
  // 미선발 알림: 한 번 더 누르면 보냄
  await openApps()
  await notify.click()
  await a.waitForTimeout(250)
  ok("미선발 알림 첫 누름: '끝난 행사 · 대기 1명에게 미선발 알림?'", one(await notify.innerText()) === '끝난 행사 · 대기 1명에게 미선발 알림?')
  await notify.click()
  await a.waitForURL((u) => new URL(u).searchParams.has('m'), { timeout: 15000 }).catch(() => {})
  const [ap] = await rest(`applications?job_id=eq.${J}&user_id=eq.${AP}`)
  ok('두 번째 누름: 대기 지원자 미선발 처리', ap?.status === 'rejected', ap?.status)

  // ── 3. 정산·주간 화면으로 갈 때 그 화면 모양의 회색 자리
  const slow = async (path) => {
    await a.route(`**${path}**`, async (route) => {
      if (route.request().headers()['next-router-prefetch']) return route.continue()
      await new Promise((r) => setTimeout(r, 1500))
      route.continue().catch(() => {})
    })
  }
  for (const [path, key] of [['/admin/reports', 'reports'], ['/admin/weekly', 'weekly']]) {
    await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await slow(path)
    await a.locator(`a[href="${path}"]`).first().evaluate((el) => el.click())
    const shown = await a.locator(`[data-skeleton="${key}"]`).waitFor({ timeout: 3000 }).then(() => true, () => false)
    ok(`${path}로 갈 때: 그 화면 모양 회색 자리 (${key})`, shown)
    if (SHOTS && shown) await a.screenshot({ path: `${SHOTS}/skeleton-${key}.png`, clip: { x: 0, y: 0, width: 360, height: 520 } }).catch(() => {})
    await a.unroute(`**${path}**`)
    await a.waitForURL((u) => new URL(u).pathname === path, { timeout: 15000 }).catch(() => {})
    await a.locator(`[data-skeleton="${key}"]`).waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    ok(`${path} 다 불러오면 회색 자리 사라짐 · 옆으로 안 밀림`, (await a.locator(`[data-skeleton="${key}"]`).count()) === 0 && (await noSide(a)))
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
