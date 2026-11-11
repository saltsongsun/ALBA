// 묶음 204 (정기 개선 2026-11-11 22:36 KST)
// · 문의·단체방에서 쓰던 글 보관: 보내기 전에 다른 화면에 다녀오거나 화면이 새로 열려도(휴대폰이 탭을 닫았다 다시 열 때) 남음
//   - 대화마다 따로 · 이 탭 안에서만 · 30분 지나면 버림 · 보내면 지움 · 로그아웃하면 지움 (다음 사람에게 안 보이게)
//   - 빈 칸(띄어쓰기만)은 보관하지 않음 · 근무자·관리자 화면 모두
// node scripts/qa/batch204.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const DRAFT = '내일 몇 시까지 가면 되나요? 주차는'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const box = (p) => p.locator('textarea[name=body]')
  const keys = (p) => p.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('chat-draft:')))
  const CHAT = `/me/chat?co=${C1}`

  // ── 1. 근무자: 쓰다가 다른 화면에 다녀와도 남음
  const w = await pg(W)
  await w.goto(`${D}${CHAT}`, { waitUntil: 'networkidle' })
  await box(w).waitFor({ timeout: 15000 })
  ok('처음엔 빈 칸', (await box(w).inputValue()) === '' && (await keys(w)).length === 0)
  await box(w).fill(DRAFT)
  await w.locator('a[href="/me"]:visible').first().click()
  await w.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 15000 }).catch(() => {})
  await w.goto(`${D}${CHAT}`, { waitUntil: 'networkidle' })
  await box(w).waitFor({ timeout: 15000 })
  await w.waitForTimeout(300)
  ok('다른 화면에 다녀와도 쓰던 글이 남음', (await box(w).inputValue()) === DRAFT, await box(w).inputValue())
  ok('보내기 버튼도 바로 쓸 수 있음 (글이 있는 상태)', await w.getByRole('button', { name: '보내기' }).isVisible())
  ok('긴 글이면 입력칸 높이도 맞춰짐 · 옆으로 안 밀림', await w.evaluate(() => { const el = document.querySelector('textarea[name=body]'); return el.scrollHeight <= el.clientHeight + 2 && document.scrollingElement.scrollWidth <= innerWidth + 1 }))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/draft-restored.png`, clip: { x: 0, y: 380, width: 360, height: 360 } }).catch(() => {})

  // ── 2. 화면이 새로 열려도 남음 (휴대폰이 탭을 닫았다 다시 열 때)
  await w.reload({ waitUntil: 'networkidle' })
  await box(w).waitFor({ timeout: 15000 })
  await w.waitForTimeout(300)
  ok('화면을 새로 열어도 남음', (await box(w).inputValue()) === DRAFT)

  // ── 3. 대화마다 따로
  await w.goto(`${D}/me/chat/room/${J}`, { waitUntil: 'networkidle' })
  await box(w).waitFor({ timeout: 15000 })
  await w.waitForTimeout(300)
  ok('다른 대화(단체방)에는 안 보임', (await box(w).inputValue()) === '')
  await box(w).fill('   ')
  await w.waitForTimeout(200)
  ok('빈 칸(띄어쓰기만)은 보관하지 않음', (await keys(w)).length === 1, JSON.stringify(await keys(w)))
  await box(w).fill('단체방에 쓰던 글')
  await w.goto(`${D}${CHAT}`, { waitUntil: 'networkidle' })
  await box(w).waitFor({ timeout: 15000 })
  await w.waitForTimeout(300)
  ok('문의에는 문의에 쓰던 글 · 단체방 글은 단체방에', (await box(w).inputValue()) === DRAFT && (await keys(w)).length === 2)

  // ── 4. 보내면 지움
  await w.getByRole('button', { name: '보내기' }).click()
  let n = 0
  for (let i = 0; i < 30 && n === 0; i++) { await w.waitForTimeout(300); n = (await rest('messages')).filter((m) => m.body === DRAFT).length }
  ok('보냄 (한 번)', n === 1, String(n))
  await w.waitForTimeout(500)
  ok('보낸 뒤에는 입력칸이 비고 보관한 글도 지워짐', (await box(w).inputValue()) === '' && (await keys(w)).length === 1, JSON.stringify(await keys(w)))
  await w.reload({ waitUntil: 'networkidle' })
  await box(w).waitFor({ timeout: 15000 })
  await w.waitForTimeout(300)
  ok('새로 열어도 보낸 글이 다시 채워지지 않음', (await box(w).inputValue()) === '')

  // ── 5. 30분이 지난 글은 버림
  await w.evaluate((k) => sessionStorage.setItem(k, JSON.stringify({ t: Date.now() - 31 * 60_000, v: '오래된 글' })), `chat-draft:${CHAT}`)
  await w.reload({ waitUntil: 'networkidle' })
  await box(w).waitFor({ timeout: 15000 })
  await w.waitForTimeout(300)
  ok('30분이 지난 글은 채우지 않고 버림', (await box(w).inputValue()) === '' && !(await keys(w)).includes(`chat-draft:${CHAT}`))

  // ── 6. 로그아웃하면 지움 (같은 휴대폰을 다음 사람이 쓸 때 안 보이게)
  await box(w).fill('로그아웃 전에 쓰던 글')
  await w.waitForTimeout(200)
  ok('보관 중 (단체방 글 + 문의 글)', (await keys(w)).length === 2)
  await w.getByRole('button', { name: '로그아웃' }).first().click()
  await w.waitForURL((u) => !new URL(u).pathname.startsWith('/me'), { timeout: 20000 }).catch(() => {})
  ok('로그아웃하면 쓰던 글을 모두 지움', (await keys(w)).length === 0, `${w.url()} ${JSON.stringify(await keys(w))}`)

  // ── 7. 관리자 답장도 같게
  const a = await pg(A)
  await a.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  await box(a).waitFor({ timeout: 15000 })
  await box(a).fill('확인하고 다시 알려 드릴게요. 집합 장소는')
  await a.reload({ waitUntil: 'networkidle' })
  await box(a).waitFor({ timeout: 15000 })
  await a.waitForTimeout(300)
  ok('관리자: 쓰던 답장이 남음', (await box(a).inputValue()) === '확인하고 다시 알려 드릴게요. 집합 장소는')
  await a.goto(`${D}/admin/chat/room/${J}`, { waitUntil: 'networkidle' })
  await box(a).waitFor({ timeout: 15000 }).catch(() => {})
  await a.waitForTimeout(300)
  ok('관리자: 다른 대화에는 안 보임', (await box(a).count()) === 0 || (await box(a).inputValue()) === '')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
