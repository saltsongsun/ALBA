// 묶음 152 (정기 개선 2026-11-09 02:36)
// · 관리자 문의 목록: 안 읽은 대화가 둘 이상이면 '모두 읽음' (두 번 눌러야) → 이 회사 문의만 한꺼번에 읽음 · 다른 회사 문의는 그대로
// · 문의 목록·근무자 명단을 불러오는 동안 그 화면 모양의 회색 자리 (예전엔 대시보드 모양)
// node scripts/qa/batch152.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000000015c2'
const AP = '33333333-0000-4000-8000-000000000011', W = 'bbbbbbbb-0000-4000-8000-000000000002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const unreadOf = async (cid) => (await rest(`messages?company_id=eq.${cid}&from_admin=eq.false`)).filter((m) => !m.read_at).length

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const btn = a.locator('form button', { hasText: '모두 읽음' })

  // ── 1. 안 읽은 대화가 하나뿐이면 버튼 없음
  await rest(`messages?company_id=eq.${C}&from_admin=eq.false`, 'PATCH', { read_at: null })
  await a.goto(`${D}/admin/chat`)
  await a.locator('[data-chat-search]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('안 읽은 대화 1개: 모두 읽음 버튼 없음', (await btn.count()) === 0)

  // ── 2. 둘 이상이면 '모두 읽음' → 이 회사 문의만 읽음
  // (가짜 DB는 대화방의 근무자 정보(user)를 행에 함께 담아 둠)
  await rest('messages', 'POST', { thread_user_id: AP, sender_id: AP, from_admin: false, company_id: C, body: '내일 몇 시까지 가면 될까요?', read_at: null, created_at: new Date().toISOString(), user: { id: AP, name: '김지원', phone: '01077778888', photo_at: null } })
  await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, company_id: C2, body: '다른 회사 문의', read_at: null, created_at: new Date().toISOString(), user: { id: W, name: '근무자', phone: '01033334444', photo_at: null } })
  await a.reload()
  await a.locator('[data-chat-search]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("안 읽은 대화 2개: '모두 읽음' 버튼", (await btn.count()) === 1)
  ok('칩 줄 한 줄 · 360px 옆으로 안 밀림', (await btn.evaluate((el) => el.getBoundingClientRect().height < 40)) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  await btn.click()
  ok("첫 누름: '모두 읽음으로?' (아직 그대로)", (await btn.innerText()) === '모두 읽음으로?' && (await unreadOf(C)) >= 2)
  await Promise.all([a.waitForURL(/m=/, { timeout: 15000 }).catch(() => {}), btn.click()])
  const m = decodeURIComponent(new URL(a.url()).searchParams.get('m') ?? '')
  ok("'안 읽은 문의 n개를 모두 읽음으로 했어요.'", /^안 읽은 문의 \d+개를 모두 읽음으로 했어요\.$/.test(m), m)
  ok('이 회사 문의는 모두 읽음 · 다른 회사 문의는 그대로', (await unreadOf(C)) === 0 && (await unreadOf(C2)) === 1)
  ok('버튼 사라짐', (await btn.count()) === 0)

  // ── 3. 불러오는 동안 화면 모양의 회색 자리 (문의 목록 · 근무자 명단)
  const slow = async (path) => {
    await a.route(`**${path}**`, async (route) => {
      const h = route.request().headers()
      if (h['next-router-prefetch']) return route.continue()
      await new Promise((r) => setTimeout(r, 1500))
      route.continue().catch(() => {})
    })
  }
  await a.goto(`${D}/admin`)
  await a.locator('#pending').waitFor({ timeout: 15000 }).catch(() => {})
  await slow('/admin/chat')
  await a.locator('a[href="/admin/chat"]:visible').last().click()
  ok('문의 목록으로 갈 때: 목록 모양 회색 자리', await a.locator('[data-skeleton="admin-inbox"]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  await a.unroute('**/admin/chat**')
  await a.locator('[data-chat-search]').waitFor({ timeout: 15000 }).catch(() => {})
  await slow('/admin/workers')
  await a.locator('a[href="/admin/workers"]:visible').last().click()
  ok('근무자 명단으로 갈 때: 명단 모양 회색 자리', await a.locator('[data-skeleton="roster"]').waitFor({ timeout: 3000 }).then(() => true, () => false))
  await a.unroute('**/admin/workers**')
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
