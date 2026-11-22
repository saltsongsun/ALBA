// 묶음 354 (사용자 요청 2026-11-22: 인사이트에 접속 요일·시간)
// · 인사이트 '접속 요일·시간': 방문(탭)마다 처음 들어온 때를 한국 시간으로 — 요일별 막대 7개 · 시간대별 막대 24개 · 가장 많이 오는 때 · 주말 비율
//   - 같은 방문의 두 번째 화면은 세지 않음 (처음 들어온 때만) · 그룹(근로자·관리자 등)마다 많이 오는 때 · 요일×시간 접어 둠
//   - 360px 옆으로 안 밀림 · 막대가 자라는 움직임 0.3초 (움직임 줄이기면 바로) · 최고 관리자만 (일반 관리자는 404 그대로)
// node scripts/qa/batch354.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099'
const N = 'aaaaaaaa-0000-4000-8000-000000000354' // 일반 관리자 (인사이트 못 봄)
const WEEK = ['일', '월', '화', '수', '목', '금', '토']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
// 오늘(한국)에서 n일 전 h시 m분 (한국 시간) → ISO
const kstAt = (daysAgo, h, m = 10) => {
  const k = new Date(Date.now() + 9 * 3600e3)
  const day = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() - daysAgo, h, m))
  return new Date(day.getTime() - 9 * 3600e3).toISOString()
}

;(async () => {
  // 방문 기록: 1일 전 14시 근로자 3명(그중 한 명은 같은 방문에서 23시에 화면 하나 더) · 2일 전 9시 관리자 1명 · 3일 전 21시 근로자 1명
  let id = 3540000
  const ev = (session, role, at, path = '/') => rest('usage_events', 'POST', { id: id++, session, role, gender: null, age_band: null, path, prev: null, kind: 'view', ms: null, depth: null, label: null, at })
  for (const s of ['w354aaaa1', 'w354aaaa2', 'w354aaaa3']) await ev(s, 'worker', kstAt(1, 14))
  await ev('w354aaaa1', 'worker', kstAt(1, 23), '/me') // 같은 방문의 두 번째 화면 — 세지 않음
  await ev('a354aaaa1', 'admin', kstAt(2, 9), '/admin')
  await ev('w354aaaa4', 'worker', kstAt(3, 21))
  // 기대값: 30일 안의 모든 'view' 기록에서 방문마다 처음 본 때 (가짜 DB에 원래 있던 기록도 함께 — 화면과 같은 규칙)
  const all = ((await rest('usage_events')) ?? []).filter((e) => e.kind === 'view' && Date.parse(e.at) >= Date.now() - 30 * 864e5)
  const first = new Map()
  for (const e of all) if (!first.has(e.session) || e.at < first.get(e.session).at) first.set(e.session, e)
  const byDay = Array(7).fill(0), byHour = Array(24).fill(0)
  for (const e of first.values()) { const k = new Date(Date.parse(e.at) + 9 * 3600e3); byDay[k.getUTCDay()]++; byHour[k.getUTCHours()]++ }
  const peak = (a) => a.reduce((b, x, i) => (x > a[b] ? i : b), 0)
  const pd = peak(byDay), ph = peak(byHour)
  const weekend = Math.round(((byDay[0] + byDay[6]) / first.size) * 1000) / 10

  const [a] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a, id: N, name: '일반관리354', phone: '01035400001', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: '2026-10-01T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const when = (p) => p.locator('[data-insight-when]')

  // ── 1. 최고 관리자: 접속 요일·시간
  const s = await pg(A)
  await s.goto(`${D}/admin/insights?d=30&dim=role`, { waitUntil: 'networkidle' })
  ok("'접속 요일·시간' 칸", (await when(s).count()) === 1 && (await when(s).locator('h2').innerText()) === '접속 요일·시간')
  ok(`방문 수 ${first.size} · 한국 시간`, one(await when(s).locator('h2 + p').innerText()) === `방문 ${first.size} · 한국 시간`, one(await when(s).locator('h2 + p').innerText()))
  const peakText = one(await s.locator('[data-insight-peak]').innerText())
  ok(`가장 많이 오는 때 '${WEEK[pd]}요일 · ${ph}시대' · 주말 ${weekend}%`, peakText === `가장 많이 오는 때 ${WEEK[pd]}요일 · ${ph}시대 · 주말 ${weekend}%`, peakText)
  const days = await s.locator('[data-insight-day]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-insight-day'), e.querySelector('span').textContent.trim()]))
  const want = [1, 2, 3, 4, 5, 6, 0].map((d) => [WEEK[d], String(byDay[d])])
  ok('요일 막대 7개 (월~일 · 방문 수 = 처음 들어온 때만)', JSON.stringify(days) === JSON.stringify(want), JSON.stringify(days))
  ok('시간대 막대 24개', (await s.locator('[data-insight-hour]').count()) === 24)
  const h23 = await s.locator('[data-insight-hour="23"]').getAttribute('title')
  ok('같은 방문의 두 번째 화면(23시)은 세지 않음', h23 === `23시 ${byHour[23]}`, h23)
  ok('가장 많은 요일·시간 막대만 진하게', (await s.locator(`[data-insight-day="${WEEK[pd]}"] .bg-brand-600`).count()) === 1 && (await s.locator(`[data-insight-hour="${ph}"].bg-brand-600`).count()) === 1)
  const segLines = await s.locator('[data-insight-seg-when] li').allInnerTexts()
  ok('그룹마다 많이 오는 때 (근로자 · 관리자)', segLines.length >= 2 && segLines.some((t) => one(t).startsWith('근로자')) && segLines.some((t) => one(t) === '관리자 ' + `${WEEK[new Date(Date.parse(kstAt(2, 9)) + 9 * 3600e3).getUTCDay()]}요일 · 9시대`) , JSON.stringify(segLines.map(one)))
  // 요일×시간: 접혀 있다가 펼치면 7줄 × 8칸
  const grid = s.locator('[data-insight-grid]')
  ok('요일 × 시간은 접혀 있음', !(await grid.evaluate((el) => el.open)))
  await grid.locator('summary').click()
  await s.waitForTimeout(350)
  ok('펼치면 요일 7줄 × 3시간 8칸', (await grid.locator('span[title]').count()) === 56)
  ok('360px 옆으로 안 밀림', await noSide(s))
  const anim = await s.locator('[data-insight-hour]').first().evaluate((el) => getComputedStyle(el).animationDuration)
  ok('막대가 0.3초 자람', anim === '0.3s', anim)
  if (SHOTS) await when(s).screenshot({ path: `${SHOTS}/insight-when.png` }).catch(() => {})

  // ── 2. 움직임 줄이기: 바로
  const r = await pg(A, { reducedMotion: 'reduce' })
  await r.goto(`${D}/admin/insights?d=30`, { waitUntil: 'networkidle' })
  const rd = await r.locator('[data-insight-hour]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로 보임', rd < 0.05, String(rd))

  // ── 3. 일반 관리자는 인사이트 없음 (그대로)
  const n = await pg(N)
  await n.goto(`${D}/admin/insights`, { waitUntil: 'networkidle' })
  // (화면을 먼저 보내기 시작해 상태 코드는 200일 수 있음 · 내용이 '없는 화면'인지 확인)
  ok('일반 관리자: 인사이트 열리지 않음 (없는 화면)', (await when(n).count()) === 0 && (await n.locator('h1', { hasText: '인사이트' }).count()) === 0)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
