// 묶음 64: 위아래 줄이기 + 키보드 여백
// · 글 쓰는 동안(키보드 올라옴 = html[data-kb]) 화면 아래 여백이 아래 탭 자리만큼 남지 않음 → 입력칸이 키보드 바로 위
// · 카드 안 여백 16px(휴대폰) · 내 정보 '정보 채우기' 두 칸 · 예금주·비상연락처 두 칸 · 회사 설정 짧은 칸 두 칸
// · 내 근무: 계좌·사진 안내를 한 카드에 두 줄 · 주요 화면 높이가 다시 길어지지 않게
// node scripts/qa/batch64.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())) /* 저녁에 돌리면 가짜 근무자가 종료 시각 지난 근무 중이라 '근무 종료' 안내가 위에 붙음 — 높이 측정에서 뺌 */; localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const ready = (p, sel) => p.locator(sel).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  const padBottom = (p) => p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom))
  const height = (p) => p.evaluate(() => document.scrollingElement.scrollHeight)

  // ── 1. 키보드: 아래 여백이 줄어듦 (근무자 문의 · 관리자 단체방) ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/chat?co=${CO}`)
  await ready(wk, 'textarea[name=body]')
  const before = await padBottom(wk)
  await wk.evaluate(() => (document.documentElement.dataset.kb = ''))
  await wk.waitForTimeout(100)
  const typing = await padBottom(wk)
  ok('평소: 아래 탭 자리만큼 여백 (탭에 안 가림)', before >= 76, `${before}px`)
  ok('글 쓰는 동안: 여백이 30px 안쪽으로 줄어 입력칸이 키보드 바로 위', typing <= 30, `${before}px → ${typing}px`)
  await wk.evaluate(() => delete document.documentElement.dataset.kb)
  const ad = await pg(A)
  await ad.goto(`${D}/admin/chat/room/${J}`)
  await ready(ad, 'textarea[name=body]')
  await ad.evaluate(() => (document.documentElement.dataset.kb = ''))
  await ad.waitForTimeout(100)
  ok('관리자 화면도 같게', (await padBottom(ad)) <= 30, `${await padBottom(ad)}px`)

  // ── 2. 카드 안 여백 16px (휴대폰) ──
  await wk.goto(`${D}/me/profile`)
  await ready(wk, '#profile-form')
  ok('카드 안 여백 16px', (await wk.locator('#profile-form').evaluate((el) => getComputedStyle(el).paddingTop)) === '16px')

  // ── 3. 내 정보: 정보 채우기 두 칸 · 예금주·비상연락처 두 칸 ──
  const items = await wk.locator('section', { hasText: '정보 채우기' }).locator('li').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('정보 채우기: 한 줄에 두 항목', items.length >= 2 && items[0] === items[1], items.join(','))
  const holder = await wk.locator('#account_holder').boundingBox(), emer = await wk.locator('#emergency_phone').boundingBox()
  ok('예금주·비상연락처 한 줄', !!holder && !!emer && Math.abs(holder.y - emer.y) < 2 && emer.x > holder.x)
  ok('내 정보: 옆으로 안 밀림', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const profileH = await height(wk)
  ok('내 정보 높이 2100px 아래 (예전 2263px)', profileH < 2100, `${profileH}px`)

  // ── 4. 내 근무: 계좌·사진 안내 한 카드 ──
  await wk.goto(`${D}/me`)
  await ready(wk, '[data-profile-nags]')
  const nag = wk.locator('[data-profile-nags]')
  ok('계좌·사진 안내가 한 카드에 두 줄', (await nag.locator('a').count()) === 2 && (await nag.locator('a[href="/me/profile#bank_account"]').count()) === 1 && (await nag.locator('a[href="/me/profile#photo"]').count()) === 1)

  // ── 5. 회사 설정: 대표자·회사 전화 한 줄 · 문의 담당자·연락처 한 줄 ──
  await ad.goto(`${D}/admin/settings`)
  await ready(ad, 'input[name=ceo_name]')
  const ceo = await ad.locator('input[name=ceo_name]').boundingBox(), tel = await ad.locator('input[name=company_phone]').boundingBox()
  const cn = await ad.locator('input[name=contact_name]').boundingBox(), cp = await ad.locator('input[name=contact_phone]').boundingBox()
  ok('대표자·회사 전화 한 줄', !!ceo && !!tel && Math.abs(ceo.y - tel.y) < 2)
  ok('문의 담당자·연락처 한 줄', !!cn && !!cp && Math.abs(cn.y - cp.y) < 2)
  ok('회사 설정: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const settingsH = await height(ad)
  ok('회사 설정 높이 1950px 아래 (예전 2058px)', settingsH < 1950, `${settingsH}px`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
