// 묶음 126 (정기 개선 2026-11-07 20:35 · 이용 기록: 서명란을 여러 번 톡톡 누름 — 점 하나도 '서명됨'이 됐음)
// · 서명란을 톡 누른 점·아주 짧은 선은 서명으로 받지 않음 → '조금 더 길게 이름을 써 주세요' (그린 건 그대로 두고 이어서 쓰게)
// · 그 상태로 제출하면 서버까지 안 가고 서명란으로 (빨간 표시)
// · 손가락을 대고 있는 동안 서명란 테두리가 브랜드 색 실선으로
// node scripts/qa/batch126.cjs <default 앱> <default 가짜> <shots>
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
  const doc = (await rest(`signed_docs?user_id=eq.${W}`)).find((d) => d.status === 'pending' && d.job_id === J)
  ok('준비: 서명할 서류', !!doc)
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/docs/${doc.id}`)
  const pad = p.locator('[data-sign-pad]')
  const canvas = pad.locator('canvas')
  await canvas.waitFor({ timeout: 15000 })
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await p.waitForTimeout(300)
  const box = await canvas.boundingBox()
  const sig = () => p.locator('input[name=signature]').inputValue()

  // ── 1. 톡 누른 점은 서명이 아님 ──
  await p.mouse.click(box.x + 60, box.y + 80)
  await p.locator('[data-sign-short-hint]').waitFor({ timeout: 3000 }).catch(() => {})
  ok("톡 누르면: '조금 더 길게 이름을 써 주세요' · '서명됨' 아님 · 서명 값 없음", (await p.locator('[data-sign-short-hint]').innerText().catch(() => '')).includes('조금 더 길게 이름을 써 주세요') && !(await pad.innerText()).includes('서명됨') && (await sig()) === '')
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await pad.screenshot({ path: `${SHOTS}/sign-short.png` }).catch(() => {})

  // ── 2. 그 상태로 제출 → 막힘 ──
  await p.locator('input[name=agree]').check().catch(() => {})
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  await p.waitForTimeout(600)
  ok('그대로 제출하면 서버까지 안 가고 서명란 빨간 표시', (await pad.getAttribute('data-invalid')) === '' && new URL(p.url()).pathname === `/docs/${doc.id}` && (await rest(`signed_docs?id=eq.${doc.id}`))[0]?.status === 'pending')

  // ── 3. 그리는 동안 테두리 강조 → 길게 쓰면 '서명됨' ──
  await p.mouse.move(box.x + 30, box.y + 90)
  await p.mouse.down()
  for (let i = 1; i <= 6; i++) await p.mouse.move(box.x + 30 + i * 18, box.y + 90 + (i % 2 ? -25 : 25))
  ok('손가락을 대고 있는 동안 테두리가 브랜드 색 실선', await canvas.evaluate((el) => el.className.includes('border-brand-400') && el.className.includes('border-solid')))
  for (let i = 7; i <= 12; i++) await p.mouse.move(box.x + 30 + i * 18, box.y + 90 + (i % 2 ? -25 : 25))
  await p.mouse.up()
  await p.waitForTimeout(300)
  ok("길게 쓰면 '서명됨 ✓' · 안내 사라짐 · 서명 값 생김", (await pad.innerText()).includes('서명됨') && (await p.locator('[data-sign-short-hint]').count()) === 0 && (await sig()).startsWith('data:image/png;base64,'))
  ok('손을 떼면 테두리 원래대로 (점선)', await canvas.evaluate((el) => el.className.includes('border-dashed')))

  // ── 4. 다시 쓰기 → 처음처럼 ──
  await p.getByRole('button', { name: '다시 쓰기' }).click()
  ok("다시 쓰기: '여기에 서명해 주세요'로 · 값 비움", (await pad.innerText()).includes('서명해 주세요') && (await sig()) === '' && (await p.locator('[data-sign-short-hint]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
