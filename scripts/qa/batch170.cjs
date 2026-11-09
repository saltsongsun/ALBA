// 묶음 170 (정기 개선 2026-11-10 07:35 KST)
// · 회사 후기 화면(근무자가 회사를 볼 때): 이름 아래 짧은 칩 한 줄 '✓ 확인된 회사 · 모집 중 n개 · 보통 n시간 내 답변'
//   (답 시간은 지원 화면과 같은 계산 · 3건 미만이면 칩 없음 · 모집 중 칩을 누르면 그 회사 공고)
// · 홈 공고 거르기 결과가 없으면: 조건을 하나 풀면 있는 곳을 개수와 함께 '7일 안 · 1개 →' (빈 화면에서 막히지 않게)
// node scripts/qa/batch170.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
let seq = 0
const decided = (mins) => {
  const created = Date.now() - 5 * 864e5
  seq++
  return rest('applications', 'POST', {
    job_id: J, user_id: `eeeeeeee-0000-4000-8000-${String(seq).padStart(12, '0')}`, status: 'rejected', available_dates: null, position: null,
    contract_received_at: null, message: null, admin_memo: null, held_at: null,
    created_at: new Date(created).toISOString(), decided_at: new Date(created + mins * 60e3).toISOString(),
  })
}

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
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 회사 후기 화면: 처음엔 '모집 중 1개'만 (확인 전 회사 · 답한 기록 없음)
  const w = await pg(W)
  const facts = w.locator('[data-company-facts]')
  const factText = async () => ((await facts.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  await w.goto(`${D}/community/company/${CO}`)
  await w.locator('[data-company-rating]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("처음: '모집 중 1개'만 (확인된 회사·답 시간 칩 없음)", (await factText()) === '모집 중 1개', await factText())
  ok("'모집 중 1개'를 누르면 그 회사 공고", (await w.locator('[data-company-open]').getAttribute('href')) === `/?co=${CO}`)

  // 확인된 회사 + 답한 기록 3건(2·3·5시간) → 세 칩
  await rest(`companies?id=eq.${CO}`, 'PATCH', { verified: true })
  await decided(120)
  await decided(180)
  await decided(300)
  await w.goto(`${D}/community/company/${CO}`)
  await facts.waitFor({ timeout: 15000 }).catch(() => {})
  const t = await factText()
  ok("'✓ 확인된 회사 · 모집 중 1개 · 보통 3시간 내 답변'", t === '✓ 확인된 회사 모집 중 1개 보통 3시간 내 답변', t)
  ok('칩 세 개가 한 줄 · 360px 옆으로 안 밀림', (await facts.evaluate((el) => el.getBoundingClientRect().height < 30)) && (await wide(w)))
  if (SHOTS) await w.locator('[data-company-rating]').screenshot({ path: `${SHOTS}/company-facts.png` }).catch(() => {})

  // ── 2. 홈 거르기 결과 없음 → 조건 하나 풀면 있는 곳
  // 공고를 이번 주말이 아닌 평일 하루로 (오늘이 주말이면 다음 월요일)
  const kst = new Date(Date.now() + 9 * 3600e3)
  const dow = kst.getUTCDay()
  const day = new Date(kst.getTime() + (dow === 6 ? 2 : dow === 0 ? 1 : 0) * 864e5).toISOString().slice(0, 10)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: day, end_date: day })
  const g = await pg(null)
  await g.goto(`${D}/?when=weekend#jobs`)
  const loosen = g.locator('[data-loosen] a')
  await loosen.first().waitFor({ timeout: 15000 }).catch(() => {})
  ok("이번 주말에 없으면 '조건에 맞는 공고가 없어요'", (await g.getByText('조건에 맞는 공고가 없어요').count()) > 0)
  ok("조건을 풀면 있는 곳: '7일 안 · 1개 →'", (await loosen.allInnerTexts()).join('|') === '7일 안 · 1개 →', (await loosen.allInnerTexts()).join('|'))
  ok('차례로 톡 (0ms부터)', (await loosen.first().evaluate((el) => getComputedStyle(el).animationName)) === 'pop')
  ok('360px 옆으로 안 밀림', await wide(g))
  if (SHOTS) await g.locator('[data-loosen]').locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/loosen.png` }).catch(() => {})
  await loosen.first().click()
  await g.waitForURL((u) => u.searchParams.get('when') === 'week', { timeout: 10000 }).catch(() => {})
  await g.locator('a.card-link').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok("누르면 '7일 안'으로 바뀌고 공고 1개", new URL(g.url()).searchParams.get('when') === 'week' && (await g.locator('a.card-link').count()) === 1, g.url())

  // 지원 가능만 + 이번 주말 → 두 조건 풀기 (7일 안 · 마감 포함 중 있는 것만)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { headcount: 1 }) // 확정 1/1 → 정원 마감
  await g.goto(`${D}/?when=weekend&avail=1#jobs`)
  await g.locator('[data-loosen]').waitFor({ timeout: 15000 }).catch(() => {})
  const lt = (await loosen.allInnerTexts()).join('|')
  ok("주말+지원 가능만(정원 마감 공고): 날짜를 풀어도 마감이라 없음 → '날짜 전체'도 없음 · 마감 포함은 주말이라 없음 → 전체 공고 보기", lt === '' && (await g.getByText('전체 공고 보기 →').count()) > 0, lt)
  await g.goto(`${D}/?when=week&avail=1#jobs`)
  await g.locator('[data-loosen]').waitFor({ timeout: 15000 }).catch(() => {})
  ok("7일 안+지원 가능만(정원 마감): '마감 포함 · 1개 →'", (await loosen.allInnerTexts()).join('|') === '마감 포함 · 1개 →', (await loosen.allInnerTexts()).join('|'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
