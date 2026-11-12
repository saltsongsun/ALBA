// 묶음 221 (정기 개선 2026-11-12 20:36 KST)
// · 여러 날 행사 지원 칩: 내 다른 근무와 시간이 겹치는 날을 미리 표시
//   확정된 근무와 겹치는 날은 처음부터 빼 둠 (주황 점 + '… 확정된 근무가 있어 뺐어요') — 다 고른 채 지원했다가 확정되고 못 나오는 일 막기
//   그래도 고르면 바로 아래 '⚠️ … 확정된 근무와 시간이 겹쳐요' (지원은 막지 않음) · 지원만 해 둔 공고와 겹치면 연한 점 + '다른 공고에 지원 중'
// · 칩을 고르면 ✓가 톡 · 고른 날 수와 예상 금액이 바뀔 때 숫자가 통 튐
// · 관리자 공고 화면: 마지막 날 근무 시간이 지나면 '모집중'이어도 단톡방 모집 문구 칸을 숨김
// node scripts/qa/batch221.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const JX = 'cccccccc-0000-4000-8000-0000000c2211', JY = 'cccccccc-0000-4000-8000-0000000c2212'
const N = '44444444-0000-4000-8000-000000022101', N2 = '44444444-0000-4000-8000-000000022102'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const label = (d) => { const t = new Date(d + 'T00:00:00Z'); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}(${'일월화수목금토'[t.getUTCDay()]})` }
const nums = (s) => (s.match(/[\d,]+원/g) ?? []).map((x) => Number(x.replace(/[^\d]/g, '')))

;(async () => {
  const [d1, d2, d3] = [kst(1), kst(2), kst(3)]
  // 3일 행사 (내일부터) · 09~18시
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: d1, end_date: d3, start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const nowIso = new Date().toISOString()
  // 다른 근무: d2 10~15시 확정 · d3 08~12시 지원만
  const jx = { ...j1, id: JX, title: '다른 행사 확정 근무', start_date: d2, end_date: d2, start_time: '10:00:00', end_time: '15:00:00', applications: [], created_at: nowIso }
  const jy = { ...j1, id: JY, title: '다른 행사 지원만', start_date: d3, end_date: d3, start_time: '08:00:00', end_time: '12:00:00', applications: [], created_at: nowIso }
  await rest('jobs', 'POST', jx)
  await rest('jobs', 'POST', jy)
  const [w] = await rest(`users?id=eq.${W}`)
  const u = { ...w, id: N, name: '겹침확인', phone: '01022100001', photo_at: nowIso }
  await rest('users', 'POST', u)
  await rest('users', 'POST', { ...w, id: N2, name: '겹침없음', phone: '01022100002', photo_at: nowIso })
  const lite = (j) => ({ id: j.id, title: j.title, start_date: j.start_date, end_date: j.end_date, start_time: j.start_time, end_time: j.end_time, status: j.status })
  const appRow = (id, j, status) => ({ id, job_id: j.id, user_id: N, company_id: j.company_id, status, available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, held_at: null, created_at: nowIso, user: u, job: lite(j) })
  await rest('applications', 'POST', appRow('55555555-0000-4000-8000-000000022111', jx, 'approved'))
  await rest('applications', 'POST', appRow('55555555-0000-4000-8000-000000022112', jy, 'applied'))

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 겹치는 날 표시
  const p = await mk(N)
  await p.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  const box = (d) => p.locator(`input[name=dates][value="${d}"]`)
  const chip = (d) => p.locator(`label[data-day="${d}"]`)
  await box(d1).waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  ok('겹치지 않는 날은 그대로 골라 둠 (점 없음)', (await box(d1).isChecked()) && (await chip(d1).locator('[data-busy-dot]').count()) === 0)
  ok('확정 근무와 겹치는 날은 처음부터 뺌 · 진한 주황 점', !(await box(d2).isChecked()) && (await chip(d2).getAttribute('data-busy')) === 'approved' && (await chip(d2).locator('[data-busy-dot]').count()) === 1)
  ok('지원만 한 공고와 겹치는 날은 골라 둔 채 연한 점', (await box(d3).isChecked()) && (await chip(d3).getAttribute('data-busy')) === 'applied')
  const off = one(await p.locator('[data-busy-off]').innerText().catch(() => ''))
  ok(`안내 '${label(d2)} 확정된 근무가 있어 뺐어요' (한 줄)`, off === `${label(d2)} 확정된 근무가 있어 뺐어요` && (await p.locator('[data-busy-off]').evaluate((el) => el.getBoundingClientRect().height < 22)), off)
  ok(`안내 '${label(d3)} 다른 공고에 지원 중'`, one(await p.locator('[data-busy-applied]').innerText().catch(() => '')) === `${label(d3)} 다른 공고에 지원 중`)
  const summary = () => p.locator('p', { hasText: '일 선택' }).first().innerText().catch(() => '')
  const s1 = one(await summary())
  const per = nums(s1)[1]
  ok('처음엔 2일 선택 · 예상 금액 = 하루 × 2', s1.startsWith('2일 선택') && nums(s1)[0] === per * 2, s1)
  ok('고른 칩엔 ✓ · 안 고른 칩엔 없음', (await chip(d1).locator('[data-day-check]').count()) === 1 && (await chip(d2).locator('[data-day-check]').count()) === 0)
  ok('360px 옆으로 안 밀림 (공고)', await noSide(p))
  if (SHOTS) {
    await p.locator('[data-busy-note]').scrollIntoViewIfNeeded().catch(() => {})
    await p.waitForTimeout(400)
    const bx = await p.locator('label[data-day]').first().locator('xpath=ancestor::div[2]').boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/busy-days.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: bx.height + 60 } }).catch(() => {})
  }

  // ── 2. 그래도 고르면 경고 + ✓ 톡 + 숫자 통
  await chip(d2).click()
  await p.waitForTimeout(120)
  const dayBump = ((await p.locator('p', { hasText: '일 선택' }).first().locator('[data-value]').getAttribute('class')) ?? '').includes('animate-bump')
  await p.waitForTimeout(400)
  const warn = p.locator('[data-busy-warn]')
  ok(`고르면 바로 '⚠️ ${label(d2)} 확정된 근무와 시간이 겹쳐요'`, (await box(d2).isChecked()) && one(await warn.innerText().catch(() => '')) === `⚠️ ${label(d2)} 확정된 근무와 시간이 겹쳐요` && (await p.locator('[data-busy-off]').count()) === 0)
  ok('고른 칩에 ✓가 톡 (pop)', ((await chip(d2).locator('[data-day-check]').getAttribute('class')) ?? '').includes('animate-pop'))
  const s2 = one(await summary())
  const won = Number(await p.locator('[data-won]').getAttribute('data-won'))
  ok('3일 선택 (날 수가 통 튐) · 금액은 하루 × 3까지 굴러감', s2.startsWith('3일 선택') && dayBump && nums(s2)[0] === per * 3 && won === per * 3, `${s2} bump=${dayBump}`)
  ok('세 칩을 다 골라도 한 줄 (✓로 넓어져도 줄바꿈 없음)', await p.locator('label[data-day]').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size === 1))
  if (SHOTS) {
    const bx = await p.locator('label[data-day]').first().locator('xpath=ancestor::div[2]').boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/busy-warn.png`, clip: { x: 0, y: Math.max(0, bx.y - 12), width: 360, height: bx.height + 60 } }).catch(() => {})
  }
  await chip(d2).click()
  await p.waitForTimeout(120)
  ok('다시 빼면 경고 사라지고 원래 안내로', (await warn.count()) === 0 && (await p.locator('[data-busy-off]').count()) === 1)

  // ── 3. 기본 선택대로 지원하면 겹치는 날이 빠진 채 접수
  await p.getByRole('button', { name: /으로 지원하기/ }).click()
  await p.getByRole('button', { name: '한 번 더 누르면 지원돼요' }).click({ timeout: 8000 }).catch(() => {})
  await p.getByText('지원이 접수됐어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  const [app] = await rest(`applications?job_id=eq.${J}&user_id=eq.${N}`)
  ok('겹치는 날(확정)을 뺀 날로 지원됨', JSON.stringify(app?.available_dates) === JSON.stringify([d1, d3]), JSON.stringify(app?.available_dates))

  // ── 4. 겹치는 근무가 없으면 전처럼 (점·안내 없이 모두 골라 둠)
  const q = await mk(N2)
  await q.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  await q.locator(`input[name=dates][value="${d1}"]`).waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  const checked = await q.locator('input[name=dates]').evaluateAll((els) => els.map((e) => e.checked))
  ok('겹치는 근무가 없으면 모두 골라 둠 · 점·안내 없음', checked.length === 3 && checked.every(Boolean) && (await q.locator('[data-busy-dot]').count()) === 0 && (await q.locator('[data-busy-note]').count()) === 0)

  // ── 5. 관리자: 마지막 날 근무 시간이 지나면 모집 문구 칸 숨김
  const a = await mk(A)
  const card = a.locator('[data-recruit-text]')
  const today = kst(0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: today, end_date: today, start_time: '00:00:00', end_time: '00:01:00', status: 'open' })
  await a.goto(`${D}/admin/jobs/${J}`, { waitUntil: 'networkidle' })
  await a.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("오늘 근무가 끝난 공고: '모집중'이어도 모집 문구 칸 없음", (await card.count()) === 0)
  ok('360px 옆으로 안 밀림 (관리자 공고)', await noSide(a))
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  await a.reload({ waitUntil: 'networkidle' })
  await a.locator('[data-job-tabs]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('근무 시간이 남아 있으면 모집 문구 칸 그대로', (await card.count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
