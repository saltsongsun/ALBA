// 묶음 374 (정기 개선 2026-11-24 11:35 KST)
// · 공고 화면 '더보기' → '{회사}로 복사' (여러 회사를 맡은 관리자): 이 공고 내용을 내가 맡은 다른 회사에 임시 저장으로 복사
//   → 그 회사 화면으로 바꿔서 바로 고치기 · 받을 서류는 그 회사의 같은 이름 서식으로 (없으면 빼고 무엇을 뺐는지 안내)
//   · 가산수당 설정이 그 회사 기본과 다르면 안내 · 원래 공고는 그대로 · 기록(audit)은 받은 회사에
//   · 한 회사만 맡은 관리자에겐 없음 · 회사가 셋 이상이면 고르기 + '복사' · 속하지 않은 회사·지금 회사 번호를 끼워 넣어도 안 됨
// · 복사(같은 회사 '복사해서 새 공고' 포함)로 연 고치기 화면: '일정 · 인원' 칸이 펼쳐지고 테두리 한 번 (0.3초) · 기본 정보는 한 줄 요약
//   · '움직임 줄이기'면 테두리 움직임 없음
// node scripts/qa/batch374.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000374', C3 = '99999999-0000-4000-8000-000000003743', C4 = '99999999-0000-4000-8000-000000003744'
const TPL = 'ffffffff-0000-4000-8000-000000000007' // C1 '근로계약서'
const TX = 'eeeeeeee-0000-4000-8000-000000037401' // C1 '현장 서약서374' (C2엔 없음)
const T2 = 'eeeeeeee-0000-4000-8000-000000037402' // C2 '근로계약서'
const T2off = 'eeeeeeee-0000-4000-8000-000000037403' // C2 '현장 서약서374' (안 씀 → 고르지 않음)
const J374 = 'cccccccc-0000-4000-8000-000000037401'
const M2 = 'aaaaaaaa-0000-4000-8000-000000037401', M3 = 'aaaaaaaa-0000-4000-8000-000000037402', N1 = 'aaaaaaaa-0000-4000-8000-000000037403'
const CO2 = '받는회사374', CO3 = '세번째회사374', CO4 = '남의회사374'
const TITLE = '가을 축제 안내374'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const anim = (loc) => loc.evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration]).catch(() => [])

