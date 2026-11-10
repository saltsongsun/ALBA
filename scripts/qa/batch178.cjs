// 묶음 178 (정기 개선 2026-11-10 16:35 KST)
// · 비회원이 공고에서 '가입하고 지원'을 누르면: 유형 고르기('어떤 분이세요?')를 건너뛰고 공고 종류에 맞는 가입 화면으로 바로
//   + 가입 화면 위에 그 공고 제목과 '가입하면 이 공고로 돌아가요' (공개된 공고만 · 없으면 원래 안내 문구)
// · 가입 유형 고르기 카드: 설명을 두 줄로 짧게 (360px에서 한 줄씩)
// · 지난 근무 카드: '날짜별 기록 n일' 펼치면 날짜 · 시작~종료 · 인정 시간 (근무 중 / 종료 기록 없음 표시)
//   + 내 근무 화면의 지난 근무 제목도 누르면 공고로
// node scripts/qa/batch178.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const kstHm = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16)
const fmtDate = (day) => { const [, m, d] = day.split('-').map(Number); return `${m}/${d}(${'일월화수목금토'[new Date(day + 'T00:00:00Z').getUTCDay()]})` }
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const next = encodeURIComponent(`/jobs/${J}`)

  // ── 1. 비회원: 공고 아래 바 → 알바 가입 화면으로 바로
  // (오후 6시 뒤엔 오늘 공고가 끝난 근무라 지원 바가 안 나옴 → 이 확인 동안만 공고 날짜를 내일로)
  const day0 = kstDay(Date.now()), day1 = kstDay(Date.now() + 864e5)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day1, end_date: day1 })
  const g = await pg(null)
  await g.goto(`${D}/jobs/${J}`)
  const bar = g.locator('[data-sticky-apply] a').first()
  await bar.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  const href = await bar.getAttribute('href').catch(() => '')
  ok("공고 아래 '가입하고 지원' → 알바 가입 화면으로 바로 (유형 고르기 없이)", href === `/signup?type=worker&next=${next}`, href)
  await g.goto(`${D}${href}`)
  const forJob = g.locator('[data-signup-for]')
  await forJob.waitFor({ timeout: 15000 }).catch(() => {})
  ok("가입 화면: '어떤 분이세요?' 없이 간편 가입", (await g.getByText('어떤 분이세요?').count()) === 0 && (await g.getByRole('heading', { name: '간편 가입' }).count()) === 1)
  const ft = ((await forJob.innerText().catch(() => '')) ?? '').replace(/\n+/g, ' / ').trim()
  ok("공고 제목 + '가입하면 이 공고로 돌아가요'", ft === `${TITLE} / 가입하면 이 공고로 돌아가요`, ft)
  ok('제목은 한 줄(길면 줄임) · 360px 옆으로 안 밀림', (await forJob.evaluate((el) => el.querySelector('b').getBoundingClientRect().height < 24 && el.getBoundingClientRect().height < 64)) && (await noSide(g)))
  ok('원래 안내 문구는 겹쳐 나오지 않음', (await g.getByText('한 번만 가입하면').count()) === 0)
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/signup-for-job.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})

  // 공고 없이 온 가입: 원래 문구
  await g.goto(`${D}/signup?type=worker`)
  await g.getByRole('heading', { name: '간편 가입' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('공고 없이 오면 원래 안내 문구', (await g.locator('[data-signup-for]').count()) === 0 && (await g.getByText('한 번만 가입하면').count()) === 1)
  // 없는 공고·이상한 주소: 오류 없이 원래 문구
  await g.goto(`${D}/signup?type=worker&next=${encodeURIComponent('/jobs/00000000-0000-4000-8000-00000000dead')}`)
  await g.getByRole('heading', { name: '간편 가입' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('없는 공고면 원래 안내 문구', (await g.locator('[data-signup-for]').count()) === 0 && (await g.getByText('한 번만 가입하면').count()) === 1)
  // 아직 공개 전(임시 저장) 공고는 제목을 보여 주지 않음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'draft' })
  await g.goto(`${D}/signup?type=worker&next=${next}`)
  await g.getByRole('heading', { name: '간편 가입' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('공개 전 공고는 제목을 보여 주지 않음', (await g.locator('[data-signup-for]').count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'open' })

  // 전문가 의뢰면 전문가 가입 화면으로
  await rest(`jobs?id=eq.${J}`, 'PATCH', { audience: 'expert' })
  await g.goto(`${D}/jobs/${J}`)
  await bar.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  const hrefX = await bar.getAttribute('href').catch(() => '')
  ok('전문가 의뢰는 전문가 가입 화면으로', hrefX === `/signup?type=expert&next=${next}`, hrefX)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { audience: 'worker' })

  // ── 2. 가입 유형 고르기: 설명 두 줄 (한 줄씩)
  await g.goto(`${D}/signup`)
  await g.getByRole('heading', { name: '어떤 분이세요?' }).waitFor({ timeout: 15000 }).catch(() => {})
  const cards = await g.evaluate(() => [...document.querySelectorAll('a[href^="/signup?type="]')].map((a) => ({
    who: a.querySelector('[data-pick-who]')?.textContent?.trim() ?? '',
    what: a.querySelector('[data-pick-what]')?.textContent?.trim() ?? '',
    h: [a.querySelector('[data-pick-who]'), a.querySelector('[data-pick-what]')].map((e) => Math.round(e?.getBoundingClientRect().height ?? 99)),
    card: Math.round(a.getBoundingClientRect().height),
  })))
  ok('유형 카드 3개: 설명 두 줄이 각각 한 줄', cards.length === 3 && cards.every((c) => c.who && c.what && c.h.every((h) => h < 24)), JSON.stringify(cards))
  ok("아르바이트: '행사 스태프·안내·진행 보조 / 출퇴근·계약·급여를 앱으로'", cards[0]?.who === '행사 스태프·안내·진행 보조' && cards[0]?.what === '출퇴근·계약·급여를 앱으로')
  ok('카드 높이가 같고 낮아짐 (세 줄 설명 → 두 줄) · 옆으로 안 밀림', new Set(cards.map((c) => c.card)).size === 1 && cards[0].card <= 112 && (await noSide(g)), String(cards.map((c) => c.card)))
  ok('머리말 한 줄', await g.getByText('유형마다 화면과 계약·정산이 달라요.').evaluate((el) => el.getBoundingClientRect().height < 30).catch(() => false))
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/signup-picker.png`, clip: { x: 0, y: 0, width: 360, height: 560 } }).catch(() => {})

  // ── 3. 지난 근무: 날짜별 기록 (공고 날짜는 다시 오늘로)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day0, end_date: day0 })
  const w = await pg(W)
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  const today = kstDay(Date.now()), yest = kstDay(Date.now() - 864e5)
  const days = w.locator(`[data-history-job="${J}"] [data-history-days]`)
  const rowText = async () => ((await days.locator('li').first().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  const openDays = async () => {
    await w.goto(`${D}/me/history`)
    await days.waitFor({ timeout: 15000 }).catch(() => {})
    await days.locator('summary').click().catch(() => {})
    await w.waitForTimeout(450)
  }
  // 오늘 근무 중 (가짜 DB 기본)
  await openDays()
  ok("접힌 줄 '날짜별 기록 1일'", ((await days.locator('summary').innerText().catch(() => '')) ?? '').trim() === '날짜별 기록 1일')
  const t1 = await rowText()
  ok(`근무 중: '${fmtDate(today)} ${kstHm(att.clock_in)}~ 오늘 근무 중'`, t1 === `${fmtDate(today)} ${kstHm(att.clock_in)}~ 오늘 근무 중`, t1)
  // 어제 10:00~15:00 근무 (끝남)
  const at = (hm) => new Date(Date.parse(`${yest}T${hm}:00+09:00`)).toISOString()
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: yest, start_time: '09:00:00', end_time: '18:00:00' })
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { work_date: yest, clock_in: at('10:00'), clock_out: at('15:00') })
  await openDays()
  const t2 = await rowText()
  ok(`끝난 날: '${fmtDate(yest)} 10:00~15:00 n시간'`, new RegExp(`^${fmtDate(yest).replace(/[()]/g, '\\$&')} 10:00~15:00 (\\d+시간( \\d+분)?|\\d+분)$`).test(t2), t2)
  ok('한 줄 · 360px 옆으로 안 밀림', (await days.locator('li').first().evaluate((el) => el.getBoundingClientRect().height < 24)) && (await noSide(w)))
  if (SHOTS) await w.locator(`[data-history-job="${J}"]`).screenshot({ path: `${SHOTS}/history-days.png` }).catch(() => {})
  // 종료 기록이 없는 지난 날
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: null })
  await openDays()
  const t3 = await rowText()
  ok(`종료 안 누른 날: '${fmtDate(yest)} 10:00~ 종료 기록 없음'`, t3 === `${fmtDate(yest)} 10:00~ 종료 기록 없음`, t3)

  // 내 근무 화면의 지난 근무 제목 → 공고
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: at('15:00') })
  await w.goto(`${D}/me`)
  const title = w.locator(`[data-history-job="${J}"] a[data-history-title]`)
  await title.waitFor({ timeout: 15000 }).catch(() => {})
  ok('내 근무: 지난 근무 제목을 누르면 공고로', (await title.getAttribute('href').catch(() => '')) === `/jobs/${J}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
