// 묶음 372 (정기 개선 2026-11-24 07:35 KST)
// · 서식 편집 화면 위: 이 서식을 쓰는 진행 중 공고(모집 중·마감 · 아직 안 끝남) 'n개에서 써요' + 공고 칩(→ 그 공고 서류 탭) 3개까지 · '외 n개'
//   + 아직 서명 안 한 서류가 있으면 '서명 기다리는 n건은 고친 내용으로 받아요' (서명 전 서류는 열 때 지금 서식으로 그려져서)
//   · 끝난 공고만 쓰거나 안 쓰는 서식은 안내 없음 · 우리 회사 공고·서류만 셈 (다른 회사가 같은 서식 번호를 적어 둬도 안 셈)
// · 서식 목록 카드: '수정 M/D · 진행 중 공고 n개에서 써요'
// · 서식 편집: 이름 칸·종류 칸에 이름표 ('서식 이름' · '종류') · '항목별로/글 전체로 고치기'는 흰 막대가 0.2초 미끄러짐 (움직임 줄이기면 바로)
// node scripts/qa/batch372.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000372'
const TPL = 'ffffffff-0000-4000-8000-000000000007'
const T2 = 'eeeeeeee-0000-4000-8000-000000037201' // 끝난 공고에서만 쓴 서식
const T3 = 'eeeeeeee-0000-4000-8000-000000037202' // 아무 데도 안 쓰는 서식
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = Date.now(), nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job
  const live = { start_date: kday(now - 864e5), end_date: kday(now + 864e5), status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', { ...live, required_docs: [TPL] })
  const tbase = { company_id: C1, kind: 'pledge', body: '# 서약서\n\n{{근로자명}}', is_default: false, active: true, created_at: nowIso, updated_at: nowIso }
  await rest('doc_templates', 'POST', { ...tbase, id: T2, title: '끝난 행사 서약서372' })
  await rest('doc_templates', 'POST', { ...tbase, id: T3, title: '안 쓰는 서약서372' })
  // 끝난 공고(어제 끝)가 T2를 씀 · 마감(closed) 공고가 TPL을 씀 · 취소 공고는 TPL을 써도 안 셈
  const mkJob = (id, title, extra) => rest('jobs', 'POST', { ...jl, id, title, applications: [], attendance: [], created_at: nowIso, ...extra })
  await mkJob('cccccccc-0000-4000-8000-000000037201', '어제 끝난 행사372', { start_date: kday(now - 3 * 864e5), end_date: kday(now - 864e5), status: 'closed', required_docs: [T2] })
  await mkJob('cccccccc-0000-4000-8000-000000037202', '마감된 행사372', { ...live, status: 'closed', required_docs: [TPL] })
  await mkJob('cccccccc-0000-4000-8000-000000037203', '취소된 행사372', { ...live, status: 'cancelled', required_docs: [TPL] })
  // 다른 회사: 같은 서식 번호를 적은 공고 · 서명 대기 서류 (우리 회사 수에 안 들어가야 함)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른회사372', join_code: 'OT372', seal_image: null, created_at: nowIso })
  await mkJob('cccccccc-0000-4000-8000-000000037204', '다른회사 행사372', { ...live, company_id: C2, company: { company_name: '다른회사372' }, required_docs: [TPL] })
  await rest('signed_docs', 'POST', { id: 'dddddddd-0000-4000-8000-000000037201', company_id: C2, job_id: 'cccccccc-0000-4000-8000-000000037204', user_id: W, template_id: TPL, kind: 'contract', title: '근로계약서', status: 'pending', created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const mk = async (opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk()
  const open = async (id) => { await a.goto(`${D}/admin/docs/${id}`, { waitUntil: 'networkidle' }); await a.locator('main h1').first().waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 진행 중 공고 2개(모집 중 + 마감)에서 쓰는 서식 · 서명 대기 1건 (기본 자료)
  await open(TPL)
  const use = a.locator('[data-tpl-usage]')
  ok("'진행 중 공고 2개에서 써요' (모집 중 + 마감 · 끝난·취소·다른 회사 공고는 안 셈)", one(await use.locator('p').first().innerText().catch(() => '')) === '진행 중 공고 2개에서 써요', one(await use.innerText().catch(() => '')))
  const chips = use.locator('[data-tpl-job]')
  const titles = (await chips.allInnerTexts()).map(one)
  ok('공고 칩 2개 · 우리 회사 공고만', titles.length === 2 && titles.includes('마감된 행사372') && !titles.some((t) => /취소된|어제 끝난|다른회사/.test(t)), titles.join(' | '))
  ok("칩을 누르면 그 공고 서류 탭으로", (await use.locator(`a[href="/admin/jobs/${J}?tab=docs"]`).count()) === 1)
  ok("'서명 기다리는 1건은 고친 내용으로 받아요' (다른 회사 서류는 안 셈)", one(await use.locator('[data-tpl-pending]').innerText().catch(() => '')) === '서명 기다리는 1건은 고친 내용으로 받아요' && (await use.locator('[data-tpl-pending]').getAttribute('data-tpl-pending')) === '1')
  const ca = await chips.first().evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration]).catch(() => [])
  ok('칩은 0.25초 톡 하고 나타남', JSON.stringify(ca) === '["pop","0.25s"]', JSON.stringify(ca))
  ok('360px 옆으로 안 밀림 (서식 편집)', await noSide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/tpl-edit.png` }).catch(() => {})

  // ── 2. 이름표 · 미끄러지는 막대
  ok("이름 칸·종류 칸에 이름표 '서식 이름' · '종류'", (await a.locator('label', { has: a.locator('input[name=title]') }).locator('span', { hasText: '서식 이름' }).count()) === 1 && (await a.locator('label', { has: a.locator('select[name=kind]') }).locator('span', { hasText: '종류' }).count()) === 1)
  const mode = a.locator('[data-tpl-mode]'), pill = a.locator('[data-tpl-pill]')
  const x0 = await pill.evaluate((el) => el.getBoundingClientRect().left)
  ok("처음엔 '항목별로 고치기' (aria-pressed)", (await mode.getAttribute('data-tpl-mode')) === 'items' && (await a.getByRole('button', { name: '항목별로 고치기' }).getAttribute('aria-pressed')) === 'true')
  const dur = await pill.evaluate((el) => getComputedStyle(el).transitionDuration)
  await a.getByRole('button', { name: '글 전체로 고치기' }).click()
  await a.waitForTimeout(350)
  const x1 = await pill.evaluate((el) => el.getBoundingClientRect().left)
  const btn = await a.getByRole('button', { name: '글 전체로 고치기' }).boundingBox()
  ok('누르면 흰 막대가 오른쪽 칸으로 0.2초 미끄러짐', dur === '0.2s' && x1 > x0 + 50 && Math.abs(x1 - btn.x) <= 2 && (await mode.getAttribute('data-tpl-mode')) === 'text', `${dur} ${Math.round(x0)}→${Math.round(x1)} btn ${Math.round(btn.x)}`)
  ok('글 전체 칸이 나옴', (await a.locator('form textarea').count()) >= 1)
  const r = await mk({ reducedMotion: 'reduce' })
  await r.goto(`${D}/admin/docs/${TPL}`, { waitUntil: 'networkidle' })
  const rd = await r.locator('[data-tpl-pill]').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  // ── 3. 끝난 공고에서만 쓴 서식 · 안 쓰는 서식: 안내 없음
  await open(T2)
  ok('끝난 공고에서만 쓴 서식: 안내 없음', (await a.locator('[data-tpl-usage]').count()) === 0)
  await open(T3)
  ok('안 쓰는 서식: 안내 없음', (await a.locator('[data-tpl-usage]').count()) === 0)

  // ── 4. 공고가 많으면 칩 3개 + '외 n개'
  for (const n of [5, 6, 7]) await mkJob(`cccccccc-0000-4000-8000-00000003720${n}`, `추가 행사372-${n}`, { ...live, required_docs: [TPL] })
  await open(TPL)
  ok("진행 중 공고 5개 → 칩 3개 + '외 2개'", one(await a.locator('[data-tpl-usage] p').first().innerText().catch(() => '')) === '진행 중 공고 5개에서 써요' && (await a.locator('[data-tpl-job]').count()) === 3 && (await a.locator('[data-tpl-usage]').innerText()).includes('외 2개'))

  // ── 5. 서식 목록 카드
  await a.goto(`${D}/admin/docs?tab=tpl`, { waitUntil: 'networkidle' })
  const card = (id) => a.locator(`a[href="/admin/docs/${id}"]`)
  ok("목록: 근로계약서 카드 '· 진행 중 공고 5개에서 써요'", one(await card(TPL).locator('[data-tpl-used]').innerText().catch(() => '')) === '· 진행 중 공고 5개에서 써요')
  ok('목록: 끝난 공고만 쓴 서식 · 안 쓰는 서식엔 없음', (await card(T2).locator('[data-tpl-used]').count()) === 0 && (await card(T3).locator('[data-tpl-used]').count()) === 0)
  ok('360px 옆으로 안 밀림 (서식 목록)', await noSide(a))
  if (SHOTS) await card(TPL).screenshot({ path: `${SHOTS}/tpl-list.png` }).catch(() => {})

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
