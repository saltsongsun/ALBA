// 묶음 144 (정기 개선 2026-11-08 17:35)
// · 서류 탭(계약서를 종이·다른 서비스로 받는 공고): 안 받은 사람이 둘 이상이면 고르는 칸 + 모두 고르기 → '선택 n명 받음으로' (두 번 눌러야)
//   고른 사람만 받음으로 · 고른 줄은 파랗게 · 이미 받은 사람은 칸 없음 · 다른 공고의 지원은 끼워 넣어도 안 바뀜
// · 공고를 한 번도 안 올린 새 회사 대시보드: 0만 있는 숫자 칸·빈 칸 대신 '시작하기'에 집중 (batch31에서 확인)
// node scripts/qa/batch144.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const X = 'bbbbbbbb-0000-4000-8000-0000000014c1', Y = 'bbbbbbbb-0000-4000-8000-0000000014c2'
const XA = '11111111-0000-4000-8000-0000000014c1', YA = '11111111-0000-4000-8000-0000000014c2', OTHER = '11111111-0000-4000-8000-0000000014cf'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const rcvOf = async (id) => (await rest(`applications?id=eq.${id}`))[0]?.contract_received_at ?? null

;(async () => {
  // 준비: 종이로 받는 공고 · 확정 3명(근무자·X·Y) 모두 아직 안 받음 · 다른 공고의 확정 지원 1건
  await rest(`jobs?id=eq.${J}`, 'PATCH', { contract_method: 'paper' })
  const [w1] = await rest(`users?id=eq.${W}`)
  const [wApp] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest(`applications?id=eq.${wApp.id}`, 'PATCH', { contract_received_at: null })
  for (const [id, aid, name] of [[X, XA, '하나둘'], [Y, YA, '셋넷']]) {
    const u = { ...w1, id, name, phone: `0104444${id.slice(-4)}`, created_at: new Date().toISOString() }
    await rest('users', 'POST', u)
    await rest('applications', 'POST', { ...wApp, id: aid, user_id: id, user: u, status: 'approved', contract_received_at: null, position: null })
  }
  await rest('applications', 'POST', { ...wApp, id: OTHER, job_id: 'cccccccc-0000-4000-8000-0000000014cf', user_id: X, status: 'approved', contract_received_at: null, job: { ...wApp.job, id: 'cccccccc-0000-4000-8000-0000000014cf' } })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/jobs/${J}?tab=docs`)
  const boxes = a.locator('input[name="rcv"]')
  await boxes.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('안 받은 3명에게 고르는 칸', (await boxes.count()) === 3, String(await boxes.count()))
  const all = a.locator('[data-pick-all]').filter({ hasText: '모두 고르기' })
  ok("'안 받은 3명' + 모두 고르기", (await a.locator('li:has([data-pick-all])').innerText()).startsWith('안 받은 3명') && (await all.count()) === 1)
  const bar = a.locator('[data-pick-bar="rcv-pick"]')
  ok('아무도 안 고르면 막대 없음', (await bar.count()) === 0)
  await all.locator('input').check()
  await bar.waitFor({ timeout: 5000 }).catch(() => {})
  ok("모두 고르기 → '선택 3명 받음으로'", (await bar.innerText()).includes('선택 3명 받음으로'), (await bar.innerText()).replace(/\n/g, ' / '))
  await a.locator(`input[name="rcv"][value="${wApp.id}"]`).uncheck()
  await a.waitForTimeout(150)
  ok("하나 풀면 '선택 2명 받음으로'", (await bar.innerText()).includes('선택 2명 받음으로'))
  const row = a.locator(`[data-rcv-row]:has(input[value="${XA}"])`)
  ok('고른 줄은 파랗게', await row.evaluate((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)'))
  ok('막대가 아래 탭 위에 보임 · 한 줄', await bar.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight - 64 && r.top >= 0 && el.querySelector('button[type="submit"]').getBoundingClientRect().height < 40 }))
  // 다른 공고의 지원 id를 몰래 끼워 넣음
  await a.evaluate((id) => { const i = document.createElement('input'); i.type = 'checkbox'; i.name = 'rcv'; i.value = id; i.checked = true; i.setAttribute('form', 'rcv-pick'); i.hidden = true; document.body.append(i) }, OTHER)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/docs-rcv.png` })
  const go = bar.locator('button[type="submit"]')
  await go.click()
  ok("첫 누름: '3명 받음으로 표시할까요?' (아직 안 바뀜)", (await go.innerText()).includes('받음으로 표시할까요?') && !(await rcvOf(XA)), await go.innerText())
  ok('확인 문구일 때도 한 줄 · 옆으로 안 밀림', (await go.evaluate((el) => el.getBoundingClientRect().height < 40)) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  await Promise.all([a.waitForURL(/m=/, { timeout: 15000 }).catch(() => {}), go.click()])
  const m = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok("'2명을 받음으로 표시했어요.' (다른 공고 것은 빠짐)", m === '2명을 받음으로 표시했어요.', m)
  ok('고른 둘만 받음 · 안 고른 사람·다른 공고는 그대로', !!(await rcvOf(XA)) && !!(await rcvOf(YA)) && !(await rcvOf(wApp.id)) && !(await rcvOf(OTHER)))
  ok('기록(audit)에 남음', (await rest('audit_logs')).some((r) => JSON.stringify(r).includes('contract.received_selected')))
  await a.waitForTimeout(300)
  ok('남은 1명: 고르는 칸 없음 (그 줄의 받음 버튼으로)', (await a.locator('input[name="rcv"]:visible').count()) === 0)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
