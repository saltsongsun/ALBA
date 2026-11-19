// 묶음 314 (정기 개선 2026-11-19 14:35 KST)
// · 내려받는 CSV 파일 이름 맨 앞에 회사 이름 (정산표 · 근로자명부 · 신고자료 4개) — 여러 회사를 맡은 관리자가 받은 파일끼리 헷갈려
//   다른 회사 자료로 신고하지 않게 · 다른 회사 관리자가 받으면 그 회사 이름 · 파일에 못 쓰는 글자는 빠짐
// · 정산·신고자료: 파일마다 들어가는 사람 수 'n명' (0명이면 흐리게) · 누르면 잠깐 '✓ 받는 중' (눌렸는지 알게 · 2.5초 뒤 원래대로)
// node scripts/qa/batch314.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000314'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000314a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const PAST = addDays(today, -1)
const MONTH = PAST.slice(0, 7)
const sameMonth = today.slice(0, 7) === MONTH
const fileName = async (path, uid) => {
  const r = await fetch(`${D}${path}`, { headers: { cookie: `alba_session=${cookie(uid)}` }, redirect: 'manual' })
  const disp = r.headers.get('content-disposition') || ''
  return { status: r.status, name: decodeURIComponent(disp.replace(/^.*filename\*=UTF-8''/, '')) }
}

