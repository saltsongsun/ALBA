// 묶음 259 (정기 개선 2026-11-15 08:35 KST)
// · 회사 설정: '근무자에게 이렇게 보여요' — 회사 이름 · 문의 담당 · 연락처를 근무자 화면 모양 그대로 (여러 회사가 함께 쓰니 근무자는 이름·연락처로 알아봄)
//   고치는 대로 바로 바뀜 + 테두리가 잠깐 진해짐 · 고친 뒤엔 '저장하면 근무자에게 이렇게 보여요' · '회사 화면 보기 →' (공고 모음)
//   연락처가 비면 '문의 연락처가 없어요 · 근무자가 연락할 곳이 없어요'
// · (코드) 근무 날이 다 지난 공고의 공지 알림은 누르면 그 회사 문의함으로 (내 근무 카드에 안 나오는 공고)
// node scripts/qa/batch259.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  const pv = a.locator('[data-worker-preview]')
  await pv.waitFor({ timeout: 15000 }).catch(() => {})

  // ── 1. 처음: 저장된 값 그대로
  ok("'근무자에게 이렇게 보여요' · '주식회사 테스트' · '문의 담당 · 010-1234-5678'", one(await pv.locator('p').first().textContent()).startsWith('근무자에게 이렇게 보여요') && one(await pv.locator('[data-preview-name]').textContent()) === '주식회사 테스트' && one(await pv.locator('[data-preview-contact]').textContent()) === '문의 담당 · 010-1234-5678', one(await pv.locator('[data-preview-contact]').textContent().catch(() => '')))
  ok("'회사 화면 보기 →'는 우리 회사 공고 모음 (/?co=)", (await pv.locator('[data-preview-link]').getAttribute('href')) === `/?co=${C1}`)
  const lh = await pv.locator('[data-preview-name], [data-preview-contact]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))))
  ok('360px 옆으로 안 밀림 · 미리보기 줄마다 한 줄', (await noSide(a)) && lh.every((n) => n === 1), JSON.stringify(lh))
  if (SHOTS) {
    await pv.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    await pv.screenshot({ path: `${SHOTS}/settings-preview.png` }).catch(() => {})
  }

  // ── 2. 고치는 대로 바로 바뀜 + 테두리 잠깐 진해짐
  const name = a.locator('input[name=company_name]')
  await name.fill('')
  await name.pressSequentially('새봄이벤트', { delay: 10 })
  await a.waitForTimeout(50)
  ok("상호를 고치면 바로 '새봄이벤트' · '저장하면 근무자에게 이렇게 보여요'", one(await pv.locator('[data-preview-name]').textContent()) === '새봄이벤트' && one(await pv.locator('p').first().textContent()).startsWith('저장하면 근무자에게 이렇게 보여요'))
  ok('바뀔 때 테두리가 잠깐 진해짐 (0.3초 뒤 원래대로)', (await pv.locator('[data-preview-card]').getAttribute('data-preview-card')) === 'changed' && (await a.waitForTimeout(500).then(() => pv.locator('[data-preview-card]').getAttribute('data-preview-card'))) === '')
  const who = a.locator('input[name=contact_name]')
  await who.fill('박담당')
  await who.dispatchEvent('input')
  await a.waitForTimeout(50)
  ok("담당자 이름도 바로 '문의 박담당 · 010-1234-5678'", one(await pv.locator('[data-preview-contact]').textContent()) === '문의 박담당 · 010-1234-5678')
  const phone = a.locator('input[name=contact_phone]')
  await phone.fill('')
  await phone.dispatchEvent('input')
  await a.waitForTimeout(50)
  ok("연락처를 지우면 '문의 연락처가 없어요 · 근무자가 연락할 곳이 없어요'", one(await pv.locator('[data-preview-contact]').textContent()) === '문의 연락처가 없어요 · 근무자가 연락할 곳이 없어요')
  if (SHOTS) {
    await phone.pressSequentially('01098761234', { delay: 10 })
    await a.waitForTimeout(100)
    await pv.screenshot({ path: `${SHOTS}/settings-preview-typing.png` }).catch(() => {})
  }
  ok("휴대폰 번호는 쓰는 대로 하이픈 '010-9876-1234'", one(await pv.locator('[data-preview-contact]').textContent()) === '문의 박담당 · 010-9876-1234', one(await pv.locator('[data-preview-contact]').textContent()))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
