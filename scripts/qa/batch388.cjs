// 묶음 388 (사용자 요청 2026-11-25 '지원자 탭 uiux 정리')
// 지원자 탭 위쪽: 요약 → 할 일(확정·미선발) → 주휴 한 줄 → 확정자 연락 순서 · 내용·버튼은 그대로
// · 모집 중: '대기 n명 모두 확정' 파란 버튼 · '마감하고 대기 n명 미선발 알림' · '이전 근무자에게 알리기·번호로 추가'는 목록 위
// · 인원이 다 참: 요약 줄 '✓ 인원 다 참' · '🙏 대기 n명 미선발 알림'이 먼저(파란 버튼) · '모두 확정'은 흰 버튼(한 번 더 확인 그대로)
//   · 미선발 버튼은 한 개만 · '번호로 추가'는 목록 아래로 · 360px 옆으로 안 밀림
// node scripts/qa/batch388.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', APP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
// a가 b보다 화면(문서)에서 먼저 나오는지
const before = (p, a, b) => p.evaluate(([x, y]) => { const ea = document.querySelector(x), eb = document.querySelector(y); return !!(ea && eb && ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING) }, [a, b])
const lastList = '[data-app-list]'

;(async () => {
  const day = kst(3)
  // 사흘 뒤 하루 행사 · 확정 1명 + 대기 4명 (기존 대기 1명 + 3명 더)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day, end_date: day, start_time: '09:00:00', end_time: '18:00:00', status: 'open', headcount: 10 })
  await rest(`applications?id=eq.${APP}`, 'PATCH', { available_dates: null })
  const [ap] = await rest(`applications?id=eq.${APP}`)
  const [u0] = await rest(`users?id=eq.${ap.user_id}`)
  for (let i = 1; i <= 3; i++) {
    const uid = `bbbbbbbb-0000-4000-8000-0000003880${i}0`
    const phone = `0103880000${i}`
    if (u0) await rest('users', 'POST', { ...u0, id: uid, name: `대기${i}`, phone })
    await rest('applications', 'POST', { ...ap, id: `11111111-0000-4000-8000-0000003880${i}0`, user_id: uid, available_dates: null, created_at: `2026-10-0${2 + i}T00:00:00Z`, user: { ...ap.user, id: uid, name: `대기${i}`, phone } })
  }

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const openApps = async () => {
    await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' })
    await a.locator('[data-apps-head]').waitFor({ timeout: 15000 }).catch(() => {})
  }
  const head = a.locator('[data-apps-head]')
  const approveBtn = a.locator('[data-approve-all] button')
  const settle = a.locator('[data-settle-first] button')

  // ── 1. 모집 중 (10명 모집 · 확정 1명): 전과 같은 버튼 · 사람 더 모으기는 목록 위
  await openApps()
  const sum1 = one(await head.locator('p').first().innerText().catch(() => ''))
  ok("요약 줄 '확정 1 / 모집 10명 · 대기 4명' (맨 위) · '인원 다 참' 없음", sum1.startsWith('확정 1 / 모집 10명 · 대기 4명') && (await a.locator('[data-apps-full]').count()) === 0, sum1)
  ok("'대기 4명 모두 확정' 파란 버튼 · '마감하고 대기 4명 미선발 알림' · 먼저 미선발 버튼 없음", one(await approveBtn.innerText().catch(() => '')) === '대기 4명 모두 확정' && ((await approveBtn.getAttribute('class')) ?? '').includes('btn-primary') && one(await a.locator('[data-close-notify] button').innerText().catch(() => '')) === '🙏 마감하고 대기 4명 미선발 알림' && (await settle.count()) === 0)
  ok('할 일 버튼 줄이 요약 바로 아래 · 확정자 문자는 그 아래 (같은 묶음 안)', (await head.locator('[data-apps-decide]').count()) === 1 && (await before(a, '[data-apps-head] > p', '[data-apps-decide]')) && one(await head.innerText().catch(() => '')).includes('확정 1명에게 문자') && (await head.evaluate((el) => { const d = el.querySelector('[data-apps-decide]'); const all = [...el.querySelectorAll('a,button')].filter((x) => /확정 1명에게 문자/.test(x.textContent || '')); return all.length > 0 && all.every((x) => d.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) })))
  ok("모집 중: '번호로 추가'는 지원자 목록 위", (await a.locator('[data-apps-add] [data-direct-add]').count()) === 1 && (await before(a, '[data-apps-add]', lastList)))
  ok('360px 옆으로 안 밀림 (모집 중)', await noSide(a))
  if (SHOTS) {
    await head.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(350)
    await a.screenshot({ path: `${SHOTS}/apps-open.png` }).catch(() => {})
  }

  // ── 2. 인원이 다 참 (모집 1명 · 확정 1명): 미선발 알림이 먼저
  await rest(`jobs?id=eq.${J}`, 'PATCH', { headcount: 1 })
  await openApps()
  const full = a.locator('[data-apps-full]')
  ok("요약 줄에 '✓ 인원 다 참' (톡 나타남)", one(await full.innerText().catch(() => '')) === '✓ 인원 다 참' && ((await full.getAttribute('class')) ?? '').includes('animate-pop'))
  ok("'🙏 대기 4명 미선발 알림' 파란 버튼이 먼저 · 끝난 행사 표시는 없음", one(await settle.innerText().catch(() => '')) === '🙏 대기 4명 미선발 알림' && ((await settle.getAttribute('class')) ?? '').includes('btn-primary') && (await a.locator('[data-ended-notify]').count()) === 0 && (await a.locator('[data-apps-ended]').count()) === 0)
  ok("'모두 확정'은 흰 버튼 · 미선발 알림 뒤에", ((await approveBtn.getAttribute('class')) ?? '').includes('btn-white') && (await before(a, '[data-settle-first]', '[data-approve-all]')))
  ok('미선발 알림 버튼은 한 개만 (마감하고 … 버튼 겹치지 않음)', (await a.locator('[data-apps-decide] button', { hasText: '미선발 알림' }).count()) === 1 && (await a.locator('[data-close-notify]').count()) === 0)
  ok("인원 다 참: '번호로 추가'는 지원자 목록 아래", (await a.locator('[data-apps-add] [data-direct-add]').count()) === 1 && (await before(a, lastList, '[data-apps-add]')))
  ok('360px 옆으로 안 밀림 (인원 다 참)', await noSide(a))
  const rowH = await a.locator('[data-apps-decide]').evaluate((el) => el.getBoundingClientRect().height).catch(() => 999)
  ok('할 일 버튼 두 개가 한 줄 (360px)', rowH < 48, String(rowH))
  if (SHOTS) {
    await head.scrollIntoViewIfNeeded().catch(() => {})
    await a.waitForTimeout(350)
    await a.screenshot({ path: `${SHOTS}/apps-full.png` }).catch(() => {})
  }
  // 미선발 알림은 한 번 더 누르기 (바로 보내지 않음)
  await settle.click()
  await a.waitForTimeout(250)
  ok("미선발 알림은 한 번 더 확인 '대기 4명 미선발 · 알림 보낼까요?'", one(await settle.innerText().catch(() => '')) === '대기 4명 미선발 · 알림 보낼까요?' && ((await rest(`applications?job_id=eq.${J}&status=eq.rejected`)) ?? []).length === 0)
  // '모두 확정'도 한 번 더 확인 그대로
  await approveBtn.click()
  await a.waitForTimeout(250)
  ok("'모두 확정'도 한 번 더 확인 (모집 1명 → 5명)", one(await approveBtn.innerText().catch(() => '')) === '모집 1명 → 5명 돼요 · 확정?' && ((await rest(`applications?job_id=eq.${J}&status=eq.approved`)) ?? []).length === 1, one(await approveBtn.innerText().catch(() => '')))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