;(async () => {
  // 어제 끝난 근무 하나 (퇴근까지) — 이 달 신고자료에 들어가게
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  await rest('attendance', 'POST', { ...att, id: 'eeeeeeee-0000-4000-8000-000000031401', work_date: PAST, clock_in: `${PAST}T00:00:00Z`, clock_out: `${PAST}T08:00:00Z`, adj_in: null, adj_out: null })
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const coName = c1.company_name
  const [job] = await rest(`jobs?id=eq.${J}`)
  // 다른 회사(C2)만 맡은 관리자 · 회사 이름에 파일에 못 쓰는 글자
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '삼일사/컴퍼니', seal_image: null, verified: true, join_code: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  const { attendance: _a, ratings: _r, ...ab } = a1
  await rest('users', 'POST', { ...ab, id: A2, name: '삼일사관리자', phone: '01031403140', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: '2026-10-15T00:00:00Z' })

  // ── 1. 파일 이름에 회사 이름
  const kinds = [
    ['daily-income', `일용근로소득_지급명세_${MONTH}`],
    ['employment', `근로내용확인신고_${MONTH}`],
    ['business-income', `사업소득_간이지급명세_${MONTH}`],
    ['other-income', `기타소득_지급명세_${MONTH}`],
  ]
  for (const [k, base] of kinds) {
    const f = await fileName(`/admin/export/${k}?month=${MONTH}`, A)
    ok(`신고자료 '${coName}_${base}.csv'`, f.status === 200 && f.name === `${coName}_${base}.csv`, `${f.status} ${f.name}`)
  }
  const st = await fileName(`/admin/export/settlement?job=${J}`, A)
  ok(`정산표 '${coName}_정산표_${job.title}.csv'`, st.status === 200 && st.name === `${coName}_정산표_${job.title}.csv`, `${st.status} ${st.name}`)
  const o = await fileName(`/admin/export/daily-income?month=${MONTH}`, A2)
  ok("다른 회사 관리자가 받으면 그 회사 이름 ('/'는 빠짐: '삼일사 컴퍼니_…')", o.status === 200 && o.name === `삼일사 컴퍼니_일용근로소득_지급명세_${MONTH}.csv`, `${o.status} ${o.name}`)
  const os = await fileName(`/admin/export/settlement?job=${J}`, A2)
  ok('다른 회사 관리자는 우리 공고 정산표를 못 받음 (그대로 404)', os.status === 404, `${os.status}`)
  // 근로자명부: 잠금을 안 풀었으면 그대로 잠금 화면으로
  const wk = await fetch(`${D}/admin/export/workers`, { headers: { cookie: `alba_session=${cookie(A)}` }, redirect: 'manual' })
  ok('근로자명부는 그대로 명단 잠금부터 (303 → 잠금 화면)', wk.status === 303 && (wk.headers.get('location') || '').includes('unlock=csv'), `${wk.status}`)

  // ── 2. 정산·신고자료 화면: 파일마다 사람 수 · 누르면 '✓ 받는 중'
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', acceptDownloads: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await a.goto(`${D}/admin/reports?month=${MONTH}`, { waitUntil: 'networkidle' })
  const rows = await a.locator('[data-report-file]').evaluateAll((els) => els.map((e) => ({ k: e.dataset.reportFile, n: e.dataset.reportCount, t: e.querySelector('[data-report-n]')?.textContent ?? '', h: Math.round(e.getBoundingClientRect().height), mute: e.querySelector('span span')?.className.includes('text-mute') })))
  const by = Object.fromEntries(rows.map((r) => [r.k, r]))
  ok('파일 네 줄 모두 사람 수 (n명)', rows.length === 4 && rows.every((r) => /^\d+명$/.test(r.t) && r.t === `${r.n}명`), JSON.stringify(rows))
  ok('일용근로소득 · 근로내용확인신고는 같은 사람 수 (1명 이상)', Number(by.daily?.n) >= 1 && by.daily?.n === by.employment?.n, `${by.daily?.n}/${by.employment?.n}`)
  ok('0명 파일은 이름이 흐림 · 사람 있는 파일은 진하게', rows.every((r) => (r.n === '0') === !!r.mute), JSON.stringify(rows.map((r) => [r.k, r.n, r.mute])))
  ok('줄 높이 그대로 (한 줄씩 · 64px 이하)', rows.every((r) => r.h <= 64), JSON.stringify(rows.map((r) => r.h)))
  ok('360px 옆으로 안 밀림 (정산·신고자료)', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  const daily = a.locator('[data-report-file=daily]')
  if (sameMonth) {
    // 오늘 근무 중이 있으면 첫 누름은 멈춤 ('한 번 더') — '받는 중'은 안 나옴
    await daily.click()
    await a.waitForTimeout(300)
    ok("안 끝난 근무가 있으면 첫 누름은 '한 번 더' ('받는 중' 없음)", one(await daily.innerText()).includes('한 번 더') && (await a.locator('[data-report-got]').count()) === 0)
  }
  const dl = a.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await daily.click()
  const got = a.locator('[data-report-file=daily] [data-report-got]')
  const shown = await got.waitFor({ timeout: 1500 }).then(() => true, () => false)
  ok("누르면 그 줄에 '✓ 받는 중' (경고 칸은 닫힘)", shown && one(await got.textContent()) === '받는 중' && (await a.locator('[data-report-file-warn]').count()) === 0)
  if (SHOTS) await a.locator('[data-report-downloads]').screenshot({ path: `${SHOTS}/report-files-got.png` }).catch(() => {})
  const d = await dl
  // (파일 이름은 위 1에서 응답 머리로 확인 — 시험용 headless 크롬은 한글 파일 이름을 'download'로 바꿔 보여 줌)
  ok('그 파일이 실제로 내려받아짐', !!d && d.url().includes(`/admin/export/daily-income?month=${MONTH}`), d?.url())
  await a.waitForTimeout(2800)
  ok("2.5초 뒤 원래 'CSV'로", (await got.count()) === 0 && one(await daily.innerText()).includes('CSV'))
  // 움직임 줄이기: 튀는 움직임 없이 글자만
  await a.emulateMedia({ reducedMotion: 'reduce' })
  const biz = a.locator('[data-report-file=business]')
  await biz.click()
  if (sameMonth) { await a.waitForTimeout(200); await biz.click() }
  await a.locator('[data-report-file=business] [data-report-got]').waitFor({ timeout: 1500 }).catch(() => {})
  const anim = await a.locator('[data-report-file=business] [data-report-got]').evaluate((el) => getComputedStyle(el).animationName).catch(() => 'x')
  ok("움직임 줄이기면 '받는 중'이 튀지 않음", anim === 'none', anim)
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/reports-360.png` })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
