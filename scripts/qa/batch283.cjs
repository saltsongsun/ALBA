// 묶음 283 (정기 개선 2026-11-17 06:35 KST) — 관리자 '지난 공고' 찾기를 지난 공고 전체에서
// · 지난 공고 탭은 최근 100개만 보이고 끝에 '최근 공고 100개까지 보여요 / 더 오래된 공고는 위 찾기 칸에서 찾아요'
// · 찾으면 100개 밖의 오래된 공고도 나옴 (전엔 최근 100개 안에서만 찾아 '없어요' → 복사·지급 확인을 못 함)
// · 찾은 글자는 옅은 노란 바탕 (제목·행사명) · 장소로 찾았으면 날짜 줄 끝에 장소도
// · 다른 회사 공고는 찾아도 안 나옴
// node scripts/qa/batch283.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-000000028302'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const hex = (n) => n.toString(16).padStart(12, '0')

;(async () => {
  const nowIso = new Date().toISOString()
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, ...jb } = base
  const past = (id, title, daysAgo, extra = {}) => ({ ...jb, id, title, event_name: null, location_name: '광장', status: 'done', start_date: kday(-daysAgo), end_date: kday(-daysAgo), applications: [], created_at: nowIso, ...extra })
  // 최근 지난 행사 105개 → 그 뒤에 아주 오래된 '해운대 불꽃축제' (100개 밖) · 다른 회사의 '불꽃' 공고
  for (let i = 0; i < 105; i++) await rest('jobs', 'POST', past(`cccccccc-0000-4000-8000-${hex(0x2830000 + i)}`, `지난 행사 ${i + 1}`, i + 2))
  const OLD = 'cccccccc-0000-4000-8000-000002839001', OTHER = 'cccccccc-0000-4000-8000-000002839002'
  await rest('jobs', 'POST', past(OLD, '불꽃축제 안내 스태프', 400, { event_name: '2025 해운대 불꽃축제', location_name: '광안리 해변' }))
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '이백팔십삼기획', seal_image: null, created_at: nowIso })
  await rest('jobs', 'POST', past(OTHER, '불꽃 다른 회사 공고', 300, { company_id: C2, location_name: '광안리' }))

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const cards = p.locator('div.sm\\:hidden > a[href^="/admin/jobs/"]')

  // ── 1. 지난 공고: 최근 100개 + 끝에 안내 두 줄
  await p.goto(`${D}/admin/jobs?tab=past`, { waitUntil: 'networkidle' })
  ok('지난 공고는 100개까지', (await cards.count()) === 100, String(await cards.count()))
  const more = p.locator('[data-past-more]')
  ok("끝에 '최근 공고 100개까지 보여요 / 더 오래된 공고는 위 찾기 칸에서 찾아요' (한 줄씩)", one(await more.textContent().catch(() => '')) === '최근 공고 100개까지 보여요더 오래된 공고는 위 찾기 칸에서 찾아요' && (await more.locator('span').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height < 22)).catch(() => false)))
  ok('360px 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) {
    await more.scrollIntoViewIfNeeded().catch(() => {})
    await p.screenshot({ path: `${SHOTS}/past-more.png` }).catch(() => {})
  }

  // ── 2. 100개 밖의 오래된 공고도 찾음 · 찾은 글자 노란 바탕 · 다른 회사 공고는 안 나옴
  await p.goto(`${D}/admin/jobs?tab=past&q=${encodeURIComponent('불꽃')}`, { waitUntil: 'networkidle' })
  ok("'불꽃'으로 찾으면 100개 밖의 오래된 공고도 · 다른 회사 공고는 안 나옴", (await cards.count()) === 1 && (await cards.first().getAttribute('href')) === `/admin/jobs/${OLD}`, `${await cards.count()}건`)
  ok("검색 결과 1건 · 안내 줄 없음", one(await p.locator('p', { hasText: '검색 결과' }).textContent().catch(() => '')) === '‘불꽃’ 검색 결과 1건' && (await p.locator('[data-past-more]').count()) === 0)
  const marks = await cards.first().locator('mark[data-hit]').allTextContents()
  const bg = await cards.first().locator('mark[data-hit]').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
  ok('찾은 글자(제목·행사명의 불꽃)는 옅은 노란 바탕', marks.length === 2 && marks.every((t) => t === '불꽃') && !!bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', `${marks.join(',')} · ${bg}`)
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/past-search.png` }).catch(() => {})

  // ── 3. 장소로 찾으면 날짜 줄 끝에 장소 (노란 바탕)
  await p.goto(`${D}/admin/jobs?tab=past&q=${encodeURIComponent('광안리')}`, { waitUntil: 'networkidle' })
  const line = one(await cards.first().locator('p.text-sub').first().textContent().catch(() => ''))
  ok("장소('광안리')로 찾으면 그 공고 · 날짜 줄 끝에 '광안리 해변'", (await cards.count()) === 1 && line.endsWith('· 광안리 해변') && (await cards.first().locator('mark[data-hit]').allTextContents()).join() === '광안리', line)
  ok('360px 옆으로 안 밀림 (찾기)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 4. 진행·예정 탭 찾기도 그대로 (글자 강조)
  await p.goto(`${D}/admin/jobs?q=${encodeURIComponent('행사장')}`, { waitUntil: 'networkidle' })
  ok("진행·예정 탭 찾기: '행사장' → 오늘 공고 · 글자 강조", (await cards.count()) >= 1 && (await cards.first().locator('mark[data-hit]').first().textContent().catch(() => '')) === '행사장')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
