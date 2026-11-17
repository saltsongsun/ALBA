// 묶음 292 (정기 개선 2026-11-17 20:36 KST)
// · 관리자 홈 '곧 시작하는데 인원이 모자라요': 모집 중인 공고마다 '모집 글 복사' (공고 화면의 '문구 복사'와 같은 단톡방 글 + 지원 링크)
//   공고 화면까지 가지 않고 바로 복사 · 근무자에게 인원을 숨긴 공고는 글에도 인원 없음 · 마감한 공고는 복사 대신 '모집 다시 열기'만
// · 로그인 비밀번호 칸: 친 자리만큼 점 6개가 하나씩 참 (6자리면 초록) · 6자리가 안 된 채 누르면 보내지 않고 '지금 n자리'
//   (모자란 번호로 보내면 틀린 횟수로 세어져 잠길 수 있었음 — 로그인 처리 자체는 그대로)
// node scripts/qa/batch292.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-000000002921', J3 = 'cccccccc-0000-4000-8000-000000002922'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 내일 시작 · 5명 모집 · 확정 0 (모집 중 하나 + 마감 하나)
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  const mkJob = (id, title, status) => rest('jobs', 'POST', { ...jb, id, title, status, headcount: 5, start_date: kday(1), end_date: kday(1), hidden_fields: [], applications: [], attendance: [], created_at: new Date().toISOString() })
  await mkJob(J2, '불꽃축제 주차 안내', 'open')
  await mkJob(J3, '불꽃축제 물품 보관', 'closed')

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: D })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 관리자 홈: 모자란 공고에 '모집 글 복사'
  const a = await mk(A)
  const row = (title) => a.locator('[data-shortage] li', { hasText: title }).first()
  const openDash = async () => {
    await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
    await a.locator('[data-shortage]').waitFor({ timeout: 15000 }).catch(() => {})
  }
  await openDash()
  const copy = row('주차 안내').locator('[data-short-copy] button')
  ok("모집 중인 모자란 공고: '모집 글 복사' 버튼", (await copy.count()) === 1 && one(await copy.textContent()) === '모집 글 복사')
  ok("마감한 공고: 복사 없음 · '모집 다시 열기'는 그대로", (await row('물품 보관').locator('[data-short-copy]').count()) === 0 && (await row('물품 보관').getByRole('button', { name: '모집 다시 열기' }).count()) === 1)
  ok('버튼 줄은 한 줄 (360px)', await row('주차 안내').locator('[data-short-copy]').evaluate((el) => { const box = el.parentElement; const tops = [...box.children].map((c) => (c.firstElementChild ?? c).getBoundingClientRect().top); return Math.max(...tops) - Math.min(...tops) < 4 }))
  ok('360px 옆으로 안 밀림 (관리자 홈)', await noSide(a))
  await copy.click()
  await a.waitForTimeout(300)
  const clip = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok("누르면 '복사됨 ✓'", one(await copy.textContent()) === '복사됨 ✓')
  ok('복사한 글: 회사 이름 · 공고 · 일정 · 급여 · 지원 링크', clip.includes('[주식회사 테스트]') && clip.includes('■ 불꽃축제 주차 안내') && clip.includes('■ 일정:') && clip.includes('■ 급여: 시급 10,320원') && clip.includes(`/jobs/${J2}`), clip.replace(/\n/g, ' | ').slice(0, 200))
  ok('근무자에게 인원을 숨긴 공고: 글에도 인원 없음', !clip.includes('■ 인원'))
  if (SHOTS) await a.locator('[data-shortage]').screenshot({ path: `${SHOTS}/shortage-copy.png` }).catch(() => {})
  // 인원 보이기를 켠 공고는 글에도 인원
  await rest(`jobs?id=eq.${J2}`, 'PATCH', { hidden_fields: ['headcount_shown'] })
  await openDash()
  await row('주차 안내').locator('[data-short-copy] button').click()
  await a.waitForTimeout(300)
  const clip2 = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '')
  ok("인원 보이기를 켠 공고: 글에 '■ 인원: 5명'", clip2.includes('■ 인원: 5명'))

  // ── 2. 로그인: 비밀번호 점 6개 · 모자라면 보내지 않음
  const g = await mk(null)
  await g.goto(`${D}/login`, { waitUntil: 'networkidle' })
  const dots = g.locator('[data-pin-dots]')
  const filled = () => dots.locator('span.bg-brand-600, span.bg-emerald-500').count()
  ok('처음엔 점 6개 모두 빈칸', (await dots.locator('span').count()) === 6 && (await filled()) === 0)
  await g.fill('#phone', '01033334444')
  await g.locator('#pin').pressSequentially('4829')
  ok('4자리 치면 점 4개가 참', (await dots.getAttribute('data-pin-dots')) === '4' && (await filled()) === 4)
  ok('점은 라벨과 한 줄', await dots.evaluate((el) => Math.abs(el.getBoundingClientRect().top - document.querySelector('label[for=pin]').getBoundingClientRect().top) < 8))
  let posted = 0
  g.on('request', (r) => { if (r.method() === 'POST' && new URL(r.url()).pathname === '/login') posted++ })
  await g.getByRole('button', { name: '로그인' }).click()
  await g.waitForTimeout(600)
  ok("6자리가 안 되면 보내지 않고 '비밀번호는 숫자 6자리예요 · 지금 4자리'", posted === 0 && one(await g.locator('[data-pin-short]').textContent().catch(() => '')) === '비밀번호는 숫자 6자리예요 · 지금 4자리' && new URL(g.url()).pathname === '/login')
  ok('비밀번호 칸으로 커서', await g.evaluate(() => document.activeElement?.id === 'pin'))
  ok('360px 옆으로 안 밀림 (로그인)', await noSide(g))
  if (SHOTS) await g.locator('form').first().screenshot({ path: `${SHOTS}/login-short.png` }).catch(() => {})
  await g.locator('#pin').pressSequentially('17')
  ok('다시 치면 안내가 사라지고 6자리면 점이 모두 초록', (await g.locator('[data-pin-short]').count()) === 0 && (await dots.locator('span.bg-emerald-500').count()) === 6)
  if (SHOTS) await g.locator('form').first().screenshot({ path: `${SHOTS}/login-full.png` }).catch(() => {})
  await g.getByRole('button', { name: '로그인' }).click()
  await g.waitForTimeout(1500)
  ok('6자리면 그대로 보냄 (틀린 번호 → 서버 안내)', posted === 1 && (await g.locator('main').innerText()).includes('비밀번호'), String(posted))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
