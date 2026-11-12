// 묶음 118 (정기 개선 2026-11-07 11:35 · 디자인 원칙 "많은 정보도 심플하게")
// · 홈 맨 위 '오늘 근무' 카드가 지금 출퇴근 상태에 맞게 (이미 출근했는데 '출퇴근 전'이라고 하지 않게)
//   출근 전: '오늘 근무가 있어요 · 출퇴근 →' / 서명 남음 '출퇴근 전 서명이 남았어요 · 서명 →'
//   근무 중: '지금 근무 중이에요 · 출퇴근 →' / 서명 남음 '근무 중 · 서명이 남았어요 · 서명 →'
//   마침: 조용한 흰 카드 '오늘 근무를 마쳤어요 · 수고했어요 · 내역 →' (지난 근무로)
// · 카드 빛 번짐(흐린 원 두 개) 없앰
// node scripts/qa/batch118.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 저녁(18시 뒤)에 돌려도 같은 결과: 가짜 공고(오늘 9~18시)를 오늘 23:59까지로 — 종료 시각이 지나면 홈 카드가 '근무 종료를 아직 안 눌렀어요'로 바뀌어서
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  const [att] = await rest(`attendance?user_id=eq.${W}&job_id=eq.${J}`)
  const docs = (await rest(`signed_docs?user_id=eq.${W}`)).filter((d) => d.job_id === J && d.status === 'pending')
  ok('준비: 오늘 출근 · 서명 안 한 서류', !!att?.clock_in && !att.clock_out && docs.length > 0)

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const w = await ctx.newPage()
  w.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const hero = w.locator('[data-today-hero]')
  const open = async () => { await w.goto(`${D}/`); await hero.waitFor({ timeout: 15000 }).catch(() => {}) }
  const label = () => hero.locator('span.block').first().innerText().catch(() => '')
  const gradient = () => hero.evaluate((el) => /gradient/.test(getComputedStyle(el).backgroundImage)).catch(() => false)

  // ── 1. 근무 중 · 서명 남음 ──
  await open()
  ok("근무 중 + 서명 남음: '근무 중 · 서명이 남았어요' · '서명 →'", (await hero.getAttribute('data-today-state')) === 'working' && (await label()) === '근무 중 · 서명이 남았어요' && (await hero.innerText()).includes('서명 →') && (await hero.getAttribute('href')) === `/docs/${docs[0].id}`, await label())
  ok('빛 번짐(흐린 원) 없음', (await hero.locator('[class*="blur-2xl"]').count()) === 0)
  ok('문구 한 줄 (360px)', await hero.locator('span.block').first().evaluate((el) => el.getClientRects().length === 1 && el.scrollWidth <= el.clientWidth + 1))
  if (SHOTS) await hero.screenshot({ path: `${SHOTS}/working-sign.png` }).catch(() => {})

  // ── 2. 근무 중 · 서명 끝 ──
  for (const d of docs) await rest(`signed_docs?id=eq.${d.id}`, 'PATCH', { status: 'signed', signed_at: new Date().toISOString() })
  await open()
  ok("근무 중: '지금 근무 중이에요' · '출퇴근 →' (내 근무로)", (await label()) === '지금 근무 중이에요' && (await hero.innerText()).includes('출퇴근 →') && (await hero.getAttribute('href')) === '/me' && (await gradient()), await label())

  // ── 3. 퇴근함: 조용한 흰 카드 ──
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: new Date().toISOString() })
  await open()
  ok("퇴근 뒤: '오늘 근무를 마쳤어요 · 수고했어요' · '내역 →' (지난 근무로)", (await hero.getAttribute('data-today-state')) === 'done' && (await label()) === '오늘 근무를 마쳤어요 · 수고했어요' && (await hero.innerText()).includes('내역 →') && (await hero.getAttribute('href')) === '/me/history', await label())
  ok('마친 카드는 그라데이션 없음 (흰 카드)', !(await gradient()))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await hero.screenshot({ path: `${SHOTS}/done.png` }).catch(() => {})

  // ── 4. 출근 전 ── (근무 시간 안에서: 끝난 뒤엔 '오늘 근무 시간이 지났어요' — batch160)
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_in: null, clock_out: null })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  await open()
  ok("출근 전: '오늘 근무가 있어요' · '출퇴근 →'", (await hero.getAttribute('data-today-state')) === 'before' && (await label()) === '오늘 근무가 있어요' && (await hero.innerText()).includes('출퇴근 →'), await label())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
