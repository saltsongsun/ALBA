// 묶음 24: 근무자 문의 탭 '대화 목록' (카톡처럼) — 회사 1:1 문의 + 같은 근무 단체방을 최근 대화 순으로, 마지막 말 미리보기 · 시간 · 안 읽은 수
// · 대화가 하나뿐이면 바로 그 대화 · 대화 화면에 '← 대화 목록' · 목록만 열어서는 읽음 처리 안 함
// node scripts/qa/batch24.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, timeout = 6000) => p.getByText(t).first().waitFor({ timeout }).then(() => true, () => false)

;(async () => {
  // 단체방에 담당자 공지 (회사 문의보다 최근)
  await rest('job_chat', 'POST', { job_id: J, sender_id: A, from_admin: true, body: '내일은 8시 30분까지 정문 앞으로 와 주세요', pinned_at: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 대화 목록 ──
  const w = await pg(W)
  await w.goto(`${D}/me`)
  await w.locator('nav[data-bottom-nav] a[href="/me/chat"]').click()
  const list = w.locator('[data-chat-list]')
  await list.waitFor({ timeout: 15000 }).catch(() => {})
  const rows = w.locator('[data-chat-list] a[data-chat-row]')
  ok('문의 탭: 대화 목록 (단체방 + 회사 문의)', (await rows.count()) === 2, String(await rows.count()))
  const first = rows.first()
  ok('가장 최근 대화가 위 (단체방 공지)', (await first.getAttribute('data-chat-row')) === 'room' && (await first.getAttribute('href')) === `/me/chat/room/${J}`)
  const roomTxt = await first.innerText()
  ok('단체방: 이름 · 단체방 표시 · 담당자: 마지막 말', roomTxt.includes('경상남도') && roomTxt.includes('단체방') && roomTxt.includes('담당자: 내일은 8시 30분까지'), roomTxt.replace(/\n/g, ' | '))
  const co = w.locator('[data-chat-list] a[data-chat-row=company]')
  const coTxt = await co.innerText()
  ok('회사 문의: 회사 이름 · 마지막 말 · 시간', coTxt.includes('주식회사 테스트') && coTxt.includes('촉석문 앞 운영본부') && /\d{1,2}:\d{2}|\d+\/\d+/.test(coTxt), coTxt.replace(/\n/g, ' | '))
  ok('회사 문의: 안 읽은 1', (await co.locator('[data-unread]').innerText().catch(() => '')) === '1')
  ok('위에 안 읽은 메시지 안내', await see(w, /안 읽은 메시지 \d+개/))
  ok('목록만 열어서는 읽음 처리 안 함', (await rest('messages')).some((m) => m.thread_user_id === W && m.from_admin && !m.read_at))
  ok('360px: 옆으로 안 밀림', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const last = await rows.last().boundingBox(), nav = await w.locator('nav[data-bottom-nav] > div').boundingBox()
  ok('목록이 아래 탭에 가리지 않음', !!last && !!nav && last.y + last.height <= nav.y)

  // ── 2. 회사 문의 열기 → 읽음 · 목록으로 ──
  await co.click()
  await w.waitForURL(/co=/, { timeout: 8000 }).catch(() => {})
  await w.locator('textarea[name=body]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('대화 화면: 대화 목록으로 돌아가기', (await w.locator('[data-chat-back]').count()) === 1 && (await w.locator('[data-chat-back]').getAttribute('href')) === '/me/chat')
  ok('대화 화면: 메시지·입력칸', (await see(w, '촉석문 앞 운영본부')) && (await w.locator('textarea[name=body]').count()) === 1)
  await w.waitForTimeout(800)
  ok('열면 읽음', (await rest('messages')).filter((m) => m.thread_user_id === W && m.from_admin).every((m) => m.read_at))
  await w.locator('[data-chat-back]').click()
  await w.waitForURL((u) => new URL(u).pathname === '/me/chat' && !new URL(u).search, { timeout: 8000 }).catch(() => {})
  await list.waitFor({ timeout: 10000 }).catch(() => {})
  ok('돌아오면 회사 문의 숫자 없음', (await co.locator('[data-unread]').count()) === 0)

  // ── 3. 단체방 열기 ──
  await first.click()
  await w.waitForURL(/\/me\/chat\/room\//, { timeout: 8000 }).catch(() => {})
  ok('단체방 열림', await see(w, '내일은 8시 30분까지'))

  // ── 4. 대화가 하나뿐이면 바로 대화 ──
  const ap = await pg(AP)
  await ap.goto(`${D}/me/chat`)
  await ap.locator('textarea[name=body]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('대화 하나: 목록 없이 바로 대화', (await ap.locator('[data-chat-list]').count()) === 0 && (await ap.locator('textarea[name=body]').count()) === 1)
  ok('대화 하나: 목록으로 버튼 없음', (await ap.locator('[data-chat-back]').count()) === 0)

  // ── 5. 공고에서 '문의하기'로 오면 바로 그 대화 ──
  await w.goto(`${D}/me/chat?job=${J}`)
  await w.locator('textarea[name=body]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('공고 문의: 바로 대화 (+ 대화 목록 버튼)', (await w.locator('[data-chat-list]').count()) === 0 && (await w.locator('[data-chat-back]').count()) === 1)

  // ── 6. 병아리 이모티콘 22개 (새로 받은 12개 포함) ──
  await w.getByRole('button', { name: '이모티콘', exact: true }).click()
  const picks = w.locator('[role=dialog][aria-label=이모티콘] button')
  await picks.first().waitFor({ timeout: 5000 }).catch(() => {})
  ok('이모티콘 22개', (await picks.count()) === 22, String(await picks.count()))
  const loaded = await w.locator('[role=dialog][aria-label=이모티콘] img').evaluateAll((imgs) => Promise.all(imgs.map((i) => (i.complete ? i.naturalWidth > 0 : new Promise((r) => { i.onload = () => r(i.naturalWidth > 0); i.onerror = () => r(false) })))))
  ok('그림이 모두 열림', loaded.length === 22 && loaded.every(Boolean), JSON.stringify(loaded))
  ok('새 이모티콘: 급여 들어왔다! · 대신 근무할게요', (await w.getByRole('button', { name: '급여 들어왔다!' }).count()) === 1 && (await w.getByRole('button', { name: '대신 근무할게요' }).count()) === 1)
  await w.getByRole('button', { name: '오늘도 파이팅!' }).click()
  ok('보내면 그림으로', await w.locator('main ol img[alt="이모티콘: 오늘도 파이팅!"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('저장은 ::s:cheer::', (await rest('messages')).some((m) => m.body === '::s:cheer::'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
