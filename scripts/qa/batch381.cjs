// 묶음 381 (정기 개선 2026-11-25 00:36 KST)
// ① 저녁 6시 작업이 모집 중인 공고의 확정자에게 서류를 저절로 보내면 → 그 회사 관리자에게만 알림 + 기록(doc.issue_auto, 그 공고 회사로)
//    · 같은 날 두 번 돌아도 새로 보낸 사람이 없으면 기록·알림 없음 · 다른 회사 공고는 그 회사 기록으로 (회사별)
// ② 서류가 언제 오는지 날짜로: 관리자 서류 탭 '늦어도 11/26(목) 저녁 6시엔 가요' (내일이면 '내일', 오늘이면 '오늘')
//    근무자 공고 화면 '늦어도 … 저녁 6시에 알림으로 와요' · 확정 알림 '늦어도 11/26(목) 저녁 6시에는 와요.' (알림 글은 늘 날짜로)
// ③ 확정하면 떠 있는 안내의 합계가 앞 금액에서 새 금액으로 굴러감 (300ms · '움직임 줄이기'면 바로 새 금액)
// node scripts/qa/batch381.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-000000038102'
const TPL = 'ffffffff-0000-4000-8000-000000000007'
const TPL2 = 'ffffffff-0000-4000-8000-000000038102'
// JA: 내일 근무(모집 중) · JB: 다른 회사 내일 근무 · JC: 모레 근무 · JD: 사흘 뒤 근무 (확정 금액 굴러가기)
const JA = 'cccccccc-0000-4000-8000-000000038101', JB = 'cccccccc-0000-4000-8000-000000038102', JC = 'cccccccc-0000-4000-8000-000000038103', JD = 'cccccccc-0000-4000-8000-000000038104'
const U = (n) => `bbbbbbbb-0000-4000-8000-0000003810${String(n).padStart(2, '0')}`
const AP = (n) => `dddddddd-0000-4000-8000-0000003810${String(n).padStart(2, '0')}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
const fd = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}/${dd}(${'일월화수목금토'[new Date(d + 'T00:00:00Z').getUTCDay()]})` }
const won = (n) => `${n.toLocaleString('ko-KR')}원`
const DAY = 82560 // 09:00~18:00 · 시급 10,320원 · 휴게 60분 → 8시간
// 한국 시각 저녁 6시가 지나면 내일 근무는 이미 '보낼 때'(서류가 바로 감) → 그때는 '오늘 저녁 6시' 줄을 보지 않음
const evening = new Date(Date.now() + 9 * 3600e3).getUTCHours() >= 18

