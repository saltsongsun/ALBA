// 묶음 297 (정기 개선 2026-11-18 05:36 KST)
// · '일찍 누른 출근은 시작 시각부터 인정' 공고: 시작 시각 전에 근무를 시작했으면 근무 중 칸 아래 '일찍 시작했어요 · 급여는 HH:MM부터 계산돼요'
//   (일찍 와서 누른 시간까지 받는 줄 알지 않게 · 그 설정이 꺼진 공고 · 담당자가 시작을 고친 기록엔 안 보임)
// · 시작 한 시간도 더 전에 '근무 시작'을 누를 때 묻는 안내에도 '일찍 시작해도 급여는 HH:MM부터예요'
// · 근무 중 경과 시간: 분이 바뀔 때마다 숫자가 살짝 톡 (숫자 폭 고정)
// node scripts/qa/batch297.cjs <working_앱> <working_가짜> <fresh_앱> <fresh_가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, DF, MF, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', ATT = 'eeeeeeee-0000-4000-8000-000000000006'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const restOf = (M) => (p, method = 'GET', body) => fetch(`${M}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const rest = restOf(MD), restF = restOf(MF)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const kstHour = () => new Date(Date.now() + 9 * 3600e3).getUTCHours()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 오늘 00:30 ~ 23:59 근무 · '일찍 누른 출근은 시작 시각부터 인정' · 00:01에 근무 시작 (시작 전)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(0), end_date: kday(0), start_time: '00:30:00', end_time: '23:59:00', status: 'open', early_clamp: true })
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { clock_in: `${kday(0)}T00:01:00+09:00`, adj_in: null, clock_out: null })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, base) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: base }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W, D)
  const me = async (p = w, base = D) => {
    await p.goto(`${base}/me`, { waitUntil: 'networkidle' })
    await p.locator('main').waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 시작 전에 근무를 시작: '급여는 00:30부터'
  await me()
  const line = w.locator('[data-paid-from]')
  await line.waitFor({ timeout: 15000 }).catch(() => {})
  ok("근무 중 칸 아래 '일찍 시작했어요 · 급여는 00:30부터 계산돼요'", one(await line.textContent().catch(() => '')) === '일찍 시작했어요 · 급여는 00:30부터 계산돼요')
  ok('근무 중 칸 바로 아래 · 한 줄', await line.evaluate((el) => el.getBoundingClientRect().height < 22 && /근무 중/.test(el.previousElementSibling?.textContent ?? '')))
  const el = w.locator('[data-elapsed]')
  ok('경과 시간은 숫자 폭 고정 · 바뀔 때 톡', (await el.count()) === 1 && /tabular-nums/.test(await el.getAttribute('class')) && /animate-pop/.test(await el.getAttribute('class')) && /\d+(시간 \d+)?분/.test(await el.textContent()))
  ok('360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) await line.evaluate((e) => e.parentElement.scrollIntoView({ block: 'center' })).then(() => w.waitForTimeout(300)).then(() => w.locator('[data-paid-from]').locator('xpath=..').screenshot({ path: `${SHOTS}/paid-from.png` })).catch(() => {})

  // 관리자 출퇴근 탭도 같은 말 (조기 · 미인정)
  const a = await mk(A, D)
  await a.goto(`${D}/admin/jobs/${J}?tab=att`, { waitUntil: 'networkidle' })
  ok("관리자 출퇴근 탭: '조기 … (미인정)'", (await a.locator('main', { hasText: '(미인정)' }).count()) === 1)

  // ── 2. 설정이 꺼진 공고 · 담당자가 시작을 고친 기록: 안 보임
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: false })
  await me()
  ok('설정이 꺼진 공고엔 안 보임 (일찍 온 시간도 근무)', (await w.locator('[data-paid-from]').count()) === 0 && (await w.locator('[data-elapsed]').count()) === 1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: true })
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { adj_in: `${kday(0)}T00:30:00+09:00` })
  await me()
  ok('담당자가 시작을 고친 기록엔 안 보임', (await w.locator('[data-paid-from]').count()) === 0)
  // 시작 시각 뒤에 시작했으면 안 보임
  await rest(`attendance?id=eq.${ATT}`, 'PATCH', { adj_in: null, clock_in: `${kday(0)}T00:31:00+09:00` })
  await me()
  ok('시작 시각 뒤에 시작했으면 안 보임', (await w.locator('[data-paid-from]').count()) === 0)

  // ── 3. 출근 전 · 시작 한 시간도 더 전에 '근무 시작': 묻는 안내에 '급여는 HH:MM부터'
  if (kstHour() < 21) {
    await restF(`jobs?id=eq.${J}`, 'PATCH', { start_date: kday(0), end_date: kday(0), start_time: '23:00:00', end_time: '23:59:00', status: 'open', early_clamp: true })
    const f = await mk(W, DF)
    await me(f, DF)
    const btn = f.getByRole('button', { name: '근무 시작', exact: true })
    await btn.waitFor({ timeout: 15000 }).catch(() => {})
    await btn.click()
    const ask = f.locator('[data-early-start]')
    await ask.waitFor({ timeout: 8000 }).catch(() => {})
    ok("일찍 누르면 '현장에 왔으면 한 번 더' 아래 '일찍 시작해도 급여는 23:00부터예요'", one(await f.locator('[data-early-paid]').textContent().catch(() => '')) === '일찍 시작해도 급여는 23:00부터예요' && one(await ask.textContent()).includes('현장에 왔으면 한 번 더 눌러 주세요'))
    ok('한 번만 눌러서는 시작 안 됨', ((await restF(`attendance?user_id=eq.${W}`)) ?? []).length === 0)
    if (SHOTS) await ask.evaluate((e) => e.scrollIntoView({ block: 'center' })).then(() => f.waitForTimeout(300)).then(() => ask.locator('xpath=..').screenshot({ path: `${SHOTS}/early-paid.png` })).catch(() => {})
    await restF(`jobs?id=eq.${J}`, 'PATCH', { early_clamp: false })
    await me(f, DF)
    await f.getByRole('button', { name: '근무 시작', exact: true }).click()
    await f.locator('[data-early-start]').waitFor({ timeout: 8000 }).catch(() => {})
    ok('설정이 꺼진 공고면 그 줄 없음', (await f.locator('[data-early-start]').count()) === 1 && (await f.locator('[data-early-paid]').count()) === 0)
  } else {
    console.log('PASS  (밤 9시 뒤라 시작 한 시간 전 상황을 만들 수 없어 3번은 건너뜀)')
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
