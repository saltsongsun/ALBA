// 묶음 143 (정기 개선 2026-11-08 16:36 · 사용자 요청 "반복적인 일은 한 번에" 이어서)
// · 정산 탭: 미지급인 사람을 골라 '선택 n명 지급 완료' (나눠서 보낼 때) — 두 번 눌러야, 계좌 없는 사람이 섞이면 그 내용으로 한 번 더
//   고른 사람만 지급 완료 + 급여 알림, 안 고른 사람·근무 중인 사람은 그대로
// · 고른 줄은 파랗게 · 막대의 고른 수는 바뀔 때 톡 튐 · 지원자 카드도 고르면 파란 테두리
// node scripts/qa/batch143.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const X = 'bbbbbbbb-0000-4000-8000-0000000014b1', Y = 'bbbbbbbb-0000-4000-8000-0000000014b2', Z = 'bbbbbbbb-0000-4000-8000-0000000014b3'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const yday = kst(Date.now() - 864e5)
const at = (t) => new Date(`${yday}T${t}:00+09:00`).toISOString()
const paidOf = async (u) => (await rest(`attendance?job_id=eq.${J}&user_id=eq.${u}`)).map((a) => a.paid)

;(async () => {
  // 준비: 어제 일한 X·Y·Z (모두 퇴근 · 미지급 · 계좌 없음) + 오늘 근무 중인 근무자(W)
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  const [att] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  for (const [id, name] of [[X, '가나다'], [Y, '라마바'], [Z, '사아자']]) {
    const u = { ...w1, id, name, phone: `0106666${id.slice(-4)}`, bank_account_enc: null, created_at: new Date().toISOString() }
    await rest('users', 'POST', u)
    await rest('applications', 'POST', { ...wApp, id: undefined, user_id: id, user: u, position: null })
    await rest('attendance', 'POST', { ...att, id: undefined, user_id: id, work_date: yday, clock_in: at('09:00'), clock_out: at('18:00'), adj_in: null, adj_out: null, paid: false, paid_at: null, confirmed: true, note: null, user: { ...att.user, id, name } })
  }

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  const table = a.locator('[data-pay-table]')
  await table.waitFor({ timeout: 15000 }).catch(() => {})
  const boxes = table.locator('input[name="pay"]')
  ok('미지급(퇴근까지 끝난) 3명에게만 고르는 칸 · 근무 중인 사람은 없음', (await boxes.count()) === 3 && (await table.locator(`input[name="pay"][value="${W}"]`).count()) === 0, String(await boxes.count()))
  ok('표 머리에 모두 고르기', (await table.locator('th [data-pick-all] input').count()) === 1)
  const bar = a.locator('[data-pick-bar="pay-pick"]')
  ok('아무도 안 고르면 막대 없음', (await bar.count()) === 0)
  await table.locator(`input[name="pay"][value="${X}"]`).check()
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  ok("하나 고르면 '1명 · 선택 1명 지급 완료'", (await bar.innerText()).includes('선택 1명 지급 완료'), (await bar.innerText()).replace(/\n/g, ' / '))
  const row = table.locator(`tr:has(input[value="${X}"]) td`).first()
  ok('고른 줄은 고정된 이름 칸까지 파란 바탕', await row.evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgb(255, 255, 255)' && getComputedStyle(el).backgroundColor !== getComputedStyle(el.closest('tr').nextElementSibling.querySelector('td')).backgroundColor), await row.evaluate((el) => getComputedStyle(el).backgroundColor))
  ok('고른 줄의 다른 칸도 파랗게', await table.locator(`tr:has(input[value="${X}"]) td`).nth(2).evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(el).backgroundColor !== 'rgb(255, 255, 255)'))
  // 계좌 미등록 이름: 버튼 옆에 세로로 좁게 꺾이지 않고 한 줄 전체로 (두 줄까지)
  const na = a.locator('[data-no-account]')
  ok('계좌 미등록 이름이 넓게 한 줄 (세로로 좁게 안 꺾임)', await na.evaluate((el) => el.getBoundingClientRect().width > 250 && el.getBoundingClientRect().height < 50), await na.evaluate((el) => `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`))
  await table.locator(`input[name="pay"][value="${Y}"]`).check()
  await a.waitForTimeout(100)
  ok('고른 수가 바뀌면 숫자가 톡 (애니메이션)', await bar.locator('b').first().evaluate((el) => el.getAnimations().length > 0 || getComputedStyle(el).animationName === 'pop'))
  ok("둘 고르면 '선택 2명 지급 완료'", (await bar.innerText()).includes('선택 2명 지급 완료'))
  ok('막대가 아래 탭 위에 보임', await bar.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight - 64 && r.top >= 0 }))
  ok('막대 한 줄 (버튼이 두 줄로 안 꺾임)', await bar.locator('button[type="submit"]').evaluate((el) => el.getBoundingClientRect().height < 40))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/pay-pick.png` })
  const go = bar.locator('button[type="submit"]')
  await go.click()
  ok("계좌 없는 사람이 섞이면 '계좌 없음 2명 · 지급 완료?' (아직 안 바뀜)", (await go.innerText()) === '계좌 없음 2명 · 지급 완료?' && (await paidOf(X)).every((p) => !p), await go.innerText())
  ok('확인 문구일 때도 한 줄 · 옆으로 안 밀림', (await go.evaluate((el) => el.getBoundingClientRect().height < 40)) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  await Promise.all([a.waitForURL(/m=/, { timeout: 15000 }).catch(() => {}), go.click()])
  const m = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok("'2명을 지급 완료로 바꾸고 알렸어요.'", m === '2명을 지급 완료로 바꾸고 알렸어요.', m)
  ok('고른 둘만 지급 완료 · 안 고른 사람과 근무 중인 사람은 그대로', (await paidOf(X)).every(Boolean) && (await paidOf(Y)).every(Boolean) && (await paidOf(Z)).every((p) => !p) && (await paidOf(W)).every((p) => !p))
  const mx = await rest(`messages?thread_user_id=eq.${X}`)
  ok('급여 보낸 알림 (문의함)', mx.some((x) => String(x.body).includes('보냈어요')))
  ok('기록(audit)에 남음', (await rest('audit_logs')).some((r) => JSON.stringify(r).includes('pay.mark_paid_selected')))
  // 남은 미지급이 1명이면 고르는 칸은 숨김 ('모두 지급 완료' 하나로 충분)
  await a.waitForTimeout(300)
  ok('남은 미지급 1명: 고르는 칸 없음', (await a.locator('[data-pay-table] input[name="pay"]').count()) === 0)

  // 계좌 경고가 없으면 기본 확인 문구 (계좌 있는 사람을 고른 것처럼)
  await rest(`attendance?job_id=eq.${J}&user_id=eq.${X}`, 'PATCH', { paid: false, paid_at: null })
  await a.goto(`${D}/admin/jobs/${J}?tab=pay`)
  await table.waitFor({ timeout: 15000 }).catch(() => {})
  await table.locator('th [data-pick-all] input').check()
  await a.evaluate(() => document.querySelectorAll('input[name="pay"]').forEach((e) => e.removeAttribute('data-warn')))
  await table.locator(`input[name="pay"][value="${Z}"]`).uncheck()
  await bar.locator('button[type="submit"]').click()
  ok("기본 확인 문구 '1명 지급 완료 · 알릴까요?'", (await bar.locator('button[type="submit"]').innerText()) === '1명 지급 완료 · 알릴까요?', await bar.locator('button[type="submit"]').innerText())

  // 지원자 카드도 고르면 파란 테두리 (대시보드)
  const apApp = (await rest(`applications?job_id=eq.${J}&status=eq.applied`))[0]
  await rest('applications', 'POST', { ...apApp, id: '11111111-0000-4000-8000-0000000014b9', user_id: Y, user: { ...apApp.user, id: Y, name: '라마바' }, status: 'applied', held_at: null })
  await a.goto(`${D}/admin`)
  const card = a.locator('#pending .card').first()
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const ring = () => card.evaluate((el) => getComputedStyle(el).boxShadow)
  const before = await ring()
  await card.locator('input[name="app"]').check()
  await a.waitForTimeout(300)
  ok('지원자 카드: 고르면 테두리가 바뀜', (await ring()) !== before)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