;(async () => {
  const nowIso = new Date().toISOString()
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, ...jrow } = j
  const base = { ...jrow, company_id: C1, status: 'open', required_docs: [TPL], contract_method: 'app', headcount: 10, start_time: '09:00:00', end_time: '18:00:00', pay_type: 'hourly', hourly_wage: 10320, break_mode: 'auto', premium_enabled: false, allowance: 0, early_clamp: false, lat: null, lng: null, gps_required: false, created_at: nowIso, audience: 'worker' }
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '다른회사381', business_no: '381-81-38102' })
  await rest('doc_templates', 'POST', { id: TPL2, company_id: C2, kind: 'contract', title: '근로계약서', body: '# 계약서\n\n{{근로자명}}', is_default: true, active: true, created_at: nowIso, updated_at: nowIso })
  await rest('jobs', 'POST', { ...base, id: JA, title: '내일 행사381', start_date: kday(1), end_date: kday(1) })
  await rest('jobs', 'POST', { ...base, id: JB, company_id: C2, required_docs: [TPL2], title: '다른회사 내일381', start_date: kday(1), end_date: kday(1) })
  await rest('jobs', 'POST', { ...base, id: JC, title: '모레 행사381', start_date: kday(2), end_date: kday(2) })
  await rest('jobs', 'POST', { ...base, id: JD, title: '사흘 뒤 행사381', start_date: kday(3), end_date: kday(3) })
  const [w] = await rest(`users?id=eq.${W}`)
  const usr = {}
  for (let n = 1; n <= 8; n++) {
    usr[n] = { ...w, id: U(n), name: `근무자${n}381`, phone: `010381000${String(n).padStart(2, '0')}`, photo_at: nowIso }
    await rest('users', 'POST', usr[n])
  }
  const app = (n, job, status, cid = C1) => rest('applications', 'POST', { id: AP(n), company_id: cid, job_id: job, user_id: U(n), user: usr[n], status, available_dates: null, message: null, decided_at: status === 'approved' ? nowIso : null, held_at: null, position: null, created_at: nowIso })
  await app(1, JA, 'approved')
  await app(2, JA, 'approved')
  await app(3, JB, 'approved', C2)
  await app(4, JC, 'approved')
  await app(5, JD, 'approved')
  await app(6, JD, 'applied')
  await app(7, JD, 'applied')
  const docsOf = async (job) => ((await rest(`signed_docs?job_id=eq.${job}`)) ?? []).filter((d) => d.status !== 'void')
  const msgsOf = async (uid) => ((await rest(`messages?thread_user_id=eq.${uid}`)) ?? []).map((m) => m.body)
  const autoLogs = async () => ((await rest('audit_logs?action=eq.doc.issue_auto')) ?? [])

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'hw_company', value: C1, url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' })
    await p.locator('main').first().waitFor({ timeout: 15000 }).catch(() => {})
  }

  // ── 1. 관리자 서류 탭: 언제 저절로 가는지 날짜로
  const a = await pg(A)
  await open(a, `/admin/jobs/${JC}?tab=docs`)
  const atC = a.locator('[data-docs-waiting] [data-docs-auto-at]')
  // 정기 개선 2026-11-25 02:35: 한 줄로 '늦어도 … 엔 가요'
  ok("모레 근무: '늦어도 내일 저녁 6시엔 가요'", one(await atC.innerText().catch(() => '')) === '늦어도 내일 저녁 6시엔 가요', one(await atC.innerText().catch(() => '')))
  ok('그 줄은 한 줄 · 360px 옆으로 안 밀림', (await atC.evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)) && (await noSide(a)))
  if (SHOTS) await a.locator('[data-docs-waiting]').screenshot({ path: `${SHOTS}/docs-auto-at.png` }).catch(() => {})
  await open(a, `/admin/jobs/${JD}?tab=docs`)
  const atD = a.locator('[data-docs-waiting] [data-docs-auto-at]')
  ok(`사흘 뒤 근무: '늦어도 ${fd(kday(2))} 저녁 6시엔 가요' (날짜가 들어가도 한 줄)`, one(await atD.innerText().catch(() => '')) === `늦어도 ${fd(kday(2))} 저녁 6시엔 가요` && (await atD.evaluate((el) => el.getBoundingClientRect().height < 22).catch(() => false)), one(await atD.innerText().catch(() => '')))
  if (!evening) {
    await open(a, `/admin/jobs/${JA}?tab=docs`)
    ok("내일 근무(저녁 6시 전): '늦어도 오늘 저녁 6시엔 가요'", one(await a.locator('[data-docs-waiting] [data-docs-auto-at]').innerText().catch(() => '')) === '늦어도 오늘 저녁 6시엔 가요')
  } else ok('(저녁 6시 뒤 · 내일 근무는 이미 보낼 때라 건너뜀)', true)

  // ── 2. 근무자 공고 화면: 늦어도 언제
  const w4 = await pg(U(4))
  await open(w4, `/jobs/${JC}`)
  const later = w4.locator('[data-docs-later]')
  const lt = one(await later.innerText().catch(() => ''))
  ok("근무자: '서명할 서류는 모집이 끝나면 보내 드려요 / 늦어도 내일 저녁 6시에 알림으로 와요'", lt === '서명할 서류는 모집이 끝나면 보내 드려요 늦어도 내일 저녁 6시에 알림으로 와요', lt)
  ok('작은 줄은 한 줄 (360px) · 옆으로 안 밀림', (await later.locator('[data-docs-auto-at]').evaluate((el) => el.getBoundingClientRect().height < 20).catch(() => false)) && (await noSide(w4)))
  if (SHOTS) await later.screenshot({ path: `${SHOTS}/worker-docs-at.png` }).catch(() => {})

  // ── 3. 확정 알림: 늦어도 날짜 (알림 글은 '내일' 대신 날짜) + 떠 있는 안내 합계가 굴러감
  await open(a, `/admin/jobs/${JD}?tab=apps`)
  // 합계 글자가 바뀌는 걸 모두 적어 둠 (굴러가면 중간 숫자가 여럿)
  const watch = (p) => p.evaluate(() => {
    window.__rolls = []
    new MutationObserver(() => {
      const el = document.querySelector('[data-plan-toast-total]')
      if (el && window.__rolls[window.__rolls.length - 1] !== el.textContent) window.__rolls.push(el.textContent)
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
  })
  const confirmIn = async (p, sel) => {
    const btn = p.locator(`${sel} form button`, { hasText: '확정' }).first()
    await btn.click()
    await p.waitForTimeout(250)
    // 한 번에 확정되면 버튼이 사라짐 → 오래 기다리지 않게 (안내는 5초만 떠 있음)
    if ((await btn.getAttribute('data-confirm', { timeout: 1000 }).catch(() => null)) === 'armed') await btn.click()
    await p.locator('[data-plan-toast] [data-plan-toast-total]:not([data-rolling])').waitFor({ timeout: 8000 }).catch(() => {})
    await p.waitForTimeout(200)
  }
  await watch(a)
  await confirmIn(a, `#app-${AP(6)}`)
  // 굴러간 숫자들과 지금 합계를 한 번에 읽음
  const [rolls, fin] = await a.evaluate(() => [window.__rolls, document.querySelector('[data-plan-toast-total]')?.textContent ?? `없음 ${document.querySelectorAll('[data-plan-toast]').length}`])
  ok(`안내 합계: ${won(DAY)} → ${won(DAY * 2)} 사이 숫자를 거쳐 굴러감`, fin === won(DAY * 2) && rolls.length >= 3 && rolls[rolls.length - 1] === won(DAY * 2), `${fin} | ${rolls.join(' > ')}`)
  if (SHOTS) await a.locator('[data-plan-toast] [role=status]').screenshot({ path: `${SHOTS}/plan-toast-roll.png` }).catch(() => {})
  const m6 = (await msgsOf(U(6))).find((m) => m.includes('근무가 확정됐어요')) ?? ''
  ok(`확정 알림: '… 모집이 끝나면 보내 드려요. 늦어도 ${fd(kday(2))} 저녁 6시에는 와요.'`, m6.includes(`서명할 서류(근로계약서 등)는 모집이 끝나면 보내 드려요. 늦어도 ${fd(kday(2))} 저녁 6시에는 와요.`), m6)
  // 움직임 줄이기: 바로 새 금액 (중간 숫자 없음)
  const r = await pg(A, { reducedMotion: 'reduce' })
  await open(r, `/admin/jobs/${JD}?tab=apps`)
  await watch(r)
  await confirmIn(r, `#app-${AP(7)}`)
  const rolls2 = await r.evaluate(() => window.__rolls)
  ok(`움직임 줄이기: 합계가 바로 ${won(DAY * 3)} (굴러가지 않음)`, rolls2.length >= 1 && rolls2.every((x) => x === won(DAY * 3)), rolls2.join(' > '))

  // ── 4. 저녁 작업: 모집 중 내일 근무 확정자에게 서류 + 그 회사 관리자 알림 기록 (회사별) · 모레·사흘 뒤는 아직
  const before = (await autoLogs()).length
  const cron = await fetch(`${D}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } }).then((x) => x.json()).catch((e) => ({ error: String(e) }))
  const logs = (await autoLogs()).slice(before)
  const la = logs.find((l) => (l.detail ?? '').startsWith(JA))
  const lb = logs.find((l) => (l.detail ?? '').startsWith(JB))
  ok('내일 근무 확정자 2명에게 서류', (await docsOf(JA)).length === 2, JSON.stringify(cron.docs ?? cron))
  ok(`기록: doc.issue_auto '${JA} 2명' · 이 회사(C1)로`, la?.detail === `${JA} 2명` && la?.company_id === C1, JSON.stringify(la ?? null))
  ok('다른 회사 공고는 그 회사(C2) 기록으로', (await docsOf(JB)).length === 1 && lb?.company_id === C2 && lb?.detail === `${JB} 1명`, JSON.stringify(lb ?? null))
  ok("근무자에게 '✍️ 서명할 서류가 왔어요'", (await msgsOf(U(1))).some((m) => m.includes('근무 전에 서명할 서류가 준비됐어요')))
  ok('모레·사흘 뒤 근무는 아직 서류 없음', (await docsOf(JC)).length === 0 && (await docsOf(JD)).length === 0)
  // 한 번 더 돌아도 새로 보낸 사람이 없으면 기록 없음
  await fetch(`${D}/api/cron/remind`, { headers: { authorization: 'Bearer test-cron' } }).catch(() => null)
  ok('두 번째 저녁 작업: 같은 공고 기록이 늘지 않음', (await autoLogs()).filter((l) => (l.detail ?? '').startsWith(JA)).length === 1)

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
