// 묶음 252 (정기 개선 2026-11-14 21:35 KST)
// · 공고 화면 '확정자에게 공지': 접힌 칸에 마지막 공지가 한 줄로 ('마지막 공지 오늘 18:40 · 내일 집결은…') — 같은 공지를 또 보내지 않게
//   (관리자가 여럿이어도 누가 무엇을 보냈는지 바로) · 이 공고·우리 회사 공지만
// · 펼치면 '↺ 지난 공지 불러오기' → 입력칸에 그대로 채움 (고쳐서 다시 보낼 때 처음부터 안 써도 되게) · 채워질 때 입력칸이 한 번 반짝
// node scripts/qa/batch252.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000252d2'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const notice = (id, job, ago, text) => ({ id, thread_user_id: W, sender_id: A, from_admin: true, company_id: C1, job_id: job, body: `📢 공지\n${text}`, read_at: null, created_at: new Date(Date.now() - ago).toISOString() })

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const fold = a.locator('details', { hasText: '확정자에게 공지' })
  const summary = fold.locator('summary')
  const open = async () => { await a.goto(`${D}/admin/jobs/${J}?tab=apps`, { waitUntil: 'networkidle' }); await fold.waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 보낸 공지가 없으면 원래 안내
  await open()
  ok("공지 없음: '확정 1명에게 앱으로 한 번에 · 문자로도 보낼 수 있어요'", one(await summary.innerText()).endsWith('확정 1명에게 앱으로 한 번에 · 문자로도 보낼 수 있어요') && (await fold.locator('[data-last-notice]').count()) === 0)
  await summary.click()
  ok("공지 없으면 '지난 공지 불러오기' 없음", (await fold.locator('[data-reuse-notice]').count()) === 0)

  // ── 2. 3시간 전 공지가 있으면 접힌 칸에 한 줄 · 다른 공고 공지는 안 섞임
  await rest('messages', 'POST', notice(925201, J, 3 * 3600e3, '내일 집결은 08:30 정문이에요.\n늦지 않게 와 주세요.'))
  await rest('messages', 'POST', notice(925202, J2, 60e3, '다른 공고 공지'))
  await open()
  const line = one(await fold.locator('[data-last-notice]').innerText().catch(() => ''))
  ok("접힌 칸: '마지막 공지 오늘 HH:MM · 내일 집결은 08:30 정문이에요. 늦지 않게 와 주세요.' (다른 공고 공지 아님)", /^마지막 공지 (오늘 \d{1,2}:\d\d|\d{1,2}\/\d{1,2}\([일월화수목금토]\) \d{1,2}:\d\d) · 내일 집결은 08:30 정문이에요\. 늦지 않게 와 주세요\.$/.test(line) && (await fold.locator('[data-last-notice]').getAttribute('data-last-notice')) === 'old', line)
  const sh = await summary.evaluate((el) => Math.round(el.querySelector('[data-last-notice]').parentElement.getBoundingClientRect().height))
  ok('한 줄 (넘치면 …)', sh < 26, String(sh))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await fold.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    await fold.screenshot({ path: `${SHOTS}/announce-last-folded.png` }).catch(() => {})
  }

  // ── 3. 펼쳐서 '지난 공지 불러오기' → 입력칸에 그대로 (반짝)
  await summary.click()
  const reuse = fold.locator('[data-reuse-notice]')
  await reuse.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok("펼치면 '↺ 지난 공지 불러오기' (자주 쓰는 첫머리 칩 앞)", one(await reuse.textContent().catch(() => '')) === '↺ 지난 공지 불러오기' && (await fold.locator('.fade-x button').first().getAttribute('data-reuse-notice')) !== null)
  await reuse.click()
  const box = fold.locator('textarea[name=body]')
  ok('누르면 지난 공지가 입력칸에 그대로 · 입력칸 반짝 (data-filled)', (await box.inputValue()) === '내일 집결은 08:30 정문이에요.\n늦지 않게 와 주세요.' && (await box.getAttribute('data-filled')) === '', JSON.stringify(await box.inputValue()))
  if (SHOTS) {
    await a.waitForTimeout(400)
    await fold.screenshot({ path: `${SHOTS}/announce-reuse.png` }).catch(() => {})
  }
  await a.waitForTimeout(500)
  ok('반짝임은 한 번 (끝나면 표시가 지워짐)', (await box.getAttribute('data-filled')) === null)

  // ── 4. 고쳐서 보내면 '마지막 공지 방금'
  await box.fill('내일 집결은 08:00 정문으로 바뀌었어요.')
  await fold.getByRole('button', { name: /앱으로 보내기/ }).click()
  await fold.locator('.animate-pop', { hasText: '문자로도' }).waitFor({ timeout: 15000 }).catch(() => {})
  const sent = (await rest(`messages?thread_user_id=eq.${W}`)).filter((m) => m.job_id === J && m.body.startsWith('📢 공지'))
  ok('근무자 문의함에 새 공지', sent.some((m) => m.body === '📢 공지\n내일 집결은 08:00 정문으로 바뀌었어요.'), String(sent.length))
  await open()
  const line2 = one(await fold.locator('[data-last-notice]').innerText().catch(() => ''))
  ok("다시 열면 '마지막 공지 방금 · 내일 집결은 08:00 정문으로 바뀌었어요.' (노란 글씨)", /^마지막 공지 (방금|1분 전) · 내일 집결은 08:00 정문으로 바뀌었어요\.$/.test(line2) && (await fold.locator('[data-last-notice]').getAttribute('data-last-notice')) === 'recent', line2)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
