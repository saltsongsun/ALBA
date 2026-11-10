// 묶음 172 (정기 개선 2026-11-10 09:35 KST)
// · 공고 화면 지원 칸: 오늘 3시간 안에 시작하는 근무면 'HH:MM 시작 · n시간 m분 뒤예요 / 늦지 않게 갈 수 있을 때 지원해 주세요'
//   (지원하고 늦거나 못 오는 일을 줄이려고 · 3시간보다 멀면 안 보임)
// · 아래 탭 배지(근무자 문의·할 일, 관리자 문의): 숫자가 바뀌면 배지가 다시 한 번 톡 (새 답장이 온 걸 바로 알게)
// node scripts/qa/batch172.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const NEW = 'bbbbbbbb-0000-4000-8000-000000000172'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kstHm = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 곧 시작하는 근무: 지원 칸에 한 줄 (아직 지원 안 한 새 근무자 · 얼굴 사진 있음)
  const [w0] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w0, id: NEW, name: '새근무자', phone: '01017217200', photo_at: '2026-10-29T00:00:00Z', attendance: [], ratings: [] })
  const startMs = Math.ceil((Date.now() + 130 * 60e3) / 60e3) * 60e3
  const endMs = startMs + 2 * 3600e3
  if (kstDay(startMs) !== kstDay(Date.now()) || kstDay(endMs) !== kstDay(Date.now())) {
    console.log('SKIP  자정 가까워 곧 시작 확인 생략')
  } else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kstDay(Date.now()), end_date: kstDay(Date.now()), start_time: `${kstHm(startMs)}:00`, end_time: `${kstHm(endMs)}:00`, status: 'open', headcount: 5 })
    const n = await pg(NEW)
    await n.goto(`${D}/jobs/${J}`)
    const note = n.locator('[data-soon-note]')
    await note.waitFor({ timeout: 15000 }).catch(() => {})
    const t = ((await note.innerText().catch(() => '')) ?? '').replace(/\n/g, ' / ')
    ok(`'${kstHm(startMs)} 시작 · 2시간 1n분 뒤예요 / 늦지 않게 갈 수 있을 때 지원해 주세요'`, new RegExp(`^${kstHm(startMs)} 시작 · 2시간 1\\d분 뒤예요 / 늦지 않게 갈 수 있을 때 지원해 주세요$`).test(t), t)
    ok('두 줄 각각 한 줄 · 360px 옆으로 안 밀림', (await note.evaluate((el) => [...el.children].every((c) => c.getBoundingClientRect().height < 24))) && (await wide(n)))
    ok('지원 버튼은 그대로', (await n.getByRole('button', { name: /새근무자님으로 지원하기/ }).count()) === 1)
    if (SHOTS) await note.locator('xpath=ancestor::form[1]').screenshot({ path: `${SHOTS}/soon-note.png` }).catch(() => {})
    // 3시간보다 멀면 안 보임
    const far = Math.ceil((Date.now() + 200 * 60e3) / 60e3) * 60e3
    if (kstDay(far + 3600e3) === kstDay(Date.now())) {
      await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: `${kstHm(far)}:00`, end_time: `${kstHm(far + 3600e3)}:00` })
      await n.goto(`${D}/jobs/${J}`)
      await n.getByRole('button', { name: /새근무자님으로 지원하기/ }).waitFor({ timeout: 15000 }).catch(() => {})
      ok('3시간보다 멀면 안 보임', (await n.locator('[data-soon-note]').count()) === 0)
    }
  }

  // ── 2. 아래 탭 '문의' 배지: 새 답장이 오면 숫자가 바뀌며 다시 톡
  const w = await pg(W)
  await w.goto(`${D}/me`)
  const badge = w.locator('[data-nav-badge=chat]')
  await badge.waitFor({ timeout: 15000 }).catch(() => {})
  const before = (await badge.innerText().catch(() => '')).trim()
  await badge.evaluate((el) => { el.dataset.mark = 'old' })
  await rest('messages', 'POST', { thread_user_id: W, sender_id: A, from_admin: true, job_id: null, body: '배지 확인용 답장', read_at: null, created_at: new Date().toISOString(), job: null, sender: { name: '관리자' }, user: { id: W, name: '근무자', phone: '01033334444' } })
  // 다른 앱에 갔다 돌아온 것처럼 (화면이 새 숫자를 받아 옴)
  await w.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  const changed = await w.waitForFunction((b) => { const el = document.querySelector('[data-nav-badge=chat]'); return el && el.textContent.trim() !== b }, before, { timeout: 10000 }).then(() => true, () => false)
  const after = (await badge.innerText().catch(() => '')).trim()
  ok(`새 답장: 배지 숫자 ${before} → ${Number(before) + 1}`, changed && after === String(Number(before) + 1), `${before} → ${after}`)
  ok('바뀐 배지는 새로 그려져 다시 톡 (pop)', await badge.evaluate((el) => !el.dataset.mark && getComputedStyle(el).animationName === 'pop').catch(() => false))

  // ── 3. 관리자 아래 탭 '문의' 배지도 같은 방식 (key로 새로 그림)
  const a = await pg(A)
  await a.goto(`${D}/admin`)
  const ab = a.locator('[data-nav-badge=chat]:visible').first()
  ok('관리자 문의 배지도 톡 (pop)', await ab.waitFor({ timeout: 15000 }).then(() => ab.evaluate((el) => getComputedStyle(el).animationName === 'pop'), () => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
