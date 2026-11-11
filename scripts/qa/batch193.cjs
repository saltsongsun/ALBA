// 묶음 193 (정기 개선 2026-11-11 09:35 KST)
// · 공고 화면(지원하고 확정 대기): 하루 안에 시작하거나 이미 시작했으면 '곧 시작인데 아직 확정 전이에요 · 담당자에게 문의 →'
//   (내 근무 '확정 대기' 칸과 같은 줄 · 줄 전체가 누르는 곳 → 문의 화면 첫 빠른 답 '지원했는데 확정 여부가 궁금해요.')
// · 전문가 의뢰 화면 아래 버튼은 '이 의뢰 문의하기' (알바 공고는 '이 공고 문의하기' 그대로)
// (단체방 관리자 알림 제목의 회사 이름은 push-admin-company.cjs에서 확인)
// node scripts/qa/batch193.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011', AP_APP = '11111111-0000-4000-8000-000000000012'
const E = 'bbbbbbbb-0000-4000-8000-000000019301', JE = 'cccccccc-0000-4000-8000-000000019301'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const kstHm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now()
  const setJob = async (patch) => {
    await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
    const [app] = await rest(`applications?id=eq.${AP_APP}`)
    await rest(`applications?id=eq.${AP_APP}`, 'PATCH', { available_dates: null, status: 'applied', job: { ...app.job, ...patch } })
  }
  // 23시간 뒤 시작 (하루 안)
  const at = now + 23 * 3600e3
  await setJob({ start_date: kstDay(at), end_date: kstDay(at + 2 * 3600e3), start_time: `${kstHm(at)}:00`, end_time: `${kstHm(at + 2 * 3600e3)}:00`, status: 'open' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const p = await pg(AP)
  const line = p.locator('[data-confirm-soon]')
  const open = async () => { await p.goto(`${D}/jobs/${J}`); await p.locator('[data-apply-steps]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 곧 시작 · 확정 전
  await open()
  const box = await line.evaluate((el) => ({ tag: el.tagName, kind: el.dataset.confirmSoon, h: Math.round(el.getBoundingClientRect().height), href: el.getAttribute('href') })).catch(() => null)
  ok("지원 접수 칸에 '곧 시작인데 아직 확정 전이에요 · 담당자에게 문의 →'", !!box && box.kind === 'soon' && one(await line.innerText()) === '곧 시작인데 아직 확정 전이에요 담당자에게 문의 →' && box.href === `/me/chat?job=${J}&ask=confirm`, JSON.stringify(box))
  ok('줄 전체가 누르는 곳 (40px 이상 · 한 줄) · 옆으로 안 밀림', !!box && box.tag === 'A' && box.h >= 40 && box.h <= 44 && (await noSide(p)), JSON.stringify(box))
  ok("'지원이 접수됐어요' · 진행 단계(확정)는 그대로", (await p.getByText('지원이 접수됐어요. 확정되면 알려 드릴게요.').count()) === 1 && (await p.locator('[data-apply-steps]').getAttribute('data-apply-steps')) === '2')
  if (SHOTS) { await line.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.waitForTimeout(500); await p.screenshot({ path: `${SHOTS}/job-confirm-soon.png` }).catch(() => {}) }
  await line.click({ position: { x: 20, y: 20 } })
  await p.waitForURL((u) => u.pathname === '/me/chat' && u.searchParams.get('ask') === 'confirm', { timeout: 15000 }).catch(() => {})
  const chips = p.locator('[data-quick-replies] button')
  await chips.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("누르면 문의 화면 · 첫 빠른 답 '지원했는데 확정 여부가 궁금해요.'", one(await chips.first().innerText().catch(() => '')) === '지원했는데 확정 여부가 궁금해요.', p.url())

  // ── 2. 이미 시작 / 멀리 남음 / 확정됨
  await setJob({ start_date: kstDay(now - 864e5), end_date: kstDay(now + 864e5), start_time: '00:00:00', end_time: '23:59:00' })
  await open()
  ok("이미 시작한 근무: '시작했는데 아직 확정 전이에요'", (await line.getAttribute('data-confirm-soon').catch(() => '')) === 'started' && one(await line.innerText().catch(() => '')) === '시작했는데 아직 확정 전이에요 담당자에게 문의 →')
  const far = now + 3 * 864e5
  await setJob({ start_date: kstDay(far), end_date: kstDay(far), start_time: '09:00:00', end_time: '18:00:00' })
  await open()
  ok('사흘 뒤 근무: 줄 없음', (await line.count()) === 0 && (await p.getByText('지원이 접수됐어요. 확정되면 알려 드릴게요.').count()) === 1)
  await setJob({ start_date: kstDay(now - 864e5), end_date: kstDay(now + 864e5), start_time: '00:00:00', end_time: '23:59:00' })
  const w = await pg(W) // 확정된 근무자
  await w.goto(`${D}/jobs/${J}`)
  await w.locator('[data-apply-steps]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('확정된 사람에게는 줄 없음', (await w.locator('[data-confirm-soon]').count()) === 0 && (await w.getByText('근무가 확정됐어요.').count()) === 1)
  ok("알바 공고 아래 버튼은 '이 공고 문의하기' 그대로", (await w.getByRole('link', { name: '이 공고 문의하기' }).count()) === 1)

  // ── 3. 전문가 의뢰: '이 의뢰 문의하기'
  const [wu] = await rest(`users?id=eq.${W}`)
  const [j] = await rest(`jobs?id=eq.${J}`)
  const tmr = kstDay(now + 864e5)
  await rest('users', 'POST', { ...wu, id: E, name: '전문가', phone: '01019300001', member_type: 'expert', specialty: '음향 엔지니어', attendance: [], ratings: [] })
  await rest('jobs', 'POST', { ...j, id: JE, audience: 'expert', title: '축제 메인 무대 음향 엔지니어', start_date: tmr, end_date: tmr, start_time: '09:00:00', end_time: '18:00:00', status: 'open', applications: [] })
  const e = await pg(E)
  await e.goto(`${D}/jobs/${JE}`)
  const ask = e.getByRole('link', { name: '이 의뢰 문의하기' })
  await ask.waitFor({ timeout: 15000 }).catch(() => {})
  ok("전문가 의뢰 아래 버튼: '이 의뢰 문의하기' (공고라는 말 없음)", (await ask.count()) === 1 && (await ask.getAttribute('href')) === `/me/chat?job=${JE}` && (await e.getByRole('link', { name: '이 공고 문의하기' }).count()) === 0 && (await noSide(e)))
  const g = await pg('')
  await g.goto(`${D}/jobs/${JE}`)
  const gAsk = g.getByRole('link', { name: '이 의뢰 문의하기' })
  await gAsk.waitFor({ timeout: 15000 }).catch(() => {})
  ok('비회원이 본 전문가 의뢰도 같음 (로그인 뒤 문의로)', (await gAsk.getAttribute('href').catch(() => '')) === `/login?next=${encodeURIComponent(`/me/chat?job=${JE}`)}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
