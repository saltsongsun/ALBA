// 묶음 415 (정기 개선 2026-11-27 17:36 KST)
// 기능 · 새 회사 홈 '해피워크 시작하기' 1단계 '회사 정보 채우기': 1~2칸만 남으면 무엇이 남았는지
//   ('회사 주소·직인만 남았어요') · 3칸 이상이면 예전 안내 그대로 · 다 채우면 1단계 완료(줄 그어짐)
// 디자인 · 제목 옆 4칸 막대 (계약서에 들어가는 4가지 중 채운 만큼 · 칸마다 0.25초씩 차오름 · 움직임 줄이기면 바로)
//   · 360px 한 줄 · 옆 스크롤 없음
// node scripts/qa/batch415.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
// 검증 숫자가 맞는 사업자등록번호 (첫 8자리는 임의 · 다른 묶음과 겹치지 않게)
const brn = () => { const d = [4, 1, 5, 2, 8, 6, 3, 7, 9]; const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]; let s = 0; for (let i = 0; i < 9; i++) s += d[i] * w[i]; s += Math.floor((d[8] * 5) / 10); return d.join('') + ((10 - (s % 10)) % 10) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctxOf = async (reduce = false) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', reducedMotion: reduce ? 'reduce' : 'no-preference' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const p = await ctxOf()
  const step = () => p.locator('[data-start-steps] li').first()
  const bar = () => p.locator('[data-info-bar]')
  const desc = async () => one(await step().locator('a > span.min-w-0 > span').last().innerText().catch(() => ''))

  // ── 1. 새 회사 만들기 (로그인한 관리자가 /start에서)
  await p.goto(`${D}/start`, { waitUntil: 'networkidle' })
  await p.locator('input[name=company_name]').fill('막대상사415')
  await p.getByPlaceholder('숫자 10자리').fill(brn())
  await p.locator('input[name=ceo_name]').fill('김막대')
  await p.locator('input[name=agree_privacy]').check().catch(() => {})
  await p.getByRole('button', { name: '회사로 시작하기' }).click()
  await p.waitForURL((u) => new URL(u).pathname === '/admin', { timeout: 20000 }).catch(() => {})
  await p.locator('[data-start-steps]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('새 회사 홈에 시작하기 카드', (await p.locator('[data-start-steps]').count()) === 1, p.url())

  const names = (t) => (t.match(/^(.+)만 남았어요$/)?.[1] ?? '').split('·').filter(Boolean)
  const LABELS = ['사업자등록번호', '회사 주소', '직인', '문의 연락처']
  const filled0 = Number(await bar().getAttribute('data-info-bar').catch(() => -1))
  const d0 = await desc()
  ok('막대 = 4가지 중 채운 수 · 안내의 남은 이름 수와 같음', filled0 >= 2 && filled0 <= 3 && names(d0).length === 4 - filled0 && names(d0).every((n) => LABELS.includes(n)), `bar=${filled0} desc=${d0}`)
  ok('막대 4칸 · 채운 칸만 파랑', (await bar().locator(':scope > span').count()) === 4 && (await bar().locator(':scope > span > span').count()) === filled0)
  const an = await bar().locator(':scope > span > span').first().evaluate((el) => { const s = getComputedStyle(el); return { name: s.animationName, dur: s.animationDuration } }).catch(() => ({}))
  ok('칸이 0.25초씩 차오름', an.name === 'grow' && parseFloat(an.dur) === 0.25, JSON.stringify(an))
  ok('제목과 막대가 한 줄 (360px)', await step().evaluate((li) => li.querySelector('[data-info-bar]').parentElement.getBoundingClientRect().height < 26).catch(() => false))
  ok('360px 옆 스크롤 없음', await noSide(p))

  // ── 2. 문의 연락처를 비워 저장 → 두 칸 남음 ('회사 주소·문의 연락처만 남았어요' 처럼 설정 화면 순서)
  await p.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await p.locator('input[name=contact_phone]').fill('')
  await p.getByRole('button', { name: '설정 저장' }).last().click()
  await p.getByText('저장했습니다.').first().waitFor({ timeout: 15000 }).catch(() => {})
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const filled1 = Number(await bar().getAttribute('data-info-bar').catch(() => -1))
  const d1 = await desc()
  ok("두 칸 남으면 둘 다 이름으로 ('…·문의 연락처만 남았어요')", filled1 === filled0 - 1 && names(d1).length === 4 - filled1 && names(d1).at(-1) === '문의 연락처' && names(d1).includes('회사 주소'), `bar=${filled1} desc=${d1}`)
  if (SHOTS) { await p.locator('[data-start-steps]').scrollIntoViewIfNeeded(); await p.waitForTimeout(600); await p.screenshot({ path: `${SHOTS}/415-start.png` }) }

  // ── 3. 움직임 줄이기: 막대가 바로
  const r = await ctxOf(true)
  await r.context().addCookies(await p.context().cookies()) // 고른 회사(새 회사)도 같게
  await r.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const rd = await r.locator('[data-info-bar] > span > span').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration)).catch(() => 9)
  ok('움직임 줄이기: 막대가 바로', rd < 0.001, String(rd))

  // ── 4. 주소·연락처를 채우면 1단계 완료 (막대 없음 · 줄 그어짐)
  await p.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  await p.locator('input[name=company_address]').fill('경남 진주시 남강로 415')
  await p.locator('input[name=contact_phone]').fill('010-4150-4150')
  await p.getByRole('button', { name: '설정 저장' }).last().click()
  await p.getByText('저장했습니다.').first().waitFor({ timeout: 15000 }).catch(() => {})
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  const left = 4 - filled0 - 1 // 처음에 비어 있던 것 중 주소 말고 남은 것 (직인 등)
  if (left <= 0) ok("다 채우면 1단계 '완료' · 막대 없음", (await bar().count()) === 0 && (await step().locator('a[data-done]').count()) === 1, await desc())
  else ok('채운 만큼 줄고 남은 것만 이름으로', names(await desc()).length === left && !(await desc()).includes('회사 주소'), await desc())
  if (SHOTS) { await p.locator('[data-start-steps]').scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/415-start2.png` }) }

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `== batch415: ${fails} FAIL` : '== batch415: ALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
