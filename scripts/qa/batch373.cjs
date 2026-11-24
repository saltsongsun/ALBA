// 묶음 373 (정기 개선 2026-11-24 09:35 KST)
// · 서식 탭 '다른 회사 서식 가져오기 · n개' (여러 회사를 맡은 관리자): 내가 관리자로 속한 다른 회사의 쓰는 서식 목록 → '가져오기'
//   → 지금 회사에 복사(원래 서식은 그대로 · 새 공고 기본 체크 꺼짐) · 같은 이름이면 '(회사 이름에서)' · 글에 원래 회사 이름이 있으면 고치라는 안내
//   · 한 회사만 맡은 관리자에겐 안 보임 · 속하지 않은 회사 서식 · 지금 회사 서식 번호를 끼워 넣어도 안 됨 · 기록(audit) 남음
// · 서식 탭 설명은 한 줄 + '자세히' · '앱이 자동으로 만드는 서류'는 접어 둔 한 줄 '· 4가지'
// node scripts/qa/batch373.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000373', C3 = '99999999-0000-4000-8000-000000003733'
const TPL = 'ffffffff-0000-4000-8000-000000000007'
const M = 'aaaaaaaa-0000-4000-8000-000000037301', N = 'aaaaaaaa-0000-4000-8000-000000037302'
const T2a = 'eeeeeeee-0000-4000-8000-000000037301', T2b = 'eeeeeeee-0000-4000-8000-000000037302', T2c = 'eeeeeeee-0000-4000-8000-000000037303', T3 = 'eeeeeeee-0000-4000-8000-000000037304'
const CO2 = '가져올회사373', CO3 = '남의회사373'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: CO2, join_code: 'CP373', seal_image: null, created_at: nowIso })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: CO3, join_code: 'OT373', seal_image: null, created_at: nowIso })
  const tb = { is_default: true, active: true, created_at: nowIso, updated_at: nowIso }
  await rest('doc_templates', 'POST', { ...tb, id: T2a, company_id: C2, kind: 'pledge', title: '현장 서약서373', body: `# 현장 서약서\n\n${CO2}의 현장 규칙을 지킵니다. {{근로자명}}` })
  await rest('doc_templates', 'POST', { ...tb, id: T2b, company_id: C2, kind: 'contract', title: '근로계약서', body: '# 근로계약서\n\n{{회사명}} · {{근로자명}}' })
  await rest('doc_templates', 'POST', { ...tb, id: T2c, company_id: C2, kind: 'other', title: '안 쓰는 서식373', body: '# 안 씀', active: false })
  await rest('doc_templates', 'POST', { ...tb, id: T3, company_id: C3, kind: 'pledge', title: '남의 서약서373', body: '# 남의 서약서' })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자373', phone: '01037300001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자373', phone: '01037300002', is_super: false })
  for (const [company_id, user_id, role] of [[C1, M, 'admin'], [C2, M, 'owner'], [C1, N, 'admin']]) await rest('company_members', 'POST', { company_id, user_id, role, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const list = async (p) => { await p.goto(`${D}/admin/docs?tab=tpl`, { waitUntil: 'networkidle' }); await p.locator('main h1').first().waitFor({ timeout: 15000 }).catch(() => {}) }
  const c1Titles = async () => ((await rest(`doc_templates?company_id=eq.${C1}`)) ?? []).map((t) => t.title)

  // ── 1. 한 회사만 맡은 관리자: 가져오기 칸 없음
  const n = await pg(N)
  await list(n)
  ok('한 회사 관리자: 가져오기 칸 없음', (await n.locator('[data-tpl-import]').count()) === 0)

  // ── 2. 두 회사 관리자: 다른 회사 쓰는 서식 2개 (안 쓰는 서식 · 속하지 않은 회사 서식은 없음)
  const m = await pg(M)
  await list(m)
  const imp = m.locator('[data-tpl-import]')
  ok("'다른 회사 서식 가져오기 · 2개' (접힌 채)", one(await imp.locator('summary').innerText().catch(() => '')).startsWith('다른 회사 서식 가져오기 · 2개') && !(await imp.locator('details').evaluate((d) => d.open).catch(() => true)), one(await imp.locator('summary').innerText().catch(() => '')))
  await imp.locator('summary').click()
  await m.waitForTimeout(350)
  const rows = imp.locator('[data-tpl-src]')
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-tpl-src')))
  ok('목록: 그 회사의 쓰는 서식 2개만 (안 쓰는 서식·남의 회사 서식 없음)', ids.length === 2 && ids.includes(T2a) && ids.includes(T2b) && !ids.includes(T2c) && !ids.includes(T3), ids.join(','))
  ok(`줄: '${CO2} · 서약서' / '현장 서약서373'`, one(await imp.locator(`[data-tpl-src="${T2a}"] span span`).first().innerText().catch(() => '')) === `${CO2} · 서약서`)
  ok("같은 이름이 있으면 제목 옆 '같은 이름' · 회사 줄은 안 잘림", one(await imp.locator(`[data-tpl-src="${T2b}"] [data-tpl-same]`).innerText().catch(() => '')) === '같은 이름' && (await imp.locator(`[data-tpl-src="${T2b}"] span span`).first().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)) && (await imp.locator(`[data-tpl-src="${T2b}"] [data-tpl-same]`).count()) === 1 && (await imp.locator(`[data-tpl-src="${T2a}"] [data-tpl-same]`).count()) === 0)
  const ra = await rows.first().evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration]).catch(() => [])
  ok('줄은 0.25초 살짝 올라옴', JSON.stringify(ra) === '["rise","0.25s"]', JSON.stringify(ra))
  ok('한 줄씩 (360px · 옆으로 안 밀림)', (await rows.first().evaluate((el) => el.getBoundingClientRect().height < 64)) && (await noSide(m)))
  if (SHOTS) await imp.screenshot({ path: `${SHOTS}/tpl-import.png` }).catch(() => {})

  // ── 3. 가져오기: 글에 원래 회사 이름이 있으면 고치라는 안내
  await Promise.all([m.waitForURL((u) => /^\/admin\/docs\/[0-9a-f-]{36}$/.test(u.pathname) && !u.pathname.endsWith(T2a), { timeout: 15000 }).catch(() => {}), imp.locator(`[data-tpl-src="${T2a}"] button`).click()])
  await m.waitForLoadState('networkidle').catch(() => {})
  const newId = new URL(m.url()).pathname.split('/').pop()
  const flash = one(await m.locator('[data-flash], [role=status]').first().innerText().catch(() => ''))
  ok(`가져오면 새 서식 화면 · '${CO2}에서 가져왔어요 · 글에 '${CO2}' 이름이 그대로 있어요. 고쳐 주세요'`, newId !== T2a && flash.includes(`${CO2}에서 가져왔어요`) && flash.includes(`글에 '${CO2}' 이름이 그대로 있어요`), `${m.url()} | ${flash}`)
  const [made] = (await rest(`doc_templates?id=eq.${newId}`)) ?? []
  ok('지금 회사(첫 회사)에 생김 · 새 공고 기본 체크 꺼짐 · 내용 그대로', made?.company_id === C1 && made?.is_default === false && made?.active === true && made?.title === '현장 서약서373' && made?.body?.includes('현장 규칙'), JSON.stringify({ c: made?.company_id, d: made?.is_default, t: made?.title }))
  const [orig] = (await rest(`doc_templates?id=eq.${T2a}`)) ?? []
  ok('원래 서식은 그대로 (다른 회사에 남음)', orig?.company_id === C2 && orig?.is_default === true)

  // ── 4. 같은 이름: '(회사 이름에서)'
  await list(m)
  await imp.locator('summary').click()
  await Promise.all([m.waitForURL((u) => /^\/admin\/docs\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 15000 }).catch(() => {}), imp.locator(`[data-tpl-src="${T2b}"] button`).click()])
  await m.waitForLoadState('networkidle').catch(() => {})
  const f2 = one(await m.locator('[data-flash], [role=status]').first().innerText().catch(() => ''))
  ok(`같은 이름이면 '근로계약서 (${CO2}에서)' · '원래 서식은 그대로예요'`, (await c1Titles()).includes(`근로계약서 (${CO2}에서)`) && f2.includes('원래 서식은 그대로예요') && !f2.includes('고쳐 주세요'), f2)

  // ── 5. 끼워 넣기: 속하지 않은 회사 서식 · 지금 회사 서식 → 안 됨
  for (const [bad, label] of [[T3, '속하지 않은 회사 서식'], [TPL, '지금 회사 서식']]) {
    const before = (await c1Titles()).length
    await list(m)
    await imp.locator('summary').click()
    await imp.locator('input[name=id]').first().evaluate((el, v) => { el.value = v }, bad)
    await Promise.all([m.waitForURL((u) => u.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), imp.locator('button').first().click()])
    await m.waitForLoadState('networkidle').catch(() => {})
    const t = one(await m.locator('main').innerText().catch(() => ''))
    ok(`${label} 번호를 끼워 넣으면: '가져올 서식을 찾을 수 없어요.' · 안 생김`, t.includes('가져올 서식을 찾을 수 없어요') && (await c1Titles()).length === before && !(await c1Titles()).includes('남의 서약서373'), t.slice(0, 60))
  }

  // ── 6. 기록
  const logs = ((await rest('audit_logs?action=eq.template.copy')) ?? []).filter((l) => l.company_id === C1)
  ok('가져온 기록(audit) 2건 · 지금 회사로', logs.length === 2 && logs.every((l) => l.detail?.startsWith(`${CO2} → `)), String(logs.length))

  // ── 7. 서식 탭 설명 한 줄 + 자세히 · 자동 서류 접힘
  await list(m)
  const intro = m.locator('[data-tpl-intro]')
  ok("설명 한 줄 '공고마다 확정 인원에게 서명받을 서류를 골라요.' + 접힌 '자세히'", one(await intro.locator('> p').innerText().catch(() => '')) === '공고마다 확정 인원에게 서명받을 서류를 골라요.' && (await intro.locator('> p').evaluate((el) => el.getBoundingClientRect().height < 26)) && !(await intro.locator('details').evaluate((d) => d.open)))
  const auto = m.locator('[data-tpl-auto]')
  ok("'앱이 자동으로 만드는 서류 · 4가지' 접힌 한 줄", one(await auto.locator('summary').innerText().catch(() => '')) === '앱이 자동으로 만드는 서류 · 4가지' && !(await auto.locator('details').evaluate((d) => d.open)))
  await auto.locator('summary').click()
  await m.waitForTimeout(300)
  ok('펼치면 네 가지', (await auto.locator('li').count()) === 4 && (await auto.locator('li').first().isVisible()))
  ok('360px 옆으로 안 밀림 (서식 탭)', await noSide(m))
  if (SHOTS) { await auto.locator('summary').click(); await m.waitForTimeout(300); await m.screenshot({ path: `${SHOTS}/tpl-tab.png` }).catch(() => {}) }

  // 움직임 줄이기
  const r = await pg(M, { reducedMotion: 'reduce' })
  await list(r)
  await r.locator('[data-tpl-import] summary').click()
  const rd = await r.locator('[data-tpl-src]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok('움직임 줄이기: 바로', rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
