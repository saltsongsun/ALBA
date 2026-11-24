// 묶음 383 (정기 개선 2026-11-25 04:36 KST)
// ① 관리자 홈 할 일 '서류 안 보냄 · 내일 근무' 줄 오른쪽 '보내기' — 공고에 들어가지 않고 바로 (두 번 눌러 확인 · 'n명에게 보낼까요?')
//    · 보내면 홈에 그대로 + 위 안내 '공고 · 확정 n명에게 서명할 서류를 보냈어요' · 그 줄은 사라짐 · 기록 doc.issue_now (이 회사)
//    · 위 줄 '서류 안 보냄 · 내일 근무'(잘리지 않음) · 공고 이름은 아래 작은 줄 · 360px 옆으로 안 밀림
// ② 근무자 내 근무 예정 카드 '서명할 서류는 늦어도 내일 저녁에 와요' / '… 11/27 저녁에 와요' (근무 전날 저녁 · 한 줄)
// node scripts/qa/batch383.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const TPL = 'ffffffff-0000-4000-8000-000000000007'
const JM = 'cccccccc-0000-4000-8000-000000038301', JL = 'cccccccc-0000-4000-8000-000000038302', JN = 'cccccccc-0000-4000-8000-000000038303'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003830${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003830${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
// 한국 시각 저녁 6시가 지나면 내일 근무는 이미 '보낼 때'(줄 없음) → 그때는 '오늘 저녁' 줄을 보지 않음
const evening = new Date(Date.now() + 9 * 3600e3).getUTCHours() >= 18

;(async () => {
  const nowIso = new Date().toISOString()
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, attendance, ...jrow } = j
  const base = { ...jrow, company_id: C1, status: 'open', required_docs: [TPL], contract_method: 'app', headcount: 10, start_time: '09:00:00', end_time: '18:00:00', created_at: nowIso, audience: 'worker' }
  const jobs = {
    [JM]: { ...base, id: JM, title: '내일 행사383', start_date: kday(1), end_date: kday(1) },
    [JL]: { ...base, id: JL, title: '사흘 뒤 행사383', start_date: kday(3), end_date: kday(3) },
    [JN]: { ...base, id: JN, title: '모레 행사383', start_date: kday(2), end_date: kday(2) },
  }
  for (const jb of Object.values(jobs)) await rest('jobs', 'POST', jb)
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 4; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}383`, phone: `010383000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  // 가짜 DB는 함께 읽기를 안 해서 지원서에 사람·공고를 같이 넣어 둠 ('내 근무' 카드용)
  const app = (n, uid, job) => rest('applications', 'POST', { id: AP(n), company_id: C1, job_id: job, user_id: U(uid), user: usr[uid], job: { ...jobs[job], company: { company_name: '주식회사 테스트' } }, status: 'approved', available_dates: null, message: null, decided_at: nowIso, held_at: null, position: null, contract_received_at: null, created_at: nowIso })
  await app(1, 1, JM)
  await app(2, 2, JM)
  await app(3, 3, JL)
  await app(4, 4, JN)

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 관리자 홈: '서류 안 보냄 · 내일 근무' + 아래 '내일 행사383' + 오른쪽 '보내기'
  const a = await pg(A)
  await open(a, '/admin')
  const row = a.locator(`[data-todo="nodoc-${JM}"]`)
  const main = row.locator('a span.block').first()
  const sub = row.locator('a span.block').nth(1)
  ok("위 줄 '서류 안 보냄 · 내일 근무' (잘리지 않음) · 아래 '내일 행사383' · 2명", one(await main.innerText().catch(() => '')) === '서류 안 보냄 · 내일 근무' && (await main.evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false)) && one(await sub.innerText().catch(() => '')) === '내일 행사383' && /2\s*명/.test(one(await row.innerText().catch(() => ''))), one(await row.innerText().catch(() => '')))
  const btn = row.locator('[data-todo-send] button')
  ok("오른쪽 '보내기' 버튼 · 줄은 두 줄 높이 · 360px 옆으로 안 밀림", one(await btn.innerText().catch(() => '')) === '보내기' && (await row.evaluate((el) => el.getBoundingClientRect().height < 64)) && (await noSide(a)))
  if (SHOTS) await row.screenshot({ path: `${SHOTS}/todo-send.png` }).catch(() => {})
  // 한 번 누르면 확인 문구 · 아직 안 보냄
  await btn.click()
  await a.waitForTimeout(300)
  ok("한 번 누르면 '2명에게 보낼까요?' (아직 안 보냄)", (await btn.getAttribute('data-confirm').catch(() => '')) === 'armed' && one(await btn.innerText().catch(() => '')) === '2명에게 보낼까요?' && ((await rest(`signed_docs?job_id=eq.${JM}`)) ?? []).length === 0, one(await btn.innerText().catch(() => '')))
  if (SHOTS) await row.screenshot({ path: `${SHOTS}/todo-send-armed.png` }).catch(() => {})
  // 안내가 주소에서 m을 곧 지우므로 도착한 순간의 주소를 잡아 둠
  let seen = ''
  await Promise.all([a.waitForURL((x) => (x.searchParams.has('m') ? ((seen = x.toString()), true) : false), { timeout: 15000 }).catch(() => {}), btn.click()])
  await a.waitForTimeout(500)
  const u = new URL(seen || a.url())
  const made = ((await rest(`signed_docs?job_id=eq.${JM}`)) ?? []).filter((d) => d.status !== 'void').length
  ok("두 번 누르면 보냄 · 홈에 그대로 · 안내 '내일 행사383 · 확정 2명에게 서명할 서류를 보냈어요'", u.pathname === '/admin' && made === 2 && decodeURIComponent(u.searchParams.get('m') ?? '') === '내일 행사383 · 확정 2명에게 서명할 서류를 보냈어요', `${u.pathname} · ${made} · ${decodeURIComponent(u.searchParams.get('m') ?? '')}`)
  ok('그 줄은 사라짐', (await a.locator(`[data-todo="nodoc-${JM}"]`).count()) === 0)
  if (SHOTS) await a.locator('main').first().screenshot({ path: `${SHOTS}/after-send.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})
  const logs = ((await rest('audit_logs?action=eq.doc.issue_now')) ?? []).filter((l) => (l.detail ?? '').startsWith(JM))
  ok('기록 doc.issue_now · 이 회사로', logs.length === 1 && logs[0].company_id === C1, JSON.stringify(logs[0] ?? null))
  ok("근무자에게 '서명할 서류가 왔어요' 알림", ((await rest(`messages?thread_user_id=eq.${U(1)}`)) ?? []).some((m) => (m.body ?? '').includes('모집이 끝나 서류가 준비됐어요')))

  // ── 2. 근무자 내 근무: 늦어도 언제
  const w3 = await pg(U(3))
  await open(w3, '/me')
  const l3 = w3.locator('[data-docs-later]')
  ok(`사흘 뒤 근무: '서명할 서류는 늦어도 ${md(kday(2))} 저녁에 와요' (한 줄)`, one(await l3.first().innerText().catch(() => '')) === `서명할 서류는 늦어도 ${md(kday(2))} 저녁에 와요` && (await l3.first().evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)) && (await noSide(w3)), one(await l3.first().innerText().catch(() => '')))
  if (SHOTS) await w3.locator('[data-next-work]').first().screenshot({ path: `${SHOTS}/me-docs-when.png` }).catch(() => {})
  const w4 = await pg(U(4))
  await open(w4, '/me')
  ok("모레 근무: '서명할 서류는 늦어도 내일 저녁에 와요'", one(await w4.locator('[data-docs-later]').first().innerText().catch(() => '')) === '서명할 서류는 늦어도 내일 저녁에 와요', one(await w4.locator('[data-docs-later]').first().innerText().catch(() => '')))
  if (!evening) {
    // 내일 근무는 방금 서류를 보냈으니 줄 없음 (서류가 오면 사라짐)
    const w1 = await pg(U(1))
    await open(w1, '/me')
    ok('서류를 받은 내일 근무는 줄 없음', (await w1.locator('[data-docs-later]').count()) === 0)
  } else ok('(저녁 6시 뒤 · 건너뜀)', true)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
