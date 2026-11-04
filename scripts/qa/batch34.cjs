// 묶음 34: 회사 설정 '계약서에 들어가는 정보' 체크 목록 (사업자등록번호·회사 주소·직인·문의 연락처)
//          · 쓰는 대로 바로 ✓ · 빈 항목을 누르면 그 칸으로 가서 커서 · 빈 칸은 노란 테두리 · 직인을 올리면 ✓ · 다 채우면 '모두 채웠어요'
//          · 대시보드 '시작하기'의 '회사 정보 채우기'를 누르면 첫 빈 칸으로 바로 (#칸) · 다 채운 회사는 목록 안 보임 · 360px
// node scripts/qa/batch34.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const zlib = require('node:zlib')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 6000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

// 직인으로 올릴 작은 PNG (흰 바탕에 빨간 네모)
function png(w = 64, h = 64) {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1 } return ~c >>> 0 }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const rows = []
  for (let y = 0; y < h; y++) { const r = [0]; for (let x = 0; x < w; x++) { const red = x > 12 && x < 52 && y > 12 && y < 52; r.push(red ? 220 : 255, red ? 30 : 255, red ? 30 : 255) } rows.push(Buffer.from(r)) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

;(async () => {
  // 막 가입한 회사2: 계약서 정보가 모두 비어 있음 (대표 A2)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', business_no: null, company_address: null, seal_image: null, contact_phone: null, verified: false, created_at: '2026-11-01T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '이대표', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const list = (p) => p.locator('[data-setup-checklist]')
  const count = (p) => list(p).locator('span.tabular-nums').innerText().catch(() => '')
  const focused = (p) => p.evaluate(() => document.activeElement?.getAttribute('name'))
  const inView = (p, sel) => p.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight })

  // ── 1. 대시보드 '시작하기' → 첫 빈 칸으로 ──
  const own = await pg(A2)
  await own.goto(`${D}/admin`)
  const step = own.locator('[data-start-steps] a', { hasText: '회사 정보 채우기' })
  await step.waitFor({ timeout: 10000 }).catch(() => {})
  ok("시작하기 '회사 정보 채우기' → 첫 빈 칸(#business_no)", (await step.getAttribute('href')) === '/admin/settings#business_no')
  await step.click()
  await own.waitForURL(/\/admin\/settings/, { timeout: 10000 }).catch(() => {})
  await list(own).waitFor({ timeout: 10000 }).catch(() => {})
  // (전체 회귀처럼 서버가 바쁠 때는 커서·부드러운 스크롤이 늦게 끝남 — 넉넉히 기다림)
  await own.waitForFunction(() => document.activeElement?.getAttribute('name') === 'business_no', null, { timeout: 10000 }).catch(() => {})
  await own.waitForFunction(() => { const r = document.querySelector('input[name=business_no]')?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight }, null, { timeout: 5000 }).catch(() => {})
  ok('회사 설정 맨 위에 체크 목록 0/4', (await count(own)) === '0/4', await count(own))
  ok('누르고 오면 사업자등록번호 칸에 커서 + 화면 안', (await focused(own)) === 'business_no' && (await inView(own, 'input[name=business_no]')))
  ok('빈 칸은 노란 테두리', (await own.locator('input[name=company_address][data-missing]').count()) === 1)

  // ── 2. 쓰는 대로 바로 ✓ ──
  // (끝자리 검증까지 맞는 번호 — 틀린 번호는 노란 테두리가 남음: batch43)
  await own.locator('input[name=business_no]').fill('220-81-62517')
  ok('사업자등록번호를 쓰면 바로 ✓ (1/4) · 노란 테두리 사라짐', (await count(own)) === '1/4' && (await own.locator('[data-setup-item=business_no][data-done]').count()) === 1 && (await own.locator('input[name=business_no][data-missing]').count()) === 0)
  // 빈 항목을 누르면 그 칸으로
  await own.evaluate(() => window.scrollTo(0, 0))
  await own.locator('[data-setup-item=contact_phone]').click()
  await own.waitForTimeout(700)
  ok("'문의 연락처'를 누르면 그 칸에 커서 + 화면 안", (await focused(own)) === 'contact_phone' && (await inView(own, 'input[name=contact_phone]')))
  await own.locator('input[name=contact_phone]').fill('010-2222-3333')
  await own.evaluate(() => window.scrollTo(0, 0))
  await own.locator('[data-setup-item=company_address]').click()
  await own.waitForTimeout(700)
  ok("'회사 주소'를 누르면 그 칸에 커서", (await focused(own)) === 'company_address')
  await own.locator('input[name=company_address]').fill('경남 진주시 진주대로 1')
  ok('3/4', (await count(own)) === '3/4', await count(own))
  await own.evaluate(() => window.scrollTo(0, 0))
  await own.locator('[data-setup-item=seal]').click()
  await own.waitForTimeout(700)
  ok("'직인'을 누르면 직인 칸이 화면 안으로", await inView(own, '#seal'))
  ok('360px: 옆으로 안 밀림', await own.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 직인을 올리면 ✓ → 다 채움 ──
  await own.locator('#seal input[type=file]').first().setInputFiles({ name: 'seal.png', mimeType: 'image/png', buffer: png() })
  const doneMsg = own.locator('[data-setup-complete]')
  ok("직인까지 올리면 '모두 채웠어요'가 톡", await doneMsg.waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('완료 문구 톡 (animate-pop)', ((await doneMsg.getAttribute('class')) || '').includes('animate-pop'))
  await own.getByRole('button', { name: /저장/ }).first().click()
  await own.waitForTimeout(1200)
  const [c2] = await rest(`companies?id=eq.${C2}`)
  ok('저장하면 회사 정보에 들어감', c2?.business_no === '220-81-62517' && c2?.company_address === '경남 진주시 진주대로 1' && c2?.contact_phone?.replace(/\D/g, '') === '01022223333' && !!c2?.seal_image, JSON.stringify({ b: c2?.business_no, a: c2?.company_address, p: c2?.contact_phone, s: !!c2?.seal_image }))
  await own.goto(`${D}/admin/settings`)
  await own.locator('h1', { hasText: '회사 설정' }).waitFor({ timeout: 10000 }).catch(() => {})
  ok('다 채운 회사는 체크 목록이 안 보임', (await list(own).count()) === 0)

  // ── 4. 이미 쓰던 회사에서 한 가지가 비면: '시작하기'의 '회사 정보 채우기' → 그 칸으로 ──
  await rest(`companies?id=eq.${C1}`, 'PATCH', { contact_phone: null })
  const a = await pg(A)
  await a.goto(`${D}/admin`)
  const info = a.locator('[data-start-steps] a', { hasText: '회사 정보 채우기' })
  await info.waitFor({ timeout: 10000 }).catch(() => {})
  ok("빈 칸이 하나면 '회사 정보 채우기' → 그 칸(#contact_phone)", (await info.getAttribute('href').catch(() => '')) === '/admin/settings#contact_phone')
  await info.click()
  await a.waitForURL(/\/admin\/settings/, { timeout: 10000 }).catch(() => {})
  await a.waitForFunction(() => document.activeElement?.getAttribute('name') === 'contact_phone', null, { timeout: 4000 }).catch(() => {})
  ok('회사 설정에서 문의 연락처 칸에 커서 · 목록 3/4', (await focused(a)) === 'contact_phone' && (await count(a)) === '3/4', await count(a))
  ok('360px: 옆으로 안 밀림 (체크 목록)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
