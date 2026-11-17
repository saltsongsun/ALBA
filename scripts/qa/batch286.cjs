// 묶음 286 (정기 개선 2026-11-17 12:35 KST)
// · 근무자 문의함: 회사별 안 읽은 답장 수를 따로 셈 · 최근 500개 글 밖에 안 읽은 답장이 있는 회사도 목록에 (전엔 숫자가 줄거나 회사가 빠졌음)
// · 전문가 화면 말 맞추기: '내 근무 · 날짜' → '내 일 · 날짜' · '지난 근무' → '지난 일' · '급여 계좌 · 연락 정보' → '대금 계좌 · 연락 정보'
//   (알바는 그대로)
// node scripts/qa/batch286.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-000000028602', E = 'bbbbbbbb-0000-4000-8000-000000028601'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()

;(async () => {
  // 근무자 W: 주식회사 테스트와 최근 글 505개(모두 읽음) · 그보다 오래된 '이백팔십육상회'의 안 읽은 답장 1개 (그 회사엔 지원 안 함)
  for (const m of await rest(`messages?thread_user_id=eq.${W}`)) await rest(`messages?id=eq.${m.id}`, 'PATCH', { read_at: ago(1) })
  const many = Array.from({ length: 505 }, (_, i) => ({ id: 2860000 + i, company_id: C1, thread_user_id: W, sender_id: i % 2 ? A : W, from_admin: i % 2 === 1, job_id: null, body: `대화 ${i + 1}`, read_at: ago(1), created_at: ago(i + 1), sender: { name: '누군가' } }))
  for (let i = 0; i < many.length; i += 100) await rest('messages', 'POST', many.slice(i, i + 100))
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '이백팔십육상회', seal_image: null, created_at: ago(9000) })
  await rest('messages', 'POST', [{ id: 2869999, company_id: C2, thread_user_id: W, sender_id: A, from_admin: true, job_id: null, body: '지난달 정산 확인 부탁드려요', read_at: null, created_at: ago(5000), sender: { name: '담당' } }])
  // 전문가 E
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: E, name: '박음향', phone: '01028600001', member_type: 'expert', specialty: '음향', photo_at: ago(1), attendance: [], ratings: [] })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무자 문의함: 오래된 안 읽은 답장의 회사도 목록에 · 숫자 1
  const p = await mk(W)
  await p.goto(`${D}/me/chat`, { waitUntil: 'networkidle' })
  const row = p.locator(`[data-chat-row] >> text=이백팔십육상회`).locator('xpath=ancestor::a[1]')
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("최근 글 505개 밖의 안 읽은 답장 회사 '이백팔십육상회'도 목록에", (await row.count()) === 1)
  ok("그 회사 안 읽은 수 1 · 마지막 글 미리보기", one(await row.locator('[data-unread]').textContent().catch(() => '')) === '1' && one(await row.textContent().catch(() => '')).includes('지난달 정산 확인 부탁드려요'), one(await row.textContent().catch(() => '')).slice(0, 60))
  const mainRow = p.locator(`[data-chat-row] >> text=주식회사 테스트`).locator('xpath=ancestor::a[1]')
  ok('모두 읽은 회사는 숫자 없음', (await mainRow.locator('[data-unread]').count()) === 0)
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/inbox-old-unread.png` }).catch(() => {})

  // ── 2. 알바: 말 그대로
  await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok("알바 '내 근무 · 날짜'", one(await p.locator('[data-page-name]').textContent()).startsWith('내 근무 · '))
  await p.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  ok("알바 '지난 근무'", one(await p.locator('h1').first().textContent()) === '지난 근무')
  await p.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  ok("알바 '급여 계좌 · 연락 정보'", one(await p.locator('[data-account-title]').textContent().catch(() => '')) === '급여 계좌 · 연락 정보')

  // ── 3. 전문가: 메뉴 이름('내 일')과 같은 말
  const e = await mk(E)
  await e.goto(`${D}/me`, { waitUntil: 'networkidle' })
  ok("전문가 '내 일 · 날짜'", one(await e.locator('[data-page-name]').textContent()).startsWith('내 일 · '), one(await e.locator('[data-page-name]').textContent()))
  if (SHOTS) await e.screenshot({ path: `${SHOTS}/expert-me.png` }).catch(() => {})
  await e.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  ok("전문가 '지난 일' · 돌아가기 '← 내 일' · 화면 어디에도 '내 근무' 링크 없음 (넓은 화면 위 메뉴 포함)", one(await e.locator('h1').first().textContent()) === '지난 일' && (await e.locator('a[href="/me"]').allTextContents()).map(one).includes('← 내 일') && !(await e.locator('a[href="/me"]').allTextContents()).map(one).includes('내 근무'))
  await e.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  ok("전문가 '대금 계좌 · 연락 정보'", one(await e.locator('[data-account-title]').textContent().catch(() => '')) === '대금 계좌 · 연락 정보')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
