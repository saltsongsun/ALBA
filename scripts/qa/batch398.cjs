// 묶음 398 (정기 개선 2026-11-26 07:35 KST)
// 기능 · 내 근무(/me) 계좌 안내 줄: 계좌를 요청한 회사가 있으면 '○○에서 기다려요' (두 곳 '○○·△△', 세 곳 이상 '○○ 외 n곳')
//   · 확정·근무 전이어도 요청이 오면 안내가 보임 · 요청이 없으면 예전 그대로
// 기능 · 근무자 명단 '계좌 미등록 ›' → 우리 회사가 이미 요청했으면 '요청함 ›' (최근 60일 · 우리 회사 요청만 — 다른 회사 요청은 안 셈)
// 디자인 · 기다리는 회사가 있으면 계좌 아이콘 모서리에 작은 깜빡임 점 (움직임 줄이기면 깜빡이지 않음) · 360px 옆으로 안 밀림
// node scripts/qa/batch398.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec = 600) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', AP = '33333333-0000-4000-8000-000000000011'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000039802', C3 = '99999999-0000-4000-8000-000000039803'
const U4 = 'bbbbbbbb-0000-4000-8000-000000039804'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ASK = '💳 계좌 등록 요청\n급여를 보내 드리려면 계좌가 필요해요.'
const ask = (uid, cid, ago = 3600e3) => rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: uid, sender_id: A, from_admin: true, company_id: cid, job_id: null, body: ASK, created_at: new Date(Date.now() - ago).toISOString(), read_at: null })

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const C1N = (c1.company_name ?? '').trim()
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '둘째398', verified: true, seal_image: null, created_at: new Date().toISOString() })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '셋째398', verified: true, seal_image: null, created_at: new Date().toISOString() })
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null })
  await rest(`users?id=eq.${AP}`, 'PATCH', { bank_account_enc: null, active: true })
  const [w] = await rest(`users?id=eq.${W}`)
  // 지원·근무가 아직 없는 회원
  await rest('users', 'POST', { ...w, id: U4, name: '처음398', phone: '01039800004', bank_account_enc: null, attendance: [], ratings: [], created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { width = 360, reducedMotion } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width, height: 740 }, locale: 'ko-KR', ...(width > 600 ? { isMobile: false, hasTouch: false } : {}), ...(reducedMotion ? { reducedMotion } : {}) })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const nag = (p) => p.locator('[data-nag="account"]')

  // ── 1. 요청이 없으면 예전 그대로 ──
  const p = await mk(W)
  await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await nag(p).waitFor({ timeout: 15000 }).catch(() => {})
  ok("요청 없음: '급여를 받으려면 꼭 필요해요' · 점 없음", one(await nag(p).locator('[data-nag-sub]').innerText().catch(() => '')) === '급여를 받으려면 꼭 필요해요' && (await nag(p).locator('[data-nag-ping]').count()) === 0)

  // ── 2. 한 회사가 요청 → '○○에서 기다려요' + 점 ──
  await ask(W, C1)
  await ask(W, C3, 70 * 864e5) // 너무 오래된 요청은 안 셈
  await p.reload({ waitUntil: 'networkidle' })
  await nag(p).waitFor({ timeout: 15000 }).catch(() => {})
  const sub1 = one(await nag(p).locator('[data-nag-sub]').innerText().catch(() => ''))
  ok(`한 회사: '${C1N}에서 기다려요' (60일 지난 요청은 빼고) · 깜빡임 점`, sub1 === `${C1N}에서 기다려요` && (await nag(p).locator('[data-nag-ping]').count()) === 1, sub1)
  ok('누르면 내 정보 계좌 칸으로', (await nag(p).getAttribute('href')) === '/me/profile#bank_account')
  ok('한 줄씩 (제목·회사 줄) · 360px 옆으로 안 밀림', (await nag(p).evaluate((el) => el.getBoundingClientRect().height <= 70).catch(() => false)) && (await noSide(p)))
  if (SHOTS) {
    await nag(p).scrollIntoViewIfNeeded().catch(() => {})
    await nag(p).locator('xpath=..').screenshot({ path: `${SHOTS}/me-nag.png` }).catch(() => {})
  }
  // 두 곳 · 세 곳
  await ask(W, C2)
  await p.reload({ waitUntil: 'networkidle' })
  const sub2 = one(await nag(p).locator('[data-nag-sub]').innerText().catch(() => ''))
  ok("두 회사: '○○·△△에서 기다려요'", sub2.endsWith('에서 기다려요') && sub2.includes(C1N) && sub2.includes('둘째398') && sub2.includes('·'), sub2)
  await ask(W, C3)
  await p.reload({ waitUntil: 'networkidle' })
  const sub3 = one(await nag(p).locator('[data-nag-sub]').innerText().catch(() => ''))
  ok("세 회사: '○○ 외 2곳에서 기다려요' (한 줄로 짧게)", / 외 2곳에서 기다려요$/.test(sub3), sub3)

  // ── 3. 확정·근무 전인 회원도 요청이 오면 안내 ──
  const u4 = await mk(U4)
  await u4.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok('근무·확정 없는 회원: 요청 없으면 계좌 안내 없음', (await nag(u4).count()) === 0)
  await ask(U4, C1)
  await u4.reload({ waitUntil: 'networkidle' })
  await nag(u4).waitFor({ timeout: 15000 }).catch(() => {})
  ok(`요청이 오면 '${C1N}에서 기다려요' 안내가 보임`, one(await nag(u4).locator('[data-nag-sub]').innerText().catch(() => '')) === `${C1N}에서 기다려요`)

  // ── 4. 움직임 줄이기: 점은 있지만 깜빡이지 않음 ──
  const rm = await mk(W, { reducedMotion: 'reduce' })
  await rm.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await nag(rm).waitFor({ timeout: 15000 }).catch(() => {})
  const pingShown = await nag(rm).locator('[data-nag-ping] .animate-ping').evaluate((el) => getComputedStyle(el).display !== 'none').catch(() => true)
  ok('움직임 줄이기: 점만 (깜빡이는 원 숨김)', (await nag(rm).locator('[data-nag-ping]').count()) === 1 && !pingShown)

  // ── 5. 명단: 우리 회사가 요청한 사람은 '요청함 ›' · 다른 회사만 요청했으면 '미등록 ›' ──
  await ask(AP, C2) // 둘째 회사만 요청
  const a = await mk(A)
  await a.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  const cardOf = (uid) => a.locator('div.stagger .card', { has: a.locator(`a[href="/admin/workers/${uid}"]`) }).first()
  await cardOf(W).waitFor({ timeout: 15000 }).catch(() => {})
  const wl = cardOf(W).locator('[data-roster-noaccount]')
  ok("우리 회사가 요청한 근무자: '요청함 ›' (같은 화면 · 주황)", one(await wl.innerText().catch(() => '')) === '요청함 ›' && (await wl.getAttribute('data-roster-noaccount')) === 'asked' && (await wl.getAttribute('class')).includes('text-amber-700') && (await wl.getAttribute('href')) === `/admin/workers/${W}#account-ask`)
  const apl = cardOf(AP).locator('[data-roster-noaccount]')
  const apCount = await cardOf(AP).count()
  ok("다른 회사만 요청한 지원자: 그대로 '미등록 ›' (다른 회사 요청은 안 셈)", apCount === 0 || (one(await apl.innerText().catch(() => '')) === '미등록 ›' && (await apl.getAttribute('data-roster-noaccount')) === ''), String(apCount))
  ok('명단 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await cardOf(W).scrollIntoViewIfNeeded().catch(() => {})
    await cardOf(W).screenshot({ path: `${SHOTS}/roster-asked.png` }).catch(() => {})
  }
  // 넓은 화면 표도 같게
  const pc = await mk(A, { width: 1280 })
  await pc.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  const row = pc.locator('table tr', { has: pc.locator(`a[href="/admin/workers/${W}"]`) }).first()
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("넓은 화면 표: '요청함 ›'", one(await row.locator('[data-roster-noaccount]').innerText().catch(() => '')) === '요청함 ›')
  // 계좌를 등록하면 줄이 사라짐
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: 'enc:dummy' })
  await p.reload({ waitUntil: 'networkidle' })
  ok('계좌가 등록되면 /me 계좌 안내 없음', (await nag(p).count()) === 0)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null })
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
