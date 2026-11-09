// 묶음 161 (정기 개선 2026-11-09 12:35 · 지난 회차 '담당자에게 알리기' 이어서 관리자 쪽)
// · 관리자 문의 대화: 근무자가 '오늘 출근했는데 근무 시작을 못 눌렀어요…'를 보냈고 오늘 이 회사 근무에 출근 기록이 없으면
//   '오늘 출근 기록이 없어요 · 공고 제목 · 기록 넣기 →' → 출퇴근 탭의 그 사람으로 · 수기 등록 칸이 펼쳐진 채
//   빠른 답장 '출근 기록을 넣었어요. 확인해 주세요.' · 기록을 넣으면 안내가 사라짐
// node scripts/qa/batch161.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C = '99999999-0000-4000-8000-000000000099'
const ASK = '오늘 출근했는데 근무 시작을 못 눌렀어요. 기록 부탁드려요.'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 250) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)) } return null }

;(async () => {
  // 준비: 오늘 출근 기록 없음 · 근무자가 '못 눌렀어요' 문의
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  const [wu] = await rest(`users?id=eq.${W}`)
  await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, company_id: C, body: ASK, read_at: null, created_at: new Date().toISOString(), user: { id: W, name: wu.name, phone: wu.phone, photo_at: null } })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

  // ── 1. 문의 대화: '기록 넣기' 바로 가기 + 빠른 답장
  await a.goto(`${D}/admin/chat/${W}`)
  const card = a.locator('[data-missed-fix]')
  await card.waitFor({ timeout: 15000 }).catch(() => {})
  const ct = (await card.innerText().catch(() => '')).replace(/\n/g, ' / ')
  ok("'오늘 출근 기록이 없어요 / 공고 제목 / 기록 넣기 →'", ct.startsWith('오늘 출근 기록이 없어요 / ') && ct.endsWith('기록 넣기 →'), ct)
  ok('누르면 출퇴근 탭의 그 사람 (오늘 · fix)', (await card.getAttribute('href')) === `/admin/jobs/${J}?tab=att&date=${today}&fix=${W}#att-${W}`, await card.getAttribute('href'))
  ok("빠른 답장 '출근 기록을 넣었어요. 확인해 주세요.'", (await a.getByText('출근 기록을 넣었어요. 확인해 주세요.').count()) > 0)
  ok('360px 옆으로 안 밀림 · 안내 줄 한 줄씩', (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)) && (await card.evaluate((el) => el.getBoundingClientRect().height < 72)))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/missed-card.png` }).catch(() => {})

  // ── 2. 누르면 그 사람 · 수기 등록 칸 펼쳐짐
  await Promise.all([a.waitForURL(/tab=att/, { timeout: 15000 }).catch(() => {}), card.click()])
  const add = a.locator(`#att-${W} [data-att-add="open"]`)
  await add.waitFor({ timeout: 15000 }).catch(() => {})
  ok('출퇴근 탭: 그 사람의 수기 출퇴근 등록 칸이 펼쳐짐', (await add.count()) === 1 && (await add.evaluate((el) => el.open)) && (await add.locator('input[name=in]').isVisible()))
  // 등록하면 기록이 생김
  await add.getByRole('button', { name: '등록' }).click()
  const att = await until(async () => (await rest(`attendance?user_id=eq.${W}`)).find((x) => x.work_date === today))
  ok('등록하면 오늘 출근 기록 생김', !!att)

  // ── 3. 기록이 있으면 문의 화면 안내 없음
  await a.goto(`${D}/admin/chat/${W}`)
  await a.locator('textarea, input[name=body]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('기록을 넣은 뒤엔 안내 사라짐', (await a.locator('[data-missed-fix]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
