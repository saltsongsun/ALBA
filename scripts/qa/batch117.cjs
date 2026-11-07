// 묶음 117 (정기 개선 2026-11-07 10:35 · 디자인 원칙 "많은 정보도 심플하게")
// · 공고 등록: 날짜·시각을 쓰는 대로 확인 (실수 막기)
//   시작일 '11/8(일)' 요일 · 지난 날짜면 '지난 날짜 · 11/6(금)' (주황) · 고치기에서 원래 날짜는 그대로 (이미 시작한 행사)
//   종료일 '11/10(화) · 3일' · 시작일보다 빠르면 '시작일보다 빨라요' (주황 · 저장하면 서버가 막는 것)
//   종료 시각 '휴게 빼고 8시간' · 시작보다 이르면 '다음날 06:00 끝 (밤샘)'
// · 지난 근무: 파란 큰 상자 대신 흰 카드 하나 (실수령만 크게 · 근무일·행사 수는 오른쪽 작게 · 숫자 올라가기 그대로)
// node scripts/qa/batch117.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const WD = ['일', '월', '화', '수', '목', '금', '토']
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]})`

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await pg(A)
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const hintOf = (name) => a.locator(`input[name=${name}]`).locator('xpath=following-sibling::*[contains(@class,"hint")][1]')
  const hint = async (name) => ((await hintOf(name).innerText().catch(() => '')) || '').trim()
  const warn = async (name) => (await hintOf(name).getAttribute('data-warn').catch(() => null)) !== null
  const oneLine = (name) => hintOf(name).evaluate((el) => el.getClientRects().length === 1).catch(() => false)
  const set = async (name, v) => { await a.locator(`input[name=${name}]`).fill(v); await a.waitForTimeout(250) }

  // ── 1. 새 공고: 날짜 ──
  await a.goto(`${D}/admin/jobs/new`)
  await a.locator('input[name=start_date]').waitFor({ timeout: 15000 }).catch(() => {})
  const y = addDays(today, -1), t1 = addDays(today, 1), t3 = addDays(today, 3)
  await set('start_date', y)
  ok(`어제 날짜: '지난 날짜 · ${md(y)}' (주황 · 한 줄)`, (await hint('start_date')) === `지난 날짜 · ${md(y)}` && (await warn('start_date')) && (await oneLine('start_date')), await hint('start_date'))
  await set('start_date', t1)
  ok(`내일: '${md(t1)}' 요일만 (안내)`, (await hint('start_date')) === md(t1) && !(await warn('start_date')), await hint('start_date'))
  await set('end_date', today)
  ok("종료일이 시작일보다 빠르면 '시작일보다 빨라요' (주황)", (await hint('end_date')) === '시작일보다 빨라요' && (await warn('end_date')), await hint('end_date'))
  await set('end_date', t3)
  ok(`종료일 '${md(t3)} · 3일'`, (await hint('end_date')) === `${md(t3)} · 3일` && !(await warn('end_date')) && (await oneLine('end_date')), await hint('end_date'))
  await set('end_date', '')
  ok("종료일 비우면 '하루짜리면 비워 두세요'", (await hint('end_date')) === '하루짜리면 비워 두세요')

  // ── 2. 새 공고: 시각 ──
  await set('start_time', '09:00')
  await set('end_time', '18:00')
  ok("09:00~18:00: '휴게 빼고 8시간'", (await hint('end_time')) === '휴게 빼고 8시간', await hint('end_time'))
  await set('start_time', '22:00')
  await set('end_time', '06:00')
  ok("22:00~06:00: '다음날 06:00 끝 (밤샘)' (한 줄)", (await hint('end_time')) === '다음날 06:00 끝 (밤샘)' && (await oneLine('end_time')), await hint('end_time'))
  ok('360px: 옆으로 안 밀림 (공고 등록)', await wide(a))
  if (SHOTS) await a.locator('input[name=start_date]').locator('xpath=ancestor::div[contains(@class,"grid")][1]').screenshot({ path: `${SHOTS}/dates.png` }).catch(() => {})

  // ── 3. 이미 시작한 공고 고치기: 원래 시작일은 '지난 날짜'로 안 봄 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: y })
  await a.goto(`${D}/admin/jobs/${J}/edit`)
  await a.locator('input[name=start_date]').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  if (!(await a.locator('input[name=start_date]').isVisible())) await a.locator('summary', { hasText: '일정' }).first().click().catch(() => {})
  await set('headcount', '6')
  ok(`이미 시작한 행사: 시작일 '${md(y)}' (지난 날짜 경고 없음)`, (await hint('start_date')) === md(y) && !(await warn('start_date')), await hint('start_date'))

  // ── 4. 지난 근무: 흰 카드 하나 ──
  const w = await pg(W)
  await w.goto(`${D}/me/history`)
  const hero = w.locator('[data-history-hero]')
  await hero.waitFor({ timeout: 15000 }).catch(() => {})
  const look = await hero.evaluate((el) => { const cs = getComputedStyle(el); return { img: cs.backgroundImage, color: cs.color, h: Math.round(el.getBoundingClientRect().height) } }).catch(() => ({}))
  ok('지난 근무 위 카드: 파란 그라데이션 없음 · 낮게', look.img === 'none' && look.h < 100, JSON.stringify(look))
  ok("'실수령' 크게 + '근무 n일' · '행사 n곳'", ['실수령', '근무', '행사'].every((k) => true) && (await hero.locator('[data-summary=실수령] [data-value]').count()) === 1 && (await hero.locator('[data-summary=근무]').innerText()).includes('일') && (await hero.locator('[data-summary=행사]').innerText()).includes('곳'))
  ok('360px: 옆으로 안 밀림 (지난 근무)', await wide(w))
  if (SHOTS) await hero.screenshot({ path: `${SHOTS}/history-hero.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
