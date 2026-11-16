// 묶음 282 (정기 개선 2026-11-17 04:36 KST) — 여러 회사 공고가 쌓여도 홈에서 빠지지 않게
// · 홈 공고 목록은 50개씩: 더 있으면 제목 '모집 중인 알바 50+' · 맨 아래 '공고 더 보기 ↓'
//   누르면 같은 거르기 그대로 50개 더 → 새로 붙은 첫 공고로 내려가 잠깐 테두리 (#more-50)
// · 내 근무 수('확정 n건 · 확정 대기 n건')와 오늘 근무 카드는 목록(앞의 50개)이 아니라 내 지원에서
//   → 앞에 공고가 많아 목록 밖에 있는 내 오늘 근무도 맨 위 카드로 보임 (전엔 카드가 사라지고 '공고를 골라 지원해 보세요')
// node scripts/qa/batch282.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C1 = '99999999-0000-4000-8000-000000000099'
const W2 = 'bbbbbbbb-0000-4000-8000-000000282002'
const C2 = '99999999-0000-4000-8000-000000028202'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const hex = (n) => n.toString(16).padStart(12, '0')

;(async () => {
  const nowIso = new Date().toISOString()
  // 다른 회사가 공고 56개를 올림 (사흘 뒤) → 그 뒤에 W2의 오늘 근무 · 다음 주 확정 · 확정 대기 공고
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '이백팔십이기획', seal_image: null, created_at: nowIso })
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, ...jb } = base
  const mk = (id, title, start, end, extra = {}) => ({ ...jb, id, company_id: C2, company: { company_name: '이백팔십이기획', verified: true }, title, start_date: start, end_date: end, applications: [], created_at: nowIso, ...extra })
  const fill = Array.from({ length: 56 }, (_, i) => mk(`cccccccc-0000-4000-8000-${hex(0x2820000 + i)}`, `채움 공고 ${i + 1}`, kday(3), kday(3)))
  const JT = 'cccccccc-0000-4000-8000-000002829001', JF = 'cccccccc-0000-4000-8000-000002829002', JW = 'cccccccc-0000-4000-8000-000002829003'
  const jt = mk(JT, '목록 밖 오늘 근무', kday(0), kday(0), { start_time: '00:00:00', end_time: '23:59:00' })
  const jf = mk(JF, '목록 밖 다음 주 근무', kday(7), kday(7))
  const jw = mk(JW, '목록 밖 기다리는 공고', kday(8), kday(8))
  for (const j of [...fill, jt, jf, jw]) await rest('jobs', 'POST', j)
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: W2, name: '두번째', phone: '01028200002', created_at: nowIso })
  const app = (n, job, status) => ({ id: `11111111-0000-4000-8000-${hex(0x2828000 + n)}`, job_id: job.id, user_id: W2, status, available_dates: null, position: null, contract_received_at: null, message: null, admin_memo: null, decided_at: null, created_at: nowIso, company_id: C2, job: (({ applications, ...x }) => x)(job), user: { id: W2, name: '두번째' } })
  await rest('applications', 'POST', app(1, jt, 'approved'))
  await rest('applications', 'POST', app(2, jf, 'approved'))
  await rest('applications', 'POST', app(3, jw, 'applied'))
  const total = (await rest('jobs')).length

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W2), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const cards = () => p.locator('#jobs ~ div a[href^="/jobs/"], #jobs ~ section a[href^="/jobs/"]').count()

  // ── 1. 목록 밖 내 근무: 오늘 근무 카드 · 확정/대기 수
  await p.goto(`${D}/`, { waitUntil: 'networkidle' })
  const hero = p.locator('[data-today-hero]')
  ok(`공고 ${total}개 중 목록(50개) 밖의 내 오늘 근무도 맨 위 카드로`, one(await hero.textContent().catch(() => '')).includes('목록 밖 오늘 근무'), one(await hero.textContent().catch(() => '')).slice(0, 60))
  const hello = one(await p.locator('a[href="/me"]', { hasText: '안녕하세요' }).textContent().catch(() => ''))
  ok("인사 카드 '확정 1건 · 확정 대기 1건' (오늘 근무는 위 카드라 빼고)", hello.includes('확정 1건 · 확정 대기 1건'), hello)

  // ── 2. 50개만 · 제목 '50+' · 더 보기
  const head = one(await p.locator('h2#jobs').textContent())
  ok("제목에 '+' (보이는 것보다 더 있음)", /모집 중인 알바 \d+\+$/.test(head), head)
  ok('처음엔 공고 50개만', (await p.locator('a[href^="/jobs/"]').count()) === 50, String(await p.locator('a[href^="/jobs/"]').count()))
  const more = p.locator('[data-more-jobs]')
  ok("맨 아래 '공고 더 보기 ↓' → 같은 화면 50개 더 · 새 첫 공고로", one(await more.textContent().catch(() => '')) === '공고 더 보기 ↓' && (await more.getAttribute('href').catch(() => '')) === '/?n=100#more-50', await more.getAttribute('href').catch(() => ''))
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await more.scrollIntoViewIfNeeded()
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/home-more.png` }).catch(() => {})
  await Promise.all([p.waitForURL(/n=100/, { timeout: 20000 }).catch(() => {}), more.click()])
  const target = p.locator('#more-50')
  await target.waitFor({ timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(600)
  const n2 = await p.locator('a[href^="/jobs/"]').count()
  ok(`누르면 나머지도 보임 (${total}개 모두) · 더 볼 공고가 없으면 버튼 없음`, n2 === total && (await more.count()) === 0, `${n2}/${total}`)
  const inView = await target.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 100 }).catch(() => false)
  ok('새로 붙은 첫 공고로 내려와 있음 (테두리 표시용 #more-50)', inView && (await target.getAttribute('data-target-flash').catch(() => null)) === '', `${await target.evaluate((el) => Math.round(el.getBoundingClientRect().top)).catch(() => 'none')}`)
  ok("제목 '+' 없어짐", !one(await p.locator('h2#jobs').textContent()).endsWith('+'))
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/home-more-after.png` }).catch(() => {})

  // ── 3. 거르기를 켠 채 더 보기: 같은 거르기 유지
  await p.goto(`${D}/?when=week`, { waitUntil: 'networkidle' })
  ok("거르기('7일 안')를 켠 채 더 보기 → 거르기 그대로", (await p.locator('[data-more-jobs]').getAttribute('href').catch(() => '')) === '/?when=week&n=100#more-50', await p.locator('[data-more-jobs]').getAttribute('href').catch(() => ''))

  // ── 4. 공고가 적으면(근무자 W, 기본) 버튼·'+' 없음 — 위 공고를 지우고 확인
  for (const j of [...fill, jt, jf, jw]) await rest(`jobs?id=eq.${j.id}`, 'DELETE')
  await ctx.clearCookies()
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  await p.goto(`${D}/`, { waitUntil: 'networkidle' })
  ok("공고가 50개 이하면 '더 보기'·'+' 없음 · 오늘 근무 카드는 그대로", (await p.locator('[data-more-jobs]').count()) === 0 && !one(await p.locator('h2#jobs').textContent()).includes('+') && (await p.locator('[data-today-hero]').count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
