// 묶음 99: 정기 개선 — 서명 화면 실수 막기 · 빠진 브랜드 색
// · 서명을 그려 놓고 제출 전에 아래 탭 등 다른 화면 링크를 누르면 한 번 멈춤 '서명 제출 전이에요 · 한 번 더 누르면 나가요' (한 번 더 누르면 나감)
// · 아무것도 안 그렸으면 그대로 나감 · 서명하고 제출은 막지 않음
// · brand-200·300·400·800 색 (강조 테두리가 검정·버튼 빛이 회색·깜빡이는 점이 투명이던 것)
// node scripts/qa/batch99.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
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
  const tab = p.locator('nav[data-bottom-nav] a', { hasText: '알바 찾기' })
  const path = () => new URL(p.url()).pathname

  // ── 1. 아무것도 안 그렸으면 그대로 나감 ──
  await p.goto(`${D}/docs/${doc.id}`)
  await p.locator('[data-sign-pad]').waitFor({ timeout: 10000 })
  await p.waitForTimeout(500)
  await tab.click()
  await p.waitForURL((u) => u.pathname === '/', { timeout: 8000 }).catch(() => {})
  ok('서명 전(안 그림): 아래 탭 누르면 바로 나감', path() === '/')

  // ── 2. 그린 뒤 나가려 하면 한 번 멈춤 ──
  await p.goto(`${D}/docs/${doc.id}`)
  const pad = p.locator('[data-sign-pad] canvas')
  await pad.scrollIntoViewIfNeeded()
  await p.waitForTimeout(400)
  const box = await pad.boundingBox()
  await p.mouse.move(box.x + 30, box.y + 90)
  await p.mouse.down()
  for (let i = 1; i <= 10; i++) await p.mouse.move(box.x + 30 + i * 18, box.y + 90 + (i % 2 ? -25 : 25))
  await p.mouse.up()
  await p.waitForTimeout(300)
  await tab.click()
  await p.waitForTimeout(600)
  const warn = p.locator('[data-unsaved=warn]')
  ok("그린 뒤 아래 탭: 그대로 머묾 + '서명 제출 전이에요 · 한 번 더 누르면 나가요'", path() === `/docs/${doc.id}` && (await warn.innerText().catch(() => '')).includes('서명 제출 전이에요 · 한 번 더 누르면 나가요'))
  ok('안내 한 줄 (360px)', await warn.locator('p').evaluate((el) => el.getBoundingClientRect().height < 44).catch(() => false))
  await tab.click()
  await p.waitForURL((u) => u.pathname === '/', { timeout: 8000 }).catch(() => {})
  ok('한 번 더 누르면 나감', path() === '/')

  // ── 3. 그리고 제출은 막지 않음 ──
  await p.goto(`${D}/docs/${doc.id}`)
  await pad.scrollIntoViewIfNeeded()
  await p.waitForTimeout(400)
  const box2 = await pad.boundingBox()
  await p.mouse.move(box2.x + 30, box2.y + 90)
  await p.mouse.down()
  for (let i = 1; i <= 10; i++) await p.mouse.move(box2.x + 30 + i * 18, box2.y + 90 + (i % 2 ? -25 : 25))
  await p.mouse.up()
  await p.locator('input[name=agree]').check()
  await p.getByRole('button', { name: '서명하고 제출하기' }).click()
  await p.waitForURL((u) => u.pathname !== `/docs/${doc.id}`, { timeout: 15000 }).catch(() => {})
  ok('서명하고 제출은 그대로 (멈추지 않음)', (await rest(`signed_docs?id=eq.${doc.id}`))[0]?.status === 'signed', path())

  // ── 4. 빠진 브랜드 색 ──
  const colors = await p.evaluate(() => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const read = (cls, prop) => { el.className = cls; return getComputedStyle(el)[prop] }
    const out = { ring300: read('ring-2 ring-brand-300', 'boxShadow'), bg400: read('bg-brand-400', 'backgroundColor'), bg200: read('bg-brand-200', 'backgroundColor') }
    el.remove()
    return out
  })
  ok('ring-brand-300 = 연한 파랑 (검정 아님)', colors.ring300.includes('147, 180, 251'), colors.ring300)
  ok('bg-brand-400 = 파랑 (투명 아님)', colors.bg400.includes('102, 144, 248'), colors.bg400)
  // (색 그림자는 '디자인 더 깔끔하게'로 뺐음 → brand-200은 바탕색으로 확인)
  ok('bg-brand-200 = 연한 파랑 (투명 아님)', colors.bg200.includes('191, 211, 254'), colors.bg200)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
