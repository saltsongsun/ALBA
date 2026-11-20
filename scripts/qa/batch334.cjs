// 묶음 334 (정기 개선 2026-11-21 07:35 KST · 근무자 휴대폰: 서명한 서류 + 조사 바로잡기)
// · 근무자가 서명한 서류를 열면 맨 위에 '✓ M/D(요일) HH:MM에 서명했어요' 한 줄 (서명 전 서류 · 관리자 화면에는 없음)
// · 서류 맨 아래: '이 문서는 근로자가 앱에서 직접 확인하고 서명한 전자문서입니다' ('근로자이' → '근로자가')
// · 정산 탭 정산 예정일 안내: '지급일 ‘…’ 기준으로 M/D(요일)에 맞춰 두었어요' (날짜 뒤 '을/를' 대신 '에')
// · 360px 옆으로 밀림 없음
// node scripts/qa/batch334.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const sign = (p, pre = '') => `${p}.${createHmac('sha256', SECRET).update(pre + p).digest('base64url')}`
const cookie = (u) => sign(Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'))
const roster = (u) => sign(Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'roster:')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const J4 = 'cccccccc-0000-4000-8000-000000033404'

;(async () => {
  // 사흘 전에 끝난 행사 (지급일 '익월 10일') · W가 일함 · 지급 전 → 정산 탭에 '정산 예정일 알리기'
  const [base] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jb } = base
  await rest('jobs', 'POST', { ...jb, id: J4, title: '가을 축제 안내', status: 'closed', start_date: kday(-3), end_date: kday(-3), pay_day: '익월 10일', applications: [], attendance: [], created_at: new Date().toISOString() })
  const [j4] = await rest(`jobs?id=eq.${J4}`)
  await rest('attendance', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000033401', job_id: J4, job: j4, user_id: W, work_date: kday(-3), clock_in: `${kday(-3)}T09:00:00+09:00`, clock_out: `${kday(-3)}T18:00:00+09:00`, adj_in: null, adj_out: null, paid: false, paid_at: null, confirmed: true, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 근무자: 서명한 서류 맨 위에 언제 서명했는지
  const w = await mk(W)
  await go(w, `/docs/${DOC_SIGNED}`)
  const line = w.locator('[data-doc-signed]')
  const lt = one(await line.innerText().catch(() => ''))
  ok("서명한 서류 맨 위: '✓ M/D(요일) HH:MM에 서명했어요'", (await line.count()) === 1 && /^✓ \d{1,2}\/\d{1,2}\(.\) \d{2}:\d{2}에 서명했어요$/.test(lt), lt)
  const lineTop = await line.evaluate((e) => e.getBoundingClientRect().top)
  ok('첫 화면에 보임 (회사 · 공고 줄 아래, 서류 위)', lineTop > 0 && lineTop < 300 && lineTop > (await w.locator('[data-doc-for]').evaluate((e) => e.getBoundingClientRect().top)), String(Math.round(lineTop)))
  // 같은 시각이 맨 아래 작은 글씨에도 (같은 값)
  const foot = one(await w.locator('article').innerText())
  const when = lt.replace(/^✓ /, '').replace(/에 서명했어요$/, '')
  ok('맨 아래 전자서명 일시와 같은 시각', foot.includes(`전자서명 일시 ${when}`), when)
  ok("맨 아래: '근로자가 앱에서 직접 확인하고 서명한 전자문서입니다' ('근로자이' 없음)", foot.includes('이 문서는 근로자가 앱에서 직접 확인하고 서명한 전자문서입니다') && !foot.includes('근로자이'))
  ok('360px 옆으로 밀림 없음 (서명한 서류)', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/doc-signed.png` })

  // ── 2. 서명 전 서류엔 없음
  await go(w, `/docs/${DOC}`)
  ok('서명 전 서류: 서명 줄 없음 (서명 대기 그대로)', (await w.locator('[data-doc-signed]').count()) === 0 && (await w.getByText('서명 대기').count()) >= 1)

  // ── 3. 관리자 화면엔 없음 (근무자 본인 화면에만) · 맨 아래 문구는 같음
  const a = await mk(A)
  await go(a, `/docs/${DOC_SIGNED}`)
  ok('관리자가 열면 서명 줄 없음 · 맨 아래 문구는 근로자가', (await a.locator('[data-doc-signed]').count()) === 0 && one(await a.locator('article').innerText()).includes('근로자가 앱에서'))

  // ── 4. 정산 탭: 정산 예정일 안내 문구
  await go(a, `/admin/jobs/${J4}?tab=pay`)
  const pd = a.locator('[data-payday]')
  await pd.waitFor({ timeout: 10000 }).catch(() => {})
  if ((await pd.count()) === 0) {
    ok('정산 예정일 알리기 칸 (지급 전 근무자 있음)', false, '칸이 없음')
  } else {
    const hint = one(await pd.locator('.hint').innerText().catch(() => ''))
    ok("안내: '지급일 ‘…’ 기준으로 M/D(요일)에 맞춰 두었어요'", /^지급일 ‘.+’ 기준으로 \d{1,2}\/\d{1,2}\(.\)에 맞춰 두었어요( \(이날까지\))?\.$/.test(hint), hint)
    ok('360px 옆으로 밀림 없음 (정산 탭)', await noSide(a))
    if (SHOTS) { await pd.locator('.hint').evaluate((e) => e.scrollIntoView({ block: 'center' })); await a.waitForTimeout(200); await a.screenshot({ path: `${SHOTS}/pay-hint.png` }) }
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
