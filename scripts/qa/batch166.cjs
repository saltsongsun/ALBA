// 묶음 166 (정기 개선 2026-11-10 02:35 KST)
// · 대시보드 '확정 대기 지원자' 카드: 이름 아래 한 줄 '★ 평점 · 근무 n일 · 지각 · 노쇼' (처음이면 '첫 근무')
//   공고의 지원자 탭과 같은 내용을 대시보드에서도 (공고에 들어가지 않고 바로 확정·미선발을 정하게)
// · 공고 목록: 뜻을 알 수 없던 초록 점 '● 1' → '● 지금 1' (지금 이 공고를 보고 있는 사람)
// node scripts/qa/batch166.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const APPLICANT = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const wide = () => a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
  const rel = a.locator('#pending [data-pending-rel]:visible').first()
  // 맨 앞 병아리 레벨 배지('Lv.n')는 묶음 241에서 따로 확인 — 여기서는 근무 이력 글자만 봄
  const relText = async () => ((await rel.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim().replace(/^Lv\.\d+ /, '')

  // ── 1. 이 회사에서 처음인 지원자: '첫 근무'
  await a.goto(`${D}/admin`)
  await rel.waitFor({ timeout: 15000 }).catch(() => {})
  ok("처음인 지원자: 이름 아래 '첫 근무'", (await relText()) === '첫 근무', await relText())

  // ── 2. 지난 근무(20분 늦게 출근) 1번 + 관리자 평가 5점 → '★ 5.0 (1) 근무 1일 · 지각 1'
  const past = new Date(Date.now() + 9 * 3600e3 - 20 * 864e5).toISOString().slice(0, 10)
  await rest('attendance', 'POST', {
    job_id: J, user_id: APPLICANT, work_date: past,
    clock_in: new Date(`${past}T09:20:00+09:00`).toISOString(), clock_out: new Date(`${past}T18:00:00+09:00`).toISOString(),
    note: null, paid: true, source: 'app', job: { id: J, title: '지난 행사', start_time: '09:00:00', end_time: '18:00:00' },
  })
  await rest('worker_ratings', 'POST', { user_id: APPLICANT, job_id: J, rater_id: A, score: 5, comment: '친절함', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  await a.goto(`${D}/admin`)
  await rel.waitFor({ timeout: 15000 }).catch(() => {})
  const t = await relText()
  ok("근무 이력: '★ 5.0 (1) 근무 1일 · 지각 1'", t === '★ 5.0 (1) 근무 1일 · 지각 1', t)
  ok('한 줄 (꺾이지 않음) · 360px 옆으로 안 밀림', (await rel.evaluate((el) => el.getBoundingClientRect().height < 26)) && (await wide()))
  const card = rel.locator('xpath=ancestor::div[contains(@class,"card")][1]')
  ok('지원 시각은 이름 줄 오른쪽에 그대로', /\d{1,2}\/\d{1,2}\(.\) \d{2}:\d{2}/.test(await card.innerText().catch(() => '')))
  // 공고의 지원자 탭과 같은 말 (이번 공고를 빼고 세는 지원자 탭과 숫자가 같도록 지난 근무는 다른 날짜)
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/pending-rel.png` }).catch(() => {})

  // ── 3. 공고 목록: '● 지금 1'
  const now = new Date().toISOString()
  await rest('job_views', 'POST', { job_id: J, viewer: 'v:batch166', user_id: null, first_seen: new Date(Date.now() - 120e3).toISOString(), last_seen: now, visits: 1 })
  await a.goto(`${D}/admin/jobs`)
  const live = a.locator('[data-views-live]:visible').first()
  await live.waitFor({ timeout: 15000 }).catch(() => {})
  const lt = ((await live.innerText().catch(() => '')) ?? '').trim()
  ok("보고 있는 사람: '● 지금 n'", /^● 지금 \d+$/.test(lt), lt)
  ok("뜻 설명 (길게 누르면 '지금 이 공고를 보고 있는 사람')", (await live.getAttribute('title').catch(() => '')) === '지금 이 공고를 보고 있는 사람')
  const meta = a.locator('[data-views]:visible').first()
  ok('카드 아랫줄이 한 줄 · 360px 옆으로 안 밀림', (await meta.evaluate((el) => el.parentElement.scrollWidth <= el.parentElement.clientWidth + 1 && el.getBoundingClientRect().height < 26)) && (await wide()))
  if (SHOTS) await a.locator('a.card-link').first().screenshot({ path: `${SHOTS}/jobs-live.png` }).catch(() => {})

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
