// 묶음 278 (정기 개선 2026-11-16 20:36 KST)
// · 관리자 홈 할 일: '새 문의'·'읽고 아직 답하지 않은 문의'가 한 사람뿐이면 목록을 거치지 않고 그 대화로 바로 (탭 한 번 줄임)
//   여러 사람이면 예전처럼 문의 목록으로 ('답장 전'은 답장 전만 모아 보기로)
// · 관리자 아래 탭도 근무자 탭처럼: 지금 탭은 진한 바탕 + 흰 글자 · 맨 위에서 또 누르면 "지금 ‘문의’ 화면이에요" · 내려가 있으면 맨 위로
// node scripts/qa/batch278.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C1 = '99999999-0000-4000-8000-000000000099'
const W2 = 'bbbbbbbb-0000-4000-8000-000000278002'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()

;(async () => {
  // 근무자 W 한 사람만 새 문의 (기존 글은 예전 것·읽음으로)
  for (const m of await rest(`messages?thread_user_id=eq.${W}`)) await rest(`messages?id=eq.${m.id}`, 'PATCH', { created_at: ago(30 * 1440), read_at: ago(30 * 1440) })
  const [w] = await rest(`users?id=eq.${W}`)
  const user = (id, name) => ({ id, name, phone: '01027800002', photo_at: null, member_type: 'worker' })
  await rest('messages', 'POST', [{ id: 2780001, company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, job_id: null, body: '내일 몇 시까지 가면 되나요?', read_at: null, created_at: ago(3), user: user(W, w.name), sender: { name: w.name } }])

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const href = (key) => p.locator(`[data-todo="${key}"] a`).first().getAttribute('href').catch(() => null)

  // ── 1. 새 문의가 한 사람뿐 → 그 대화로 바로
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok("'새 문의' 한 사람뿐이면 그 대화로 바로", (await href('chat')) === `/admin/chat/${W}`, await href('chat'))
  await Promise.all([p.waitForURL(new RegExp(`/admin/chat/${W}`), { timeout: 15000 }).catch(() => {}), p.locator('[data-todo="chat"] a').first().click()])
  await p.locator('ol li p', { hasText: '내일 몇 시까지 가면 되나요?' }).waitFor({ timeout: 15000 }).catch(() => {})
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/todo-to-thread.png` }).catch(() => {})
  ok('누르면 그 근무자 대화가 열림', new URL(p.url()).pathname === `/admin/chat/${W}` && (await p.locator('ol li p', { hasText: '내일 몇 시까지 가면 되나요?' }).count()) === 1, `${new URL(p.url()).pathname} · ${await p.locator('ol li p').count()}개`)

  // ── 2. 읽고 답하지 않음(W 한 사람) → '답장 전'도 그 대화로
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok("읽고 답 안 한 문의도 한 사람뿐이면 그 대화로", (await href('noreply')) === `/admin/chat/${W}`, await href('noreply'))

  // ── 3. 두 사람이 새 문의 → 목록으로 · 두 사람 답장 전 → '답장 전' 모아 보기로
  await rest('users', 'POST', [{ ...w, id: W2, name: '두번째', phone: '01027800002' }])
  await rest('messages', 'POST', [
    { id: 2780002, company_id: C1, thread_user_id: W2, sender_id: W2, from_admin: false, job_id: null, body: '주차 되나요?', read_at: null, created_at: ago(2), user: user(W2, '두번째'), sender: { name: '두번째' } },
    { id: 2780003, company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, job_id: null, body: '하나 더 여쭤봐요', read_at: null, created_at: ago(1), user: user(W, w.name), sender: { name: w.name } },
  ])
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok("새 문의가 두 사람이면 문의 목록으로", (await href('chat')) === '/admin/chat', await href('chat'))
  await rest(`messages?id=eq.2780002`, 'PATCH', { read_at: ago(1) })
  await rest(`messages?id=eq.2780003`, 'PATCH', { read_at: ago(1) })
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  ok("답장 전이 두 사람이면 '답장 전' 모아 보기로", (await href('noreply')) === '/admin/chat?noreply=1', await href('noreply'))

  // ── 4. 관리자 아래 탭: 지금 탭 표시 · 또 누르면 말풍선 / 맨 위로
  await p.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(400)
  const bar = p.locator('nav[data-admin-tabbar]')
  const ind = await bar.locator('[data-tab-indicator]').evaluate((el) => getComputedStyle(el).backgroundColor)
  const act = bar.locator('[data-tab-active]')
  const color = await act.evaluate((el) => getComputedStyle(el).color).catch(() => '')
  ok("지금 탭 '문의': 진한 파란 바탕 + 흰 글자", ind === 'rgb(37, 87, 232)' && color === 'rgb(255, 255, 255)' && one(await act.textContent()).endsWith('문의'), `${ind} · ${color}`)
  await p.evaluate(() => scrollTo(0, 0))
  await bar.getByRole('link', { name: /문의/ }).click()
  const here = p.locator('[data-tab-here]')
  const shown = await here.waitFor({ timeout: 2000 }).then(() => true, () => false)
  ok("맨 위에서 '문의'를 또 누르면 '지금 ‘문의’ 화면이에요'", shown && one(await here.textContent()) === '지금 ‘문의’ 화면이에요', shown ? one(await here.textContent()) : '안 보임')
  ok('말풍선도 360px 안에 · 옆으로 안 밀림', await p.evaluate(() => { const r = document.querySelector('[data-tab-here]')?.getBoundingClientRect(); return !!r && r.left >= 0 && r.right <= innerWidth && document.scrollingElement.scrollWidth <= innerWidth + 1 }))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/admin-tab-here.png` }).catch(() => {})
  await p.waitForTimeout(2300)
  ok('잠시 뒤 말풍선이 사라짐', (await here.count()) === 0)
  // 홈에서 내려가 있으면 '홈'을 다시 누르면 맨 위로
  await p.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await p.evaluate(() => scrollTo(0, 700))
  await p.waitForTimeout(200)
  await bar.getByRole('link', { name: /홈/ }).click()
  await p.waitForTimeout(900)
  ok("홈에서 내려가 있으면 '홈'을 누르면 맨 위로 (말풍선 없이)", (await p.evaluate(() => scrollY)) < 4 && (await here.count()) === 0 && new URL(p.url()).pathname === '/admin')
  // 다른 탭은 그대로 옮겨 감
  await Promise.all([p.waitForURL(/\/admin\/jobs$/, { timeout: 15000 }).catch(() => {}), bar.getByRole('link', { name: /공고/ }).click()])
  ok("다른 탭('공고')은 그대로 옮겨 감", new URL(p.url()).pathname === '/admin/jobs')
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/admin-tab-jobs.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
