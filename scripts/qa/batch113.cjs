// 묶음 113 (정기 개선 2026-11-07 06:35 · 여러 회사가 함께 쓰기 · 디자인 원칙 "많은 정보도 심플하게")
// · 사업자등록번호 바로 확인을 모든 입력 칸에: 외주 업체 가입 · 업체 정보 고치기(내 정보) · 외주처 등록(관리자) · 회사 추가(최상위 관리자)
//   (전에는 회사로 시작하기·회사 설정에만 있었음) — 쓰는 대로 'n/10자리' → '✓ 올바른 사업자등록번호예요' / 틀리면 '번호를 다시 확인해 주세요'
//   막지는 않음 (안내만) · 보내는 칸 이름 그대로 (biz_no · business_no)
// · 회사로 시작하기: 제목·할 수 있는 일 네 줄의 그림 글자(🏢📢✍️⏱🔒) 대신 앱의 선 아이콘 · 아래 안내 짧게
// node scripts/qa/batch113.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', V = 'bbbbbbbb-0000-4000-8000-0000000001b3'
const GOOD = '1248100998', BAD = '1234567890'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 사업자번호를 잘못 저장해 둔 외주 업체 회원
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: V, name: '업체담당', phone: '01077770001', member_type: 'vendor', biz_name: '○○음향', biz_no: BAD, rrn_enc: null, attendance: [], ratings: [] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const hintOf = (p, id) => p.locator(`#${id}-check`).innerText().catch(() => '')
  // 칸에 글자를 하나씩 (휴대폰처럼)
  const typeIn = async (p, sel, v) => { const el = p.locator(sel); await el.fill(''); await el.pressSequentially(v, { delay: 10 }); await p.waitForTimeout(150) }

  // ── 1. 외주 업체 가입 ──
  const g = await pg()
  await g.goto(`${D}/signup?type=vendor`)
  await g.locator('#biz_no').waitFor({ timeout: 15000 }).catch(() => {})
  ok("외주 업체 가입: 사업자번호 칸 이름 그대로 'biz_no' · 필수", (await g.locator('#biz_no').getAttribute('name')) === 'biz_no' && (await g.locator('#biz_no').getAttribute('required')) !== null)
  ok("처음엔 '세금계산서·대금 지급에 쓰여요.'", (await hintOf(g, 'biz_no')).includes('세금계산서·대금 지급에 쓰여요'))
  await typeIn(g, '#biz_no', '124-81')
  ok("쓰는 중: 숫자만 남고 '5/10자리'", (await g.locator('#biz_no').inputValue()) === '12481' && (await hintOf(g, 'biz_no')).includes('5/10자리'), await g.locator('#biz_no').inputValue())
  await typeIn(g, '#biz_no', BAD)
  ok("틀린 번호: '번호를 다시 확인해 주세요' (노란 테두리)", (await hintOf(g, 'biz_no')).includes('번호를 다시 확인해 주세요') && (await g.locator('#biz_no').getAttribute('data-biz')) === 'bad')
  await typeIn(g, '#biz_no', GOOD)
  ok("맞는 번호: '✓ 올바른 사업자등록번호예요'", (await hintOf(g, 'biz_no')).includes('✓ 올바른 사업자등록번호예요'))
  ok('360px: 옆으로 안 밀림 (외주 업체 가입)', await wide(g))
  if (SHOTS) await g.locator('#biz_no').locator('xpath=..').screenshot({ path: `${SHOTS}/vendor-signup-biz.png` }).catch(() => {})

  // ── 2. 업체 정보 고치기 (잘못 저장된 번호면 바로 알려 줌) ──
  const v = await pg(V)
  await v.goto(`${D}/me/profile`)
  await v.locator('#biz_no').waitFor({ timeout: 15000 }).catch(() => {})
  ok("업체 정보: 저장된 번호가 틀리면 열자마자 '번호를 다시 확인해 주세요'", (await v.locator('#biz_no').inputValue()) === BAD && (await hintOf(v, 'biz_no')).includes('번호를 다시 확인해 주세요'))
  await typeIn(v, '#biz_no', '124-81-00998')
  ok("고치는 칸은 줄표도 됨 · '✓ 올바른 사업자등록번호예요'", (await v.locator('#biz_no').inputValue()) === '124-81-00998' && (await hintOf(v, 'biz_no')).includes('✓'))
  ok('360px: 옆으로 안 밀림 (업체 내 정보)', await wide(v))

  // ── 3. 외주처 등록 (관리자) ──
  const a = await pg(A)
  await a.goto(`${D}/admin/vendors?tab=list`)
  const vb = a.locator('#vendor_business_no')
  await vb.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  if (!(await vb.isVisible().catch(() => false))) await a.getByText('＋ 외주사 등록').first().click().catch(() => {})
  ok("외주처 등록: 칸 이름 'business_no' 그대로", (await vb.getAttribute('name').catch(() => '')) === 'business_no')
  await typeIn(a, '#vendor_business_no', '124-81-00999')
  ok("외주처 등록: 틀린 번호면 '번호를 다시 확인해 주세요'", (await hintOf(a, 'vendor_business_no')).includes('번호를 다시 확인해 주세요'))
  await typeIn(a, '#vendor_business_no', '124-81-00998')
  ok("외주처 등록: 맞으면 '✓'", (await hintOf(a, 'vendor_business_no')).includes('✓ 올바른 사업자등록번호예요'))

  // ── 4. 회사 추가 (최상위 관리자) ──
  await a.goto(`${D}/admin/companies`)
  const nb = a.locator('#new_business_no')
  await nb.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  if (!(await nb.isVisible().catch(() => false))) await nb.locator('xpath=ancestor::details[1]/summary').click().catch(() => {})
  await typeIn(a, '#new_business_no', BAD)
  ok("회사 추가: 틀린 번호면 '번호를 다시 확인해 주세요' (선택 칸 · 막지는 않음)", (await hintOf(a, 'new_business_no')).includes('번호를 다시 확인해 주세요') && (await nb.getAttribute('required')) === null)
  ok('360px: 옆으로 안 밀림 (회사 관리)', await wide(a))

  // ── 5. 회사로 시작하기: 선 아이콘 · 짧게 ──
  await g.goto(`${D}/start`)
  const pts = g.locator('[data-start-points] li')
  await pts.first().waitFor({ timeout: 15000 }).catch(() => {})
  const h1 = await g.locator('h1').first().innerText()
  ok("제목 '회사로 시작하기' (그림 글자 없음)", h1.trim() === '회사로 시작하기', h1)
  const rows = await pts.evaluateAll((els) => els.map((e) => ({ svg: e.querySelectorAll('svg').length, t: e.innerText.trim(), lines: e.querySelector('span:last-child').getClientRects().length })))
  ok('할 수 있는 일 네 줄: 선 아이콘 · 그림 글자 없음 · 한 줄씩', rows.length === 4 && rows.every((r) => r.svg === 1 && !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(r.t) && r.lines === 1), JSON.stringify(rows))
  ok("내용 그대로: '전자서명' · '회사마다 따로'", rows.some((r) => r.t.includes('전자서명')) && rows.some((r) => r.t.includes('회사마다 따로')))
  ok("아래 안내 짧게: '전체 회원 명단은 회사 확인 뒤에 열려요'", (await g.locator('[data-start-note]').innerText()).includes('전체 회원 명단은 회사 확인 뒤에 열려요'))
  ok('360px: 옆으로 안 밀림 (회사로 시작하기)', await wide(g))
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/start.png` })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
