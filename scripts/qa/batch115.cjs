// 묶음 115 (정기 개선 2026-11-07 08:35 · 회사별 설정 · 디자인 원칙 "많은 정보도 심플하게")
// · 실수 막기: 최저임금보다 적은 금액을 쓰는 대로 알려 줌
//   - 공고 등록: 시급 '최저 10,320원 미만' · 일급은 근무시간 기준 '최저 82,560원 미만' (저장하면 서버가 막는 것과 같은 기준)
//   - 회사 설정 기본 시급: '2026년 최저 10,320원보다 적어요 / 저장하면 10,320원으로 맞춰져요' (서버가 말없이 올려 맞추던 것을 미리)
// · 회사 설정 단순하게: 관리자 제목 선 아이콘(그림 글자 없음) · 초대 코드 버튼 셋 한 줄('새 코드') · 회사 정보 안내 짧은 두 줄
// node scripts/qa/batch115.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wide = () => a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const typeIn = async (sel, v) => { const el = a.locator(sel); await el.fill(''); await el.pressSequentially(String(v), { delay: 10 }); await a.waitForTimeout(250) }
  const hintAfter = (sel) => a.locator(sel).locator('xpath=following-sibling::*[contains(@class,"hint")][1]')

  // ── 1. 공고 고치기: 시급·일급 ──
  await a.goto(`${D}/admin/jobs/${J}/edit`)
  await a.locator('input[name=hourly_wage]').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  // 급여 칸이 접혀 있으면 펼침
  if (!(await a.locator('input[name=hourly_wage]').isVisible())) await a.locator('summary', { hasText: '시급' }).first().click().catch(() => {})
  const hh = hintAfter('input[name=hourly_wage]')
  await typeIn('input[name=hourly_wage]', 9000)
  ok("시급 9,000원: '최저 10,320원 미만' (주황 · 한 줄)", (await hh.innerText()).trim() === '최저 10,320원 미만' && (await hh.getAttribute('data-warn')) !== null && (await hh.evaluate((el) => el.getClientRects().length === 1)), await hh.innerText())
  ok('시급 칸 노란 테두리', (await a.locator('input[name=hourly_wage]').getAttribute('data-missing')) !== null)
  await typeIn('input[name=hourly_wage]', 12000)
  ok("시급 12,000원: '2026년 최저 10,320원' (안내만)", (await hh.innerText()).trim() === '2026년 최저 10,320원' && (await hh.getAttribute('data-warn')) === null)
  await a.locator('select[name=pay_type]').selectOption('daily')
  await a.waitForTimeout(250)
  const dh = hintAfter('input[name=daily_wage]')
  await typeIn('input[name=daily_wage]', 50000)
  const d1 = (await dh.innerText().catch(() => '')).trim()
  ok("일급 5만원 (9~18시 · 8시간): '최저 82,560원 미만'", d1 === '최저 82,560원 미만' && (await dh.getAttribute('data-warn')) !== null && (await dh.evaluate((el) => el.getClientRects().length === 1)), d1)
  await typeIn('input[name=daily_wage]', 100000)
  const d2 = (await dh.innerText().catch(() => '')).trim()
  ok("일급 10만원: '최저 82,560원 (8시간)' (안내만)", d2 === '최저 82,560원 (8시간)' && (await dh.getAttribute('data-warn')) === null, d2)
  ok('360px: 옆으로 안 밀림 (공고 고치기)', await wide())
  if (SHOTS) await a.locator('input[name=daily_wage]').locator('xpath=..').screenshot({ path: `${SHOTS}/daily-hint.png` }).catch(() => {})

  // ── 2. 회사 설정: 기본 시급 ──
  await a.goto(`${D}/admin/settings`)
  const wage = a.locator('input[name=default_hourly_wage]')
  await wage.waitFor({ timeout: 15000 }).catch(() => {})
  const wh = a.locator('[data-wage-hint]')
  ok("처음: '새 공고에 먼저 들어가요 · 2026년 최저 10,320원'", (await wh.getAttribute('data-wage-hint')) === 'ok' && (await wh.innerText()).includes('새 공고에 먼저 들어가요'))
  await typeIn('input[name=default_hourly_wage]', 9500)
  const wt = await wh.innerText()
  ok("9,500원: '2026년 최저 10,320원보다 적어요 / 저장하면 10,320원으로 맞춰져요'", (await wh.getAttribute('data-wage-hint')) === 'low' && wt.includes('2026년 최저 10,320원보다 적어요') && wt.includes('저장하면 10,320원으로 맞춰져요'), wt.replace(/\n/g, ' | '))
  ok('안내 두 줄 각 한 줄 (360px)', await wh.locator('span.block').evaluateAll((els) => els.length === 2 && els.every((e) => e.getClientRects().length === 1)))
  await typeIn('input[name=default_hourly_wage]', 11000)
  ok('11,000원: 다시 안내만', (await wh.getAttribute('data-wage-hint')) === 'ok' && (await wage.getAttribute('data-missing')) === null)

  // ── 3. 회사 설정 단순하게 ──
  const h2 = a.locator('#admins h2')
  ok("관리자 제목: 선 아이콘 · 그림 글자 없음", (await h2.locator('svg').count()) === 1 && !(await h2.innerText()).includes('👥'))
  const tools = await a.locator('[data-join-tools] > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok("초대 코드 버튼 셋 한 줄 (공유하기 · 코드 복사 · 새 코드)", tools.length === 3 && tools.every((t) => Math.abs(t - tools[0]) <= 2) && (await a.locator('[data-join-tools]').getByRole('button', { name: '새 코드', exact: true }).count()) === 1, JSON.stringify(tools))
  const info = a.locator('[data-company-info-hint] span')
  ok('회사 정보 안내: 짧은 두 줄 (각 한 줄)', (await info.count()) === 2 && (await info.evaluateAll((els) => els.every((e) => e.getClientRects().length === 1))) && (await a.locator('[data-company-info-hint]').innerText()).includes('근로계약서·임금명세서·모집 글에 들어가요'))
  ok('360px: 옆으로 안 밀림 (회사 설정)', await wide())
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/settings.png`, fullPage: true })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