;(async () => {
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, ...jrow } = j
  const premium = !!jrow.premium_enabled
  await rest('companies', 'POST', { ...c1, id: C2, company_name: CO2, join_code: 'CP374', seal_image: null, workplace_5plus: !premium, created_at: nowIso })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: CO3, join_code: 'TH374', seal_image: null, workplace_5plus: premium, created_at: nowIso })
  await rest('companies', 'POST', { ...c1, id: C4, company_name: CO4, join_code: 'OT374', seal_image: null, created_at: nowIso })
  const tb = { is_default: false, active: true, created_at: nowIso, updated_at: nowIso }
  await rest('doc_templates', 'POST', { ...tb, id: TX, company_id: C1, kind: 'pledge', title: '현장 서약서374', body: '# 현장 서약서' })
  await rest('doc_templates', 'POST', { ...tb, id: T2, company_id: C2, kind: 'contract', title: '근로계약서', body: '# 근로계약서' })
  await rest('doc_templates', 'POST', { ...tb, id: T2off, company_id: C2, kind: 'pledge', title: '현장 서약서374', body: '# 안 씀', active: false })
  await rest('jobs', 'POST', { ...jrow, id: J374, company_id: C1, title: TITLE, status: 'open', required_docs: [TPL, TX], created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M2, name: '두회사관리자374', phone: '01037400001', is_super: false })
  await rest('users', 'POST', { ...a, id: M3, name: '세회사관리자374', phone: '01037400002', is_super: false })
  await rest('users', 'POST', { ...a, id: N1, name: '한회사관리자374', phone: '01037400003', is_super: false })
  for (const [company_id, user_id, role] of [[C1, M2, 'admin'], [C2, M2, 'owner'], [C1, M3, 'owner'], [C2, M3, 'admin'], [C3, M3, 'admin'], [C1, N1, 'admin']]) await rest('company_members', 'POST', { company_id, user_id, role, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const openMore = async (p, id = J374) => {
    await p.context().addCookies([{ name: 'hw_company', value: C1, url: D }])
    await p.goto(`${D}/admin/jobs/${id}`, { waitUntil: 'networkidle' })
    await p.locator('[data-more-toggle]').click()
    await p.locator('[data-more-panel]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
    await p.waitForTimeout(300)
  }
  const jobsIn = async (cid) => ((await rest(`jobs?company_id=eq.${cid}`)) ?? []).filter((x) => x.title === `${TITLE} (복사)`)
  const onEdit = (u) => /^\/admin\/jobs\/[0-9a-f-]{36}\/edit$/.test(u.pathname) && !u.pathname.includes(J374)

  // ── 1. 한 회사만 맡은 관리자: 다른 회사로 복사 줄 없음 (같은 회사 복사는 그대로)
  const n = await pg(N1)
  await openMore(n)
  ok('한 회사 관리자: 다른 회사로 복사 줄 없음 · 복사해서 새 공고는 있음', (await n.locator('[data-copy-to]').count()) === 0 && (await n.getByRole('button', { name: '복사해서 새 공고' }).isVisible()))

  // ── 2. 같은 회사 '복사해서 새 공고' → 고치기 화면에서 '일정 · 인원'이 펼쳐지고 테두리 한 번
  await Promise.all([n.waitForURL(onEdit, { timeout: 15000 }).catch(() => {}), n.getByRole('button', { name: '복사해서 새 공고' }).click()])
  await n.waitForLoadState('networkidle').catch(() => {})
  const sch = n.locator('details#schedule')
  ok("같은 회사 복사: '?open=schedule'로 열림", new URL(n.url()).searchParams.get('open') === 'schedule', n.url())
  ok("'일정 · 인원' 칸 펼침 + 테두리 한 번 (flash-ring 0.3초)", (await sch.evaluate((d) => d.open).catch(() => false)) && JSON.stringify(await anim(sch)) === '["flash-ring","0.3s"]', JSON.stringify(await anim(sch)))
  const basic = n.locator('details.fold-card').first()
  ok('기본 정보는 한 줄 요약으로 접힘 (제목이 요약에)', !(await basic.evaluate((d) => d.open)) && one(await basic.locator('summary').innerText()).includes(`${TITLE} (복사)`), one(await basic.locator('summary').innerText().catch(() => '')))
  ok("'일정 · 인원' 칸이 첫 화면 안에서 보임", await sch.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 120 }), String(await sch.evaluate((el) => Math.round(el.getBoundingClientRect().top)).catch(() => '')))
  ok('같은 회사 복사본은 C1에 그대로', (await jobsIn(C1)).length === 1)
  // 그냥 고치기로 들어오면 예전처럼 (기본 정보 펼침 · 일정 접힘 · 테두리 없음)
  await n.goto(`${D}/admin/jobs/${J374}/edit`, { waitUntil: 'networkidle' })
  ok("그냥 '수정'으로 열면 예전 그대로 (기본 정보 펼침 · 일정 접힘 · 테두리 없음)", (await n.locator('details.fold-card').first().evaluate((d) => d.open)) && !(await n.locator('details#schedule').evaluate((d) => d.open)) && (await n.locator('details#schedule[data-ring-once]').count()) === 0)

  // ── 3. 두 회사 관리자: '받는회사374로 복사' 한 줄
  const m = await pg(M2)
  await openMore(m)
  const row = m.locator('[data-copy-to]')
  ok(`더보기에 '${CO2}로 복사' 한 줄`, (await row.count()) === 1 && one(await row.innerText()) === `${CO2}로 복사` && (await row.evaluate((el) => el.getBoundingClientRect().height < 52)), one(await row.innerText().catch(() => '')))
  ok('보내는 회사는 내가 관리자로 속한 다른 회사 하나 (지금 회사 아님)', (await row.locator('input[name=company]').inputValue()) === C2)
  ok('360px 옆으로 안 밀림 (더보기)', await noSide(m))
  if (SHOTS) await m.locator('[data-more-panel]').screenshot({ path: `${SHOTS}/more-copy-to.png` }).catch(() => {})

  // ── 4. 끼워 넣기: 속하지 않은 회사 · 지금 회사 번호로 바꿔 보내면 막힘
  for (const [cid, label] of [[C4, '속하지 않은 회사'], [C1, '지금 회사']]) {
    await openMore(m)
    await m.locator('[data-copy-to] input[name=company]').evaluate((el, v) => { el.value = v }, cid)
    await Promise.all([m.waitForURL((u) => u.pathname === `/admin/jobs/${J374}` && u.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), m.locator('[data-copy-to] button').click()])
    await m.waitForLoadState('networkidle').catch(() => {})
    ok(`${label} 번호를 끼워 넣으면: '복사할 수 없는 회사예요.' · 안 생김`, new URL(m.url()).searchParams.get('m') === '복사할 수 없는 회사예요.' && (await jobsIn(cid)).filter((x) => x.created_by === M2).length === 0, m.url())
  }

  // ── 5. 진짜 복사
  await openMore(m)
  await Promise.all([m.waitForURL(onEdit, { timeout: 15000 }).catch(() => {}), m.locator('[data-copy-to] button').click()])
  await m.waitForLoadState('networkidle').catch(() => {})
  const copies = await jobsIn(C2)
  const cp = copies[0]
  ok(`${CO2}에 임시 저장으로 하나 · 제목 '(복사)' · 만든 사람 나`, copies.length === 1 && cp.status === 'draft' && cp.created_by === M2 && cp.company_id === C2, JSON.stringify(copies.map((x) => [x.status, x.created_by])))
  ok('받을 서류: 같은 이름 서식으로 바뀜 (근로계약서 → 그 회사 것) · 없는 서식은 빠짐 (안 쓰는 같은 이름 서식도 안 씀)', JSON.stringify(cp?.required_docs) === JSON.stringify([T2]), JSON.stringify(cp?.required_docs))
  ok('날짜 · 시간 · 시급은 그대로', cp?.start_date === jrow.start_date && cp?.end_date === jrow.end_date && cp?.start_time === jrow.start_time && cp?.hourly_wage === jrow.hourly_wage && cp?.premium_enabled === jrow.premium_enabled)
  const [orig] = await rest(`jobs?id=eq.${J374}`)
  ok('원래 공고는 그대로 (회사 · 상태 · 서류)', orig.company_id === C1 && orig.status === 'open' && JSON.stringify(orig.required_docs) === JSON.stringify([TPL, TX]))
  ok('고치기 화면이 새 공고로', new URL(m.url()).pathname === `/admin/jobs/${cp?.id}/edit` && new URL(m.url()).searchParams.get('open') === 'schedule', m.url())
  const hw = (await m.context().cookies(D)).find((c) => c.name === 'hw_company')?.value
  ok(`화면 회사가 ${CO2}로 바뀜`, hw === C2, hw)
  const flash = one(await m.locator('[role=status]').first().innerText().catch(() => ''))
  ok(`안내: '${CO2}로 복사했어요 · 날짜를 바꾸고 공개로 저장하세요' · 뺀 서류 · 가산수당`, flash.includes(`${CO2}로 복사했어요 · 날짜를 바꾸고 공개로 저장하세요`) && flash.includes('이 회사에 없는 서류는 뺐어요: 현장 서약서374') && flash.includes('가산수당 설정이 이 회사 기본과 달라요'), flash)
  ok('고치기 화면 제목칸이 복사본 제목', (await m.locator('input[name=title]').inputValue()) === `${TITLE} (복사)`)
  ok("'일정 · 인원' 펼침 + 테두리 한 번", (await m.locator('details#schedule').evaluate((d) => d.open)) && JSON.stringify(await anim(m.locator('details#schedule'))) === '["flash-ring","0.3s"]')
  const docsBoxes = await m.locator('input[name=required_docs]:checked').evaluateAll((els) => els.map((e) => e.value)).catch(() => [])
  ok('고치기 화면 받을 서류 체크도 그 회사 서식', docsBoxes.length === 0 || (docsBoxes.length === 1 && docsBoxes[0] === T2), JSON.stringify(docsBoxes))
  const logs = ((await rest('audit_logs')) ?? []).filter((l) => l.action === 'job.copy_company' && l.actor_id === M2)
  ok('기록: job.copy_company · 받은 회사 · 사람 칸은 비움', logs.length === 1 && logs[0].company_id === C2 && logs[0].target_user_id == null && logs[0].detail.includes(`→ ${CO2}`), JSON.stringify(logs.map((l) => [l.company_id, l.detail])))
  ok('360px 옆으로 안 밀림 (고치기)', await noSide(m))
  if (SHOTS) await m.screenshot({ path: `${SHOTS}/edit-after-copy.png` }).catch(() => {})

  // ── 6. 세 회사 관리자: 고르기 (지금 회사 빼고 둘) + '복사' → 고른 회사로 · 가산수당이 같으면 그 안내 없음
  const t = await pg(M3)
  await openMore(t)
  const sel = t.locator('[data-copy-to] select[name=company]')
  const opts = await sel.locator('option').evaluateAll((els) => els.map((e) => [e.value, e.textContent.trim()]))
  ok('고르기: 지금 회사 빼고 내가 맡은 두 회사', opts.length === 2 && opts.some(([v]) => v === C2) && opts.some(([v]) => v === C3) && !opts.some(([v]) => v === C1 || v === C4), JSON.stringify(opts))
  ok('고르기 줄: 한 줄 · 버튼 안 꺾임', (await t.locator('[data-copy-to]').evaluate((el) => el.getBoundingClientRect().height < 60)) && (await t.locator('[data-copy-to] button').evaluate((el) => el.getBoundingClientRect().height < 44)) && (await noSide(t)))
  if (SHOTS) await t.locator('[data-more-panel]').screenshot({ path: `${SHOTS}/more-copy-select.png` }).catch(() => {})
  await sel.selectOption(C3)
  await Promise.all([t.waitForURL(onEdit, { timeout: 15000 }).catch(() => {}), t.locator('[data-copy-to] button').click()])
  await t.waitForLoadState('networkidle').catch(() => {})
  const c3 = await jobsIn(C3)
  const f3 = one(await t.locator('[role=status]').first().innerText().catch(() => ''))
  ok(`${CO3}에 복사 · 그 회사엔 서식이 없어 서류 둘 다 빠짐 · 가산수당 안내 없음`, c3.length === 1 && JSON.stringify(c3[0].required_docs) === '[]' && f3.includes(`${CO3}로 복사했어요`) && f3.includes('현장 서약서374') && !f3.includes('가산수당'), f3)

  // ── 7. 최고 관리자: 속하지 않은 회사는 고를 수 없음
  const s = await pg(A)
  await openMore(s)
  const sv = await s.locator('[data-copy-to] input[name=company], [data-copy-to] option').evaluateAll((els) => els.map((e) => e.value)).catch(() => [])
  ok('최고 관리자 권한으로만 보이는 회사(받는회사374 · 남의회사374)는 복사 대상 아님', !sv.includes(C2) && !sv.includes(C4) && !sv.includes(C3), JSON.stringify(sv))

  // ── 8. 움직임 줄이기
  const r = await pg(N1, { reducedMotion: 'reduce' })
  await openMore(r)
  await Promise.all([r.waitForURL(onEdit, { timeout: 15000 }).catch(() => {}), r.getByRole('button', { name: '복사해서 새 공고' }).click()])
  await r.waitForLoadState('networkidle').catch(() => {})
  const ra = await anim(r.locator('details#schedule'))
  ok("'움직임 줄이기'면 테두리 움직임 없음 (칸은 펼침)", (ra[0] === 'none' || parseFloat(ra[1]) < 0.05) && (await r.locator('details#schedule').evaluate((d) => d.open)), JSON.stringify(ra))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
