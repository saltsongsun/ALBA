// 묶음 211 (정기 개선 2026-11-12 07:36 KST)
// · 지난 근무: '입금 대기 n곳'이 두 곳 이상이면 눌러서 회사별로 (회사 이름 · 정산 예정일 · 금액) — 회사마다 따로 입금되니까
//   - 평소엔 한 줄로 접혀 있음 · 누르면 ›가 돌아가며(0.2초) 줄이 내려옴 · 회사별 금액을 더하면 위 합계와 같음
//   - 한 곳이면 전처럼 한 줄 · 회사를 골라 보면(?co=) 그 회사만
// node scripts/qa/batch211.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000211'
const J2 = 'cccccccc-0000-4000-8000-00000000c211', J3 = 'cccccccc-0000-4000-8000-00000000c311'
const T2 = 'abababab-0000-4000-8000-00000000a211', T3 = 'abababab-0000-4000-8000-00000000a311'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const num = (s) => Number((s ?? '').replace(/[^\d]/g, '')) || 0
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 준비: 다른 회사 공고(사흘 전) · 같은 회사 공고(닷새 전) — 둘 다 일했고 아직 입금 전
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새벽행사', seal_image: null, created_at: new Date().toISOString() })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const d2 = kst(-3), d3 = kst(-5)
  const j2 = { ...j1, id: J2, company_id: C2, company: { company_name: '새벽행사' }, title: '새벽 주차 안내', start_date: d2, end_date: d2, pay_day: '매주 금요일', applications: [], required_docs: [] }
  const j3 = { ...j1, id: J3, company_id: C1, title: '가을 축제 매표소', start_date: d3, end_date: d3, pay_day: '익월 10일', applications: [], required_docs: [] }
  await rest('jobs', 'POST', j2)
  await rest('jobs', 'POST', j3)
  const [a0] = await rest(`attendance?user_id=eq.${W}`)
  const att = (id, job, d) => ({ ...a0, id, job_id: job.id, company_id: job.company_id, work_date: d, clock_in: `${d}T00:00:00Z`, clock_out: `${d}T09:00:00Z`, adj_in: null, adj_out: null, paid: false, paid_at: null, job })
  await rest('attendance', 'POST', att(T2, j2, d2))
  await rest('attendance', 'POST', att(T3, j3, d3))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const box = p.locator('[data-unpaid]')

  // ── 1. 두 곳: 접힌 한 줄 → 누르면 회사별
  await p.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  const tag = await box.evaluate((el) => el.tagName).catch(() => '')
  const sumText = one(await box.locator('summary').innerText().catch(() => ''))
  ok("두 곳: '⏳ 입금 대기 2곳 · 합계' 한 줄로 접혀 있음", tag === 'DETAILS' && sumText.includes('입금 대기 2곳') && !(await box.evaluate((el) => el.open)) && !(await p.locator('[data-unpaid-rows]').isVisible()), `${tag} ${sumText}`)
  ok('화살표는 오른쪽 하나만 (왼쪽 기본 화살표 없음)', (await box.locator('summary').evaluate((el) => getComputedStyle(el, '::before').display)) === 'none')
  ok('접힌 줄은 한 줄 · 360px 옆으로 안 밀림', (await box.locator('summary').evaluate((el) => el.getBoundingClientRect().height < 50)) && (await noSide(p)))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/unpaid-closed.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})

  await box.locator('summary').click()
  await p.waitForTimeout(80)
  const anim = await p.locator('[data-unpaid-rows]').evaluate((el) => ({ name: getComputedStyle(el).animationName, dur: getComputedStyle(el).animationDuration }))
  await p.waitForTimeout(400)
  const rows = await p.locator('[data-unpaid-co]').evaluateAll((l) => l.map((li) => ({ name: li.querySelector('b')?.textContent?.trim(), sub: li.querySelector('span span')?.textContent?.trim(), amt: li.querySelector(':scope > b')?.textContent?.trim(), h: li.getBoundingClientRect().height })))
  ok('누르면 회사별 두 줄 (주식회사 테스트 · 새벽행사)', rows.length === 2 && rows.some((r) => r.name === '주식회사 테스트') && rows.some((r) => r.name === '새벽행사'), JSON.stringify(rows))
  ok("줄마다 '정산 예정 …' (공고의 지급일로)", rows.every((r) => (r.sub ?? '').startsWith('정산 예정 ')), JSON.stringify(rows.map((r) => r.sub)))
  ok('회사별 금액을 더하면 위 합계와 같음', rows.reduce((n, r) => n + num(r.amt), 0) === num(sumText.split('곳')[1]) && num(sumText.split('곳')[1]) > 0, `${rows.map((r) => r.amt).join(' + ')} = ${sumText}`)
  ok('줄이 내려오며 나타남 (slide-down · 0.22초)', anim.name === 'slide-down' && anim.dur === '0.22s', JSON.stringify(anim))
  const rot = await box.locator('summary span[aria-hidden]').evaluate((el) => ({ rotate: getComputedStyle(el).rotate, display: getComputedStyle(el).display }))
  ok('› 가 돌아감 (펼침 표시 · 90도)', rot.rotate === '90deg' && rot.display !== 'inline', JSON.stringify(rot))
  ok('줄마다 두 줄 이내 · 화면 안 · 옆으로 안 밀림', rows.every((r) => r.h < 48) && (await noSide(p)))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/unpaid-open.png`, clip: { x: 0, y: 0, width: 360, height: 480 } }).catch(() => {})

  // ── 2. 회사를 골라 보면 그 회사만 → 한 곳이면 한 줄
  await p.goto(`${D}/me/history?co=${C2}`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  ok("회사를 고르면 그 회사만 · 한 곳이면 접기 없이 한 줄 ('입금 대기 1곳')", (await box.evaluate((el) => el.tagName)) === 'P' && one(await box.innerText()).includes('입금 대기 1곳'))

  // ── 3. 한 곳만 남으면 전처럼 한 줄
  await rest(`attendance?id=eq.${T3}`, 'DELETE')
  await p.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  await box.waitFor({ timeout: 15000 }).catch(() => {})
  ok('입금 대기가 한 곳이면 접기 없이 한 줄', (await box.evaluate((el) => el.tagName)) === 'P' && one(await box.innerText()).includes('입금 대기 1곳'))

  // 정리
  await rest(`attendance?id=eq.${T2}`, 'DELETE')
  await rest(`jobs?id=eq.${J2}`, 'DELETE')
  await rest(`jobs?id=eq.${J3}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
