// 묶음 156 (사용자 요청 2026-11-09 "분단위 인정은 기본이 안되게 해줘 · 30분 단위가 기본단위야")
// · 새 공고의 '근무시간 절사' 기본값: 1분 단위 → 30분 단위 (화면 기본 선택 + 저장할 때 값이 없으면 서버도 30분)
// · 이미 있는 공고는 고른 단위 그대로 (수정 화면도 원래 값)
// node scripts/qa/batch156.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)) } return null }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const unit = a.locator('select[name=round_unit]').first()

  // ── 1. 새 공고: 기본 30분 단위
  await a.goto(`${D}/admin/jobs/new`)
  await unit.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  ok("새 공고 '근무시간 절사' 기본값 30분 단위", (await unit.inputValue().catch(() => '')) === '30', await unit.inputValue().catch(() => ''))
  ok("고르는 칸은 그대로 (1분·10분·15분·30분)", (await unit.locator('option').allInnerTexts()).join(',') === '1분 단위,10분 단위,15분 단위,30분 단위')

  // 그대로 등록하면 30분 단위로 저장
  const title = `절사 기본 확인 ${Date.now() % 100000}`
  const t1 = new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10)
  await a.locator('input[name=title]').fill(title)
  await a.locator('input[name=start_date]').fill(t1)
  await a.locator('input[name=end_date]').fill(t1).catch(() => {})
  await a.getByRole('button', { name: '공고 등록' }).last().click()
  const made = await until(async () => (await rest('jobs')).find((j) => j.title === title))
  ok('그대로 등록하면 30분 단위로 저장', made?.round_unit === 30, JSON.stringify(made && { round_unit: made.round_unit }))

  // ── 2. 이미 있는 공고(1분 단위)는 수정 화면에서도 1분 그대로
  const [j] = await rest(`jobs?id=eq.${J}`)
  await a.goto(`${D}/admin/jobs/${J}/edit`)
  await unit.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  ok(`이미 있는 공고는 원래 단위 그대로 (${j.round_unit}분)`, (await unit.inputValue().catch(() => '')) === String(j.round_unit), await unit.inputValue().catch(() => ''))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
