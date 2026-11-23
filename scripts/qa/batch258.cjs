// 묶음 258 (정기 개선 2026-11-15 06:35 KST)
// · 공고 화면에서 근무자에게 보내는 단체 문자 머리에 회사 이름: '[주식회사 테스트 · 공고명] …'
//   (예전 '[공고명] …'만 — 여러 회사에서 일하는 사람이 관리자 개인 번호로 받으면 어느 회사 일인지 몰랐음)
//   확정자 문자 · 공지 문자 · 안 읽은 사람 문자 · 계좌 요청 · 서명 요청 · 출퇴근 탭 전체 문자 · 예전 근무자 모집 알림
// · 출퇴근 탭 '⚠️ 확정 1/5명 · 4명 부족 | 대기자 1명 →' 한 줄 (날짜는 바로 위 날짜 칩에 있어 뺌 — 360px에서 '4명 부족'만 다음 줄로 떨어지던 것)
// node scripts/qa/batch258.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const J = 'cccccccc-0000-4000-8000-000000000003'
const HEAD = '[주식회사 테스트 · 경상남도 생활체육대축전 행사장 안내 스태프]'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const rest = (p, method = 'GET', b) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b) }).then((r) => r.json().catch(() => null))
const body = async (loc) => { const h = (await loc.getAttribute('href').catch(() => '')) ?? ''; return decodeURIComponent(h.split(/[?&]body=/)[1] ?? '') }

;(async () => {
  // 저녁에도 그대로 돌게: 오늘 근무가 끝나면(18:00) 부족 경고를 숨기므로 끝나는 시각을 늦춤 (2026-11-15 19:35 회차에서 저녁 실패)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59' })
  for (const app of (await rest(`applications?job_id=eq.${J}`)) ?? []) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, end_time: '23:59' } })
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const a = await ctx.newPage()
  a.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const go = async (tab) => { await a.goto(`${D}/admin/jobs/${J}?tab=${tab}`, { waitUntil: 'networkidle' }) }

  // ── 1. 출퇴근 탭: 부족 경고 한 줄
  await go('att')
  const warn = a.locator('a', { hasText: '⚠️' }).first()
  await warn.waitFor({ timeout: 15000 }).catch(() => {})
  const wt = one(await warn.innerText().catch(() => ''))
  ok("'⚠️ 확정 1/5명 · 4명 부족 대기자 1명 →' (날짜 없이)", wt === '⚠️ 확정 1/5명 · 4명 부족 대기자 1명 →', wt)
  const hs = await warn.evaluate((el) => [...el.children].filter((c) => c.tagName === 'SPAN').map((c) => Math.round(c.getBoundingClientRect().height))).catch(() => [])
  ok('왼쪽·오른쪽 모두 한 줄 (360px)', hs.length === 2 && hs.every((h) => h < 24), JSON.stringify(hs))
  ok('360px 옆으로 안 밀림', await noSide(a))
  if (SHOTS) {
    await warn.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(300)
    await warn.screenshot({ path: `${SHOTS}/att-short-banner.png` }).catch(() => {})
  }
  const allSms = a.locator('a[href^="sms:"]', { hasText: /전체 \d+명 문자/ })
  ok(`출퇴근 탭 '전체 n명 문자' 머리: ${HEAD}`, (await body(allSms)).startsWith(HEAD), await body(allSms))

  // ── 2. 지원자 탭: 확정자 문자
  await go('apps')
  const appr = a.locator('a[href^="sms:"]', { hasText: /확정 \d+명에게 문자/ })
  ok('지원자 탭 확정자 문자 머리에 회사 이름', (await body(appr)).startsWith(HEAD), await body(appr))

  // ── 3. 공지: 보내고 '같은 내용 문자로' · 안 읽은 사람 문자
  const fold = a.locator('details', { hasText: '확정자에게 공지' })
  await fold.locator('summary').click()
  await fold.locator('textarea[name=body]').fill('내일 집결은 08:30 정문이에요.')
  await fold.getByRole('button', { name: /앱으로 보내기/ }).click()
  await fold.locator('.animate-pop', { hasText: '문자로도' }).waitFor({ timeout: 15000 }).catch(() => {})
  const same = fold.locator('a[href^="sms:"]', { hasText: '같은 내용 문자로' })
  ok("공지 '같은 내용 문자로' → '[회사 · 공고] 내일 집결은…'", (await body(same)) === `${HEAD} 내일 집결은 08:30 정문이에요.`, await body(same))
  await go('apps')
  await fold.locator('summary').click()
  const unreadSms = fold.locator('[data-notice-reads] a[href^="sms:"]')
  await unreadSms.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  ok('안 읽은 사람 문자도 같은 머리', (await body(unreadSms)) === `${HEAD} 내일 집결은 08:30 정문이에요.`, await body(unreadSms))

  // ── 4. 정산 탭 계좌 요청 · 서류 탭 서명 요청
  await go('pay')
  const acct = a.locator('[data-no-account]').locator('xpath=..').locator('a[href^="sms:"]').first()
  ok('정산 탭 계좌 등록 요청 문자 머리', (await body(acct)).startsWith(`${HEAD} 급여를 보내 드리려면`), await body(acct))
  await go('docs')
  const sign = a.locator('[data-unsigned-tools] a[href^="sms:"]').first()
  // 2026-11-23 14:35부터 근무가 이미 시작된 공고는 '근무 전에' 대신 '아직 서명하지 않았어요' (이 공고는 오늘 시작 · 머리는 그대로)
  ok('서류 탭 서명 요청 문자 머리', (await body(sign)).startsWith(`${HEAD} 근로계약서 등 서류에 아직 서명하지 않았어요`), await body(sign))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
