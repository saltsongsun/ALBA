// 묶음 397 (정기 개선 2026-11-26 05:35 KST)
// 기능 · 근무자가 계좌를 처음 등록하면 '💳 계좌 등록 요청'을 보낸 회사에만 '💳 계좌 등록함'을 알림 (그 회사 문의함 + 담당자 휴대폰)
//   · 요청하지 않은 회사·60일 넘은 요청에는 안 감 · 계좌번호는 담지 않음 · 이미 알린 회사엔 다시 안 감 · 답장할 일이 아님('답장 전' 아님)
//   · 관리자 문의 목록: 초록 '✓ 계좌 등록' · 대화: '정산 탭 보기 →'
// 디자인 · 내 정보 계좌 칸 위 '○○에서 계좌를 기다려요' 한 줄 → 계좌번호를 다 쓰면 '저장하면 ○○에 바로 알려요'로 바뀌며 톡
//   · 저장하면 '저장했어요. ○○에 알렸어요.' · 360px 한 줄 · 옆으로 안 밀림
// node scripts/qa/batch397.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u, sec = 600) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + sec })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000039702', C3 = '99999999-0000-4000-8000-000000039703'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const ASK = '💳 계좌 등록 요청\n급여를 보내 드리려면 계좌가 필요해요.'
const doneMsgs = async () => (await rest(`messages?thread_user_id=eq.${W}`)).filter((m) => !m.from_admin && (m.body ?? '').startsWith('💳 계좌 등록함'))

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const C1N = (c1.company_name ?? '').trim()
  // 둘째 회사(요청 안 함) · 셋째 회사(70일 전에 요청 — 너무 오래됨)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '요청안함397', verified: true, seal_image: null, created_at: new Date().toISOString() })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: '오래전397', verified: true, seal_image: null, created_at: new Date().toISOString() })
  // 근무자: 계좌 없음
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, bank_name: null, account_holder: null })
  // 첫째 회사가 이 공고 정산 탭에서 앱 알림으로 요청 (1시간 전) · 셋째 회사는 70일 전
  const ago = (ms) => new Date(Date.now() - ms).toISOString()
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: ASK, created_at: ago(3600e3), read_at: null })
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: W, sender_id: A, from_admin: true, company_id: C3, job_id: null, body: ASK, created_at: ago(70 * 864e5), read_at: null })
  const before = (await doneMsgs()).length

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid, { reducedMotion } = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...(reducedMotion ? { reducedMotion } : {}) })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 내 정보: 누가 계좌를 기다리는지 ──
  const w = await mk(W)
  await w.goto(`${D}/me/profile#bank_account`, { waitUntil: 'networkidle' })
  const line = w.locator('[data-account-waiting]')
  await line.waitFor({ timeout: 15000 }).catch(() => {})
  const t1 = one(await line.innerText().catch(() => ''))
  ok(`계좌 칸 위 '${C1N}에서 계좌를 기다려요' (요청한 회사만 · 오래된 요청·요청 안 한 회사 없음)`, (await line.getAttribute('data-account-waiting')) === 'wait' && t1 === `${C1N}에서 계좌를 기다려요` && !t1.includes('오래전397') && !t1.includes('요청안함397'), t1)
  ok('한 줄 · 360px 옆으로 안 밀림', (await line.evaluate((el) => el.getBoundingClientRect().height <= 44).catch(() => false)) && (await noSide(w)))
  if (SHOTS) await w.locator('#profile-form').screenshot({ path: `${SHOTS}/profile-waiting.png` }).catch(() => {})
  // 계좌번호를 다 쓰면 '저장하면 … 알려요'
  await w.locator('#bank_name').selectOption({ index: 1 })
  await w.locator('#bank_account').fill('110123456789')
  await w.locator('[data-account-waiting="ready"]').waitFor({ timeout: 5000 }).catch(() => {})
  const t2 = one(await line.innerText().catch(() => ''))
  ok(`다 쓰면 '저장하면 ${C1N}에 바로 알려요' (초록으로 바뀜)`, t2 === `저장하면 ${C1N}에 바로 알려요` && (await line.getAttribute('data-account-waiting')) === 'ready', t2)
  if (SHOTS) await line.screenshot({ path: `${SHOTS}/waiting-ready.png` }).catch(() => {})
  await w.locator('#bank_account').fill('1101')
  await w.locator('[data-account-waiting="wait"]').waitFor({ timeout: 5000 }).catch(() => {})
  ok('다시 모자라면 원래 문구로', (await line.getAttribute('data-account-waiting').catch(() => '')) === 'wait')
  await w.locator('#bank_account').fill('110123456789')
  // ── 2. 저장 → 요청한 회사에만 알림 ──
  await w.locator('#profile-form button[type="submit"]').last().click()
  const msg = w.locator('#profile-form').getByText('알렸어요')
  await msg.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok(`저장 안내 '저장했어요. ${C1N}에 알렸어요.'`, (await w.locator('#profile-form').innerText().catch(() => '')).includes(`저장했어요. ${C1N}에 알렸어요.`))
  const d1 = await doneMsgs()
  const mine = d1.slice(before)
  ok('요청한 회사(첫째)에만 한 건 · 요청 공고 · 계좌번호 없음', d1.length === before + 1 && mine[0]?.company_id === C1 && mine[0]?.job_id === J && !(mine[0]?.body ?? '').includes('110123456789') && mine[0]?.sender_id === W, JSON.stringify(mine).slice(0, 200))
  ok('요청 안 한 회사 · 70일 지난 요청 회사에는 안 감', d1.every((m) => m.company_id !== C2 && m.company_id !== C3))
  await w.reload({ waitUntil: 'networkidle' })
  ok('저장한 뒤엔 기다려요 줄 없음', (await w.locator('[data-account-waiting]').count()) === 0)
  // 계좌를 바꿔 저장 → 다시 알리지 않음 · 지웠다가 다시 등록해도 이미 알린 회사엔 다시 안 감
  await w.locator('#bank_account').fill('110987654321')
  await w.locator('#profile-form button[type="submit"]').last().click()
  await w.locator('#profile-form').getByText('저장했어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null })
  await w.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  ok('이미 알린 회사는 다시 기다림 줄에 없음', (await w.locator('[data-account-waiting]').count()) === 0)
  await w.locator('#bank_name').selectOption({ index: 1 })
  await w.locator('#bank_account').fill('110555566667')
  await w.locator('#profile-form button[type="submit"]').last().click()
  await w.locator('#profile-form').getByText('저장했어요').first().waitFor({ timeout: 15000 }).catch(() => {})
  await w.waitForTimeout(500)
  ok('계좌를 바꾸거나 다시 등록해도 같은 회사에 두 번 안 감', (await doneMsgs()).length === before + 1)
  ok('다시 등록 안내에는 회사 이름 없음', !(await w.locator('#profile-form').innerText().catch(() => '')).includes('알렸어요'))

  // ── 3. 관리자(첫째 회사): 문의 목록 초록 '✓ 계좌 등록' · 답장 전 아님 · 대화에 '정산 탭 보기 →' ──
  const a = await mk(A)
  await a.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  const row = a.locator(`a[href^="/admin/chat/${W}"]`).first()
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  const tag = row.locator('[data-inbox-tag]')
  ok("문의 목록: 초록 '✓ 계좌 등록' + '급여 받을 계좌를 등록했어요.'", one(await tag.innerText().catch(() => '')) === '✓ 계좌 등록' && (await tag.getAttribute('class').catch(() => '')).includes('emerald') && one(await row.locator('[data-chat-snippet]').innerText().catch(() => '')).endsWith('급여 받을 계좌를 등록했어요.'), one(await row.innerText().catch(() => '')))
  if (SHOTS) await row.screenshot({ path: `${SHOTS}/inbox-row.png` }).catch(() => {})
  await a.goto(`${D}/admin/chat/${W}`, { waitUntil: 'networkidle' })
  const go = a.locator(`a[href="/admin/jobs/${J}?tab=pay"]`, { hasText: '정산 탭 보기' })
  await go.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("대화: 말풍선 아래 '정산 탭 보기 →' (그 공고 정산 탭)", (await go.count()) >= 1)
  ok('대화 360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await go.first().scrollIntoViewIfNeeded().catch(() => {})
    await a.screenshot({ path: `${SHOTS}/thread.png` }).catch(() => {})
  }
  // 읽은 뒤에도 '답장 전'이 아님 (알리기만 하는 글)
  await a.goto(`${D}/admin/chat`, { waitUntil: 'networkidle' })
  await row.waitFor({ timeout: 15000 }).catch(() => {})
  ok("읽은 뒤에도 '답장 전' 아님", (await row.locator('[data-inbox-noreply]').count()) === 0)

  // ── 4. 움직임 줄이기: 줄이 바뀌어도 톡 움직임 없음 ──
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null })
  await rest('messages', 'POST', { id: crypto.randomUUID(), thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: J, body: ASK, created_at: new Date().toISOString(), read_at: null })
  const rm = await mk(W, { reducedMotion: 'reduce' })
  await rm.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  await rm.locator('[data-account-waiting]').waitFor({ timeout: 15000 }).catch(() => {})
  const dur = await rm.locator('[data-account-waiting]').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('새 요청이 오면 다시 기다림 줄 · 움직임 줄이기면 움직임 없음', (await rm.locator('[data-account-waiting]').count()) === 1 && dur < 0.01, String(dur))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, bank_name: null, account_holder: null })
  await b.close()
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
