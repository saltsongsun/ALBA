// 묶음 375 (정기 개선 2026-11-24 13:35 KST)
// · 새 공고 화면 '내 다른 회사 공고로 시작 · n개' (여러 회사를 맡은 관리자): 내가 대표·관리자로 있는 다른 회사의 최근 공고(취소 빼고 6개)
//   → '가져오기' → 지금 회사에 임시 저장으로 복사 → 고치기 화면('일정 · 인원' 펼침) · 받을 서류는 이 회사의 같은 이름 서식으로(없으면 빼고 안내)
//   · 원래 공고는 그대로 · 화면 회사는 그대로 · 기록(job.import_company)은 지금 회사에
//   · 한 회사만 맡은 관리자 · 최고 관리자 권한으로만 보이는 회사 공고는 안 보임 · 속하지 않은 회사·지금 회사 공고 번호를 끼워 넣어도 안 됨
// · 한 줄을 가져오는 동안 나머지 줄은 흐리게(0.4) · 누를 수 없게 (겹으로 생기지 않게) · 줄은 0.25초 살짝 올라오며 (움직임 줄이기면 바로)
// node scripts/qa/batch375.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000375', C3 = '99999999-0000-4000-8000-000000003753'
const TPL = 'ffffffff-0000-4000-8000-000000000007' // C1 '근로계약서'
const T2 = 'eeeeeeee-0000-4000-8000-000000037501' // C2 '근로계약서'
const T2x = 'eeeeeeee-0000-4000-8000-000000037502' // C2 '현장 서약서375' (C1엔 없음)
const JA = 'cccccccc-0000-4000-8000-000000037501', JE = 'cccccccc-0000-4000-8000-000000037502', JB = 'cccccccc-0000-4000-8000-000000037503', JC = 'cccccccc-0000-4000-8000-000000037504'
const M = 'aaaaaaaa-0000-4000-8000-000000037501', N1 = 'aaaaaaaa-0000-4000-8000-000000037502'
const CO2 = '가져올회사375', CO3 = '남의회사375'
const TA = '봄 축제 안내375', TE = '여름 행사 스태프375'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
const wd = (s) => '일월화수목금토'[new Date(`${s}T00:00:00Z`).getUTCDay()]
const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}(${wd(s)})`

;(async () => {
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, ...jrow } = j
  await rest('companies', 'POST', { ...c1, id: C2, company_name: CO2, join_code: 'IM375', seal_image: null, workplace_5plus: !!jrow.premium_enabled, created_at: nowIso })
  await rest('companies', 'POST', { ...c1, id: C3, company_name: CO3, join_code: 'OT375', seal_image: null, created_at: nowIso })
  const tb = { is_default: false, active: true, created_at: nowIso, updated_at: nowIso }
  await rest('doc_templates', 'POST', { ...tb, id: T2, company_id: C2, kind: 'contract', title: '근로계약서', body: '# 근로계약서' })
  await rest('doc_templates', 'POST', { ...tb, id: T2x, company_id: C2, kind: 'pledge', title: '현장 서약서375', body: '# 서약서' })
  const later = (ms) => new Date(Date.now() + ms).toISOString()
  // 가산수당은 받는 회사(C1) 기본과 같게 → 그 안내는 없어야 함 (다르면 안내 · 묶음 374가 봄)
  await rest('jobs', 'POST', { ...jrow, id: JA, company_id: C2, title: TA, status: 'open', start_date: kday(5), end_date: kday(5), required_docs: [T2, T2x], premium_enabled: !!c1.workplace_5plus, created_at: later(3000) })
  await rest('jobs', 'POST', { ...jrow, id: JE, company_id: C2, title: TE, status: 'closed', start_date: kday(9), end_date: kday(9), required_docs: [], created_at: later(2000) })
  await rest('jobs', 'POST', { ...jrow, id: JB, company_id: C2, title: '취소된 공고375', status: 'cancelled', required_docs: [], created_at: later(4000) })
  await rest('jobs', 'POST', { ...jrow, id: JC, company_id: C3, title: '남의 공고375', status: 'open', required_docs: [], created_at: later(5000) })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자375', phone: '01037500001', is_super: false })
  await rest('users', 'POST', { ...a, id: N1, name: '한회사관리자375', phone: '01037500002', is_super: false })
  for (const [company_id, user_id, role] of [[C1, M, 'admin'], [C2, M, 'owner'], [C1, N1, 'admin']]) await rest('company_members', 'POST', { company_id, user_id, role, created_at: nowIso })

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
  const openNew = async (p) => {
    await p.goto(`${D}/admin/jobs/new`, { waitUntil: 'networkidle' })
    await p.locator('main h1').first().waitFor({ timeout: 15000 }).catch(() => {})
  }
  const unfold = async (p) => {
    await p.locator('[data-import-jobs] summary').click()
    await p.waitForTimeout(400)
  }
  const copiesIn = async (cid, title) => ((await rest(`jobs?company_id=eq.${cid}`)) ?? []).filter((x) => x.title === `${title} (복사)`)
  const onEdit = (u) => /^\/admin\/jobs\/[0-9a-f-]{36}\/edit$/.test(u.pathname)

  // ── 1. 한 회사만 맡은 관리자: 칸 없음
  const n = await pg(N1)
  await openNew(n)
  ok('한 회사 관리자: 다른 회사 공고 칸 없음', (await n.locator('[data-import-jobs]').count()) === 0)

  // ── 2. 두 회사 관리자: 접힌 칸 '· 2개' → 펼치면 그 회사 공고 2개만 (취소·남의 회사·지금 회사 공고 없음)
  const m = await pg(M)
  await openNew(m)
  const box = m.locator('[data-import-jobs]')
  const sum = one(await box.locator('summary').innerText().catch(() => ''))
  ok("'내 다른 회사 공고로 시작 · 2개' (접힌 채 · 요약 한 줄)", sum.startsWith('내 다른 회사 공고로 시작 · 2개') && sum.includes('내용을 가져와 날짜만 바꿔요') && !(await box.locator('details').evaluate((d) => d.open)), sum)
  ok('칸은 공고 양식보다 위 (이 회사 공고로 올라가요 줄 아래)', await box.evaluate((el) => !!(el.compareDocumentPosition(document.querySelector('form [name=title]')) & Node.DOCUMENT_POSITION_FOLLOWING)))
  await unfold(m)
  const rows = box.locator('[data-import-job]')
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-import-job')))
  ok('목록: 최근 순 2개 (봄 축제 → 여름 행사) · 취소·남의 회사·지금 회사 공고 없음', JSON.stringify(ids) === JSON.stringify([JA, JE]), JSON.stringify(ids))
  const r0 = one(await rows.first().innerText())
  ok(`줄: '${CO2} · ${md(kday(5))}' / '${TA}' / '가져오기'`, r0 === `${CO2} · ${md(kday(5))} ${TA} 가져오기`, r0)
  ok('줄은 한 줄씩 (60px 안) · 360px 옆으로 안 밀림', (await rows.evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height < 60))) && (await noSide(m)))
  const ra = await rows.first().evaluate((el) => [getComputedStyle(el).animationName, getComputedStyle(el).animationDuration])
  ok('줄은 0.25초 살짝 올라옴', JSON.stringify(ra) === '["rise","0.25s"]', JSON.stringify(ra))
  ok("안내 한 줄 '원래 공고는 그대로예요 · 지원자·출퇴근은 안 가져와요'", (await box.getByText('원래 공고는 그대로예요 · 지원자·출퇴근은 안 가져와요').count()) === 1)
  if (SHOTS) await box.screenshot({ path: `${SHOTS}/import-fold.png` }).catch(() => {})

  // ── 3. 끼워 넣기: 남의 회사 · 지금 회사 공고 번호 · 엉터리 → 막힘 (화면 위 안내)
  for (const [jid, label, title] of [[JC, '속하지 않은 회사 공고', '남의 공고375'], [J, '지금 회사 공고', jrow.title], ['nope', '엉터리 번호', '']]) {
    await openNew(m)
    await unfold(m)
    await m.locator(`[data-import-job="${JA}"] input[name=job]`).evaluate((el, v) => { el.value = v }, jid)
    await Promise.all([m.waitForURL((u) => u.pathname === '/admin/jobs/new' && u.searchParams.has('m'), { timeout: 15000 }).catch(() => {}), m.locator(`[data-import-job="${JA}"] button`).click()])
    await m.waitForLoadState('networkidle').catch(() => {})
    const f = one(await m.locator('[role=status]').first().innerText().catch(() => ''))
    ok(`${label}: '가져올 공고를 찾을 수 없어요.' (화면 위 안내) · 안 생김`, f.includes('가져올 공고를 찾을 수 없어요.') && (!title || (await copiesIn(C1, title)).length === 0), f)
  }

  // ── 4. 가져오는 동안: 나머지 줄 흐리게 · 누를 수 없게 / 보낸 줄은 '가져오는 중…'
  await openNew(m)
  await unfold(m)
  let release
  const held = new Promise((r) => { release = r })
  await m.route(`${D}/admin/jobs/new`, async (route) => { if (route.request().method() === 'POST') await held; await route.continue() })
  const nav = m.waitForURL(onEdit, { timeout: 20000 }).catch(() => {})
  await m.locator(`[data-import-job="${JA}"] button`).click()
  await m.waitForTimeout(450)
  const other = m.locator(`[data-import-job="${JE}"]`)
  const st = await other.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).pointerEvents])
  const mineRow = m.locator(`[data-import-job="${JA}"]`)
  ok('가져오는 동안 다른 줄: 흐리게(0.4) · 누를 수 없음', st[0] === '0.4' && st[1] === 'none', JSON.stringify(st))
  ok("보낸 줄은 진하게 · '가져오는 중…'", (await mineRow.evaluate((el) => getComputedStyle(el).opacity)) === '1' && one(await mineRow.locator('button').innerText()).includes('가져오는 중…'))
  if (SHOTS) await m.locator('[data-import-jobs]').screenshot({ path: `${SHOTS}/import-busy.png` }).catch(() => {})
  release()
  await nav
  await m.unroute(`${D}/admin/jobs/new`)
  await m.waitForLoadState('networkidle').catch(() => {})

  // ── 5. 가져온 결과
  const got = await copiesIn(C1, TA)
  const cp = got[0]
  ok('지금 회사(C1)에 임시 저장 하나 · 만든 사람 나 · 하나만 (겹으로 안 생김)', got.length === 1 && cp.status === 'draft' && cp.created_by === M && cp.company_id === C1, JSON.stringify(got.map((x) => [x.company_id, x.status])))
  ok('받을 서류: 같은 이름 서식으로 (근로계약서 → 이 회사 것) · 없는 서식은 빠짐', JSON.stringify(cp?.required_docs) === JSON.stringify([TPL]), JSON.stringify(cp?.required_docs))
  ok('날짜는 그대로 (고치기에서 바꿈)', cp?.start_date === kday(5))
  const [orig] = await rest(`jobs?id=eq.${JA}`)
  ok('원래 공고는 그대로 (회사 · 상태 · 서류)', orig.company_id === C2 && orig.status === 'open' && JSON.stringify(orig.required_docs) === JSON.stringify([T2, T2x]))
  ok('고치기 화면으로 · 일정 칸 펼침', new URL(m.url()).pathname === `/admin/jobs/${cp?.id}/edit` && (await m.locator('details#schedule').evaluate((d) => d.open).catch(() => false)), m.url())
  const f = one(await m.locator('[role=status]').first().innerText().catch(() => ''))
  ok(`안내: '${CO2}에서 가져왔어요 · 날짜를 바꾸고 공개로 저장하세요 · 이 회사에 없는 서류는 뺐어요: 현장 서약서375' (가산수당 같으면 그 말 없음)`, f.includes(`${CO2}에서 가져왔어요 · 날짜를 바꾸고 공개로 저장하세요`) && f.includes('이 회사에 없는 서류는 뺐어요: 현장 서약서375') && !f.includes('가산수당'), f)
  ok('화면 회사는 그대로 (지금 회사)', (await m.locator('select[aria-label="회사 고르기"]').inputValue().catch(() => '')) === C1)
  const logs = ((await rest('audit_logs')) ?? []).filter((l) => l.action === 'job.import_company' && l.actor_id === M)
  ok('기록: job.import_company · 지금 회사 · 사람 칸 비움', logs.length === 1 && logs[0].company_id === C1 && logs[0].target_user_id == null && logs[0].detail.includes(`${CO2} →`), JSON.stringify(logs.map((l) => [l.company_id, l.detail])))
  ok('360px 옆으로 안 밀림 (고치기)', await noSide(m))

  // ── 6. 최고 관리자: 속하지 않은 회사 공고는 목록에 없음
  const s = await pg(A)
  await openNew(s)
  const sids = await s.locator('[data-import-job]').evaluateAll((els) => els.map((e) => e.getAttribute('data-import-job')))
  ok('최고 관리자 권한으로만 보이는 회사 공고는 안 보임', !sids.includes(JA) && !sids.includes(JE) && !sids.includes(JC), JSON.stringify(sids))

  // ── 7. 움직임 줄이기
  const r = await pg(M, { reducedMotion: 'reduce' })
  await openNew(r)
  await unfold(r)
  const rd = await r.locator('[data-import-job]').first().evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
  ok("'움직임 줄이기'면 바로", rd < 0.05, String(rd))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
