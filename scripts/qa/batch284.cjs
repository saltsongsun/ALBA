// 묶음 284 (정기 개선 2026-11-17 08:35 KST) — 회원이 많아져도 우리 회사 근무자가 명단에서 빠지지 않게
// · 근무자 명단은 가입 회원 최근 500명을 읽는데, 전엔 그 밖의 오래된 우리 회사 근무자가 '우리 회사 지원자'·'근무 많은 순'에서 빠졌음
//   → 우리 회사 근무자가 보여야 하는 화면('우리 회사 지원자' · 근무일/최근 근무/레벨/평가 순 · 확인 전 회사)에서는 빠짐없이 더함
// · 우리 회사 지원자 목록(명단 내려받기 · 지난 근무자 알림)은 지원이 1000건을 넘어도 끝까지 읽음
// · 카드의 정렬 기준 값은 진하게: 근무 많은 순 → '근무 n일' · 새로 가입 순(기본) → '가입 M/D'
// node scripts/qa/batch284.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const OLD = 'bbbbbbbb-0000-4000-8000-000000284999'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const hex = (n) => n.toString(16).padStart(12, '0')

;(async () => {
  const [w] = await rest(`users?id=eq.${W}`)
  const base = { ...w, photo_at: null, careers: [], attendance: [], ratings: [], admin_memo: null }
  // 다른 회사에서 가입한 회원 510명 (최근 가입) → 그 뒤에 우리 회사에서 오래 일한 '오래일한' (2025년 가입 · 근무 3일)
  const fill = Array.from({ length: 510 }, (_, i) => ({ ...base, id: `bbbbbbbb-0000-4000-8000-${hex(0x2840000 + i)}`, name: `회원${i + 1}`, phone: `0102840${String(i).padStart(4, '0')}`, created_at: new Date(Date.now() - i * 60_000).toISOString() }))
  for (let i = 0; i < fill.length; i += 100) await rest('users', 'POST', fill.slice(i, i + 100))
  await rest('users', 'POST', { ...base, id: OLD, name: '오래일한', phone: '01028499999', created_at: '2025-03-01T00:00:00Z', attendance: [{ work_date: kday(-30) }, { work_date: kday(-20) }, { work_date: kday(-10) }] })
  const [wa] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...wa, id: '11111111-0000-4000-8000-000002849001', user_id: OLD, user: { id: OLD, name: '오래일한' } })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const cards = p.locator('div.sm\\:hidden > div.card')
  const names = () => cards.locator('a[href^="/admin/workers/"]').allTextContents().then((t) => t.map(one))

  // ── 1. 기본(새로 가입 순): 최근 가입 회원이 위 · 가입일이 진하게
  await p.goto(`${D}/admin/workers`, { waitUntil: 'networkidle' })
  const first = cards.first()
  ok("기본 정렬: 카드의 '가입 M/D'가 진하게 (다른 값은 흐린 그대로)", one(await first.locator('[data-sort-hit]').textContent().catch(() => '')).startsWith('가입 ') && (await first.locator('[data-sort-hit]').count()) === 1)
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. '우리 회사 지원자': 최근 500명 밖의 오래된 근무자도
  await p.goto(`${D}/admin/workers?f=mine`, { waitUntil: 'networkidle' })
  const mine = await names()
  ok("'우리 회사 지원자'에 최근 가입 500명 밖의 '오래일한'도 · 다른 회사 회원은 없음", mine.includes('오래일한') && !mine.some((n) => n.startsWith('회원')), mine.join(','))

  // ── 3. 근무 많은 순: 오래 일한 사람이 맨 위 · '근무 3일' 진하게
  await p.goto(`${D}/admin/workers?s=days`, { waitUntil: 'networkidle' })
  const top = one(await cards.first().locator('a[href^="/admin/workers/"]').first().textContent().catch(() => ''))
  const hit = one(await cards.first().locator('[data-sort-hit]').textContent().catch(() => ''))
  const weight = await cards.first().locator('[data-sort-hit]').evaluate((el) => getComputedStyle(el).fontWeight).catch(() => '')
  ok("근무 많은 순: 맨 위 '오래일한' · 카드의 '근무 3일'이 진하게", top === '오래일한' && hit === '근무 3일' && Number(weight) >= 600, `${top} · ${hit} · ${weight}`)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/roster-days.png` }).catch(() => {})
  ok('360px 옆으로 안 밀림 (근무 많은 순)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 명단 내려받기(CSV)에도 오래된 근무자 · 다른 회사 회원은 없음
  const csv = await p.evaluate(async (u) => (await fetch(u)).text(), `${D}/admin/export/workers`)
  ok("명단 내려받기에 '오래일한' · 다른 회사 회원 없음", csv.includes('오래일한') && !csv.includes('회원1,') && !/회원\d+/.test(csv), csv.slice(0, 80).replace(/\n/g, ' | '))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
