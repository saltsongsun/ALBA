// 묶음 112 (정기 개선 2026-11-07 05:35 · 디자인 원칙 "많은 정보도 심플하게")
// · 정산·신고자료: 달 고르기를 '‹ 2026년 11월 ›' (영어 달 이름 칸 없음) · 지급총액만 크게 + 소득세·지방소득세·고용보험 작은 세 칸
// · 실수 막기: 퇴근 기록이 없는 근무는 '퇴근 기록이 없는 근무 n건 · 이름 날짜 · 금액·신고자료에서 빠져 있어요 · 출퇴근에서 고치기 →'
//   오늘 근무 중은 '오늘 근무 중 n건은 퇴근하면 들어가요' · 표의 '0일 / 일' 대신 '퇴근 기록 없음 1'
//   신고 파일은 같은 모양 한 줄씩(기한은 그 줄에 작게) · 안 끝난 근무가 있으면 처음 누를 땐 멈추고 '한 번 더'
// · 개인정보 처리 기록은 접어 둠 · 공고 목록 '공고 모음 링크' 칸 두 줄로
// node scripts/qa/batch112.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const PAST = addDays(today, -1)
const MONTH = PAST.slice(0, 7)
const sameMonth = today.slice(0, 7) === MONTH
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

;(async () => {
  // 어제 출근만 하고 퇴근 기록이 없는 근무 하나 (오늘 근무 중 기록은 가짜 데이터에 이미 있음)
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  await rest('attendance', 'POST', { ...att, id: 'eeeeeeee-0000-4000-8000-0000000001a2', work_date: PAST, clock_in: `${PAST}T00:00:00Z`, clock_out: null })

  const b = await chromium.launch()
  const errs = []
  const pg = async (scheme = 'light') => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', colorScheme: scheme, acceptDownloads: true })
    await ctx.addInitScript((sc) => { try { if (sc === 'dark') localStorage.setItem('theme', 'dark'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} }, scheme)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const a = await pg()
  let csvHits = 0
  a.on('request', (r) => { if (r.url().includes('/admin/export/daily-income')) csvHits++ })

  // ── 1. 달 고르기 · 한눈에 ──
  await a.goto(`${D}/admin/reports?month=${MONTH}`)
  const nav = a.locator('[data-month-nav]')
  await nav.waitFor({ timeout: 15000 }).catch(() => {})
  const [y, m] = MONTH.split('-').map(Number)
  const label = (await a.locator('[data-month-label]').innerText().catch(() => '')).replace(/\n/g, ' ')
  ok(`달 고르기: '‹ ${y}년 ${m}월 ›' (영어 달 칸 없음)`, label.includes(`${y}년 ${m}월`) && (await a.locator('input[type=month]').count()) === 0 && (await nav.evaluate((el) => el.getBoundingClientRect().height < 60)), label)
  ok(sameMonth ? "이번 달이면 '이번 달'" : "지난 달이면 '이번 달로'", label.includes(sameMonth ? '이번 달' : '이번 달로'))
  const prev = await a.locator('[data-month-prev]').getAttribute('href')
  ok('‹ 는 지난 달로', prev === `/admin/reports?month=${new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)}`, prev)
  const sum = a.locator('[data-report-summary]')
  const st = await sum.innerText().catch(() => '')
  ok("한눈에: '지급총액' 크게 + 근무자 · 소득세 · 지방소득세 · 고용보험 (예전 다섯 칸 대신 카드 하나)", ['지급총액', '근무자', '소득세', '지방소득세', '고용보험'].every((k) => st.includes(k)) && (await sum.evaluate((el) => el.getBoundingClientRect().height < 150)), st.replace(/\n/g, ' | '))

  // ── 2. 퇴근 기록 없는 근무 · 오늘 근무 중 ──
  const miss = a.locator('[data-report-missing]')
  const mt = (await miss.innerText().catch(() => '')).replace(/\n/g, ' | ')
  ok(`'퇴근 기록이 없는 근무 1건' · '근무자 ${md(PAST)}' · '금액·신고자료에서 빠져 있어요'`, mt.includes('퇴근 기록이 없는 근무 1건') && mt.includes(`근무자 ${md(PAST)}`) && mt.includes('금액·신고자료에서 빠져 있어요'), mt)
  const fix = await a.locator('[data-report-fix]').getAttribute('href').catch(() => '')
  ok("'출퇴근에서 고치기 →' 는 그 공고 출퇴근 탭의 그 사람 줄로", fix === `/admin/jobs/${J}?tab=att&date=${PAST}&fix=${W}#att-${W}`, fix)
  ok('안내 줄마다 한 줄 (어색한 줄바꿈 없음)', await miss.locator('b, span.block').evaluateAll((els) => els.every((e) => e.getClientRects().length === 1)))
  if (sameMonth) ok("오늘 근무 중: '오늘 근무 중 1건은 퇴근하면 들어가요'", (await a.locator('[data-report-live]').innerText().catch(() => '')).includes('오늘 근무 중 1건은 퇴근하면 들어가요'))
  const cell = await a.locator('[data-report-table] tbody tr').first().locator('td').nth(1).innerText().catch(() => '')
  ok("표 근무일 칸: '0일 / 일' 대신 '0일 · 퇴근 기록 없음 1'", cell.includes('퇴근 기록 없음 1') && !/^\s*일\s*$/m.test(cell), JSON.stringify(cell))

  // ── 3. 신고 파일: 같은 모양 한 줄씩 · 안 끝난 근무가 있으면 한 번 멈춤 ──
  const rows = await a.locator('[data-report-file]').evaluateAll((els) => els.map((e) => ({ k: e.dataset.reportFile, h: Math.round(e.getBoundingClientRect().height), t: e.innerText.replace(/\n/g, ' ') })))
  ok("파일 네 줄: 일용근로소득 · 근로내용확인신고 · 사업소득 · 기타소득 (기한은 그 줄에)", rows.map((r) => r.k).join() === 'daily,employment,business,other' && rows[0].t.includes('말일까지') && rows[1].t.includes('15일까지') && rows.every((r) => r.h <= 64), JSON.stringify(rows))
  ok('기타소득 줄 주소 그대로', ((await a.locator('[data-export-other]').getAttribute('href')) ?? '').startsWith('/admin/export/other-income?month='))
  ok("'원천세 신고·납부: … 10일까지' · '주민등록번호' 안내 남음", (await a.locator('[data-report-notes]').innerText()).includes('10일까지') && (await a.locator('[data-report-notes]').innerText()).includes('주민등록번호'))
  const daily = a.locator('[data-report-file=daily]')
  csvHits = 0
  await daily.click()
  await a.waitForTimeout(500)
  const warn = a.locator('[data-report-file-warn]')
  const n = sameMonth ? 2 : 1
  ok(`첫 누름은 받지 않고 '아직 안 끝난 근무 ${n}건은 파일에 빠져요 / 한 번 더 누르면 그대로 받아요'`, csvHits === 0 && (await warn.innerText().catch(() => '')).includes(`아직 안 끝난 근무 ${n}건은 파일에 빠져요`) && (await daily.innerText()).includes('한 번 더'))
  ok('안내 두 줄 각 한 줄 (360px)', await warn.locator('b, span').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height < 20)))
  const dl = a.waitForEvent('download', { timeout: 8000 }).then(() => true, () => false)
  await daily.click()
  ok('한 번 더 누르면 받음', (await dl) || csvHits > 0)

  // ── 4. 개인정보 처리 기록은 접혀 있음 ──
  await a.goto(`${D}/admin/reports?month=${MONTH}`)
  const log = a.locator('[data-audit-log]')
  await log.waitFor({ timeout: 10000 }).catch(() => {})
  ok("'개인정보 처리 기록 · 최근 n건' 접혀 있음", (await log.evaluate((el) => !el.open)) && /최근 \d+건/.test(await log.locator('summary').innerText()))
  await log.locator('summary').click()
  await log.locator('table').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  ok('펼치면 기록 표', (await log.evaluate((el) => el.open)) && (await log.locator('table').isVisible()))
  ok('360px: 옆으로 안 밀림 (밝은 화면)', await wide(a))
  if (SHOTS) await a.screenshot({ path: `${SHOTS}/reports.png`, fullPage: true })
  const dk = await pg('dark')
  await dk.goto(`${D}/admin/reports?month=${MONTH}`)
  await dk.locator('[data-month-nav]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('360px: 옆으로 안 밀림 (어두운 화면)', (await dk.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && (await wide(dk)))
  // 어두운 화면: 표 머리 줄이 하얗게 뜨지 않음 (모든 칸이 어두운 바탕)
  const thBg = await dk.locator('[data-report-table] th').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))
  const dark = (c) => { const m = c.match(/\d+/g)?.map(Number) ?? [255, 255, 255]; return m[0] + m[1] + m[2] < 200 }
  ok('어두운 화면: 표 머리 줄 칸이 모두 어두움', thBg.length > 0 && thBg.every(dark), JSON.stringify([...new Set(thBg)]))
  if (SHOTS) await dk.screenshot({ path: `${SHOTS}/reports-dark.png`, fullPage: true })

  // ── 5. 다 끝나면 안내 없고 바로 받음 ──
  await rest(`attendance?user_id=eq.${W}`, 'PATCH', { clock_out: new Date().toISOString() })
  await a.goto(`${D}/admin/reports?month=${MONTH}`)
  await a.locator('[data-month-nav]').waitFor({ timeout: 15000 }).catch(() => {})
  ok('다 끝나면 퇴근 기록 안내 없음', (await a.locator('[data-report-missing], [data-report-live]').count()) === 0)
  csvHits = 0
  const dl2 = a.waitForEvent('download', { timeout: 8000 }).then(() => true, () => false)
  await a.locator('[data-report-file=daily]').click()
  ok('바로 받음 (멈춤 없음)', ((await dl2) || csvHits > 0) && (await a.locator('[data-report-file-warn]').count()) === 0)

  // ── 6. 공고 목록: 공고 모음 링크 칸 두 줄 ──
  await a.goto(`${D}/admin/jobs`)
  const card = a.locator('[data-share-card]')
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  const ch = await card.evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 999)
  ok(`공고 모음 링크 칸: 두 줄 (높이 ${ch}px < 90)`, ch < 90)
  ok("'공고 모음 링크' · QR · 공유하기 한 줄", await card.evaluate((el) => { const t = el.querySelector('[data-poster-link]').getBoundingClientRect().top; const s = [...el.querySelectorAll('button, a')].find((x) => x.textContent.includes('공유하기')); return !!s && Math.abs(s.getBoundingClientRect().top - t) < 4 }))
  ok('안내 한 줄 · 잘리지 않음', await card.locator('[data-link-count], span.block').first().evaluate((el) => el.getClientRects().length === 1 && el.scrollWidth <= el.clientWidth + 1))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/share-card.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
