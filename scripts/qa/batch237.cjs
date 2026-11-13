// 묶음 237 (정기 개선 2026-11-13 18:36 KST)
// · 오늘이 마지막 날이고 근무 시간까지 끝난 공고(지원 버튼 없음)는 '모집 중'으로 세지 않음
//   홈·회사 공고 모음 '모집 중인 알바 n' · 회사 카드 '모집 중 n개' · 회사 링크 미리보기 '지금 모집 중 n개'
// · 그런 공고는 목록 맨 아래 '── 오늘 근무가 끝난 공고 n ──' 아래로 (살짝 흐리게) · 지원할 수 있는 공고가 위에
//   지원할 수 있는 공고가 하나도 없으면 홈에 '지금 지원할 수 있는 공고가 없어요' (회사 공고 모음은 위 카드가 이미 말해서 안 씀)
// node scripts/qa/batch237.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const C1 = '99999999-0000-4000-8000-000000000099', J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000237a1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const metaDesc = async () => { const html = await fetch(`${D}/?co=${C1}`).then((r) => r.text()); return (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? '' }

;(async () => {
  const now = new Date(Date.now() + 9 * 3600e3)
  if (now.getUTCHours() * 60 + now.getUTCMinutes() < 3) { console.log('SKIP  00:03 전이라 끝난 근무 확인 생략'); console.log('ALL PASSED'); process.exit(0) }
  // 오늘 00:00~00:01 (이미 끝남) + 내일 공고 하나
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(0), end_date: kst(0), start_time: '00:00:00', end_time: '00:01:00', status: 'open' })
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  await rest('jobs', 'POST', { ...base, id: J2, title: '내일 무대 스태프', start_date: kst(1), end_date: kst(1), start_time: '09:00:00', end_time: '18:00:00', status: 'open', created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const heading = p.locator('h2#jobs')
  const done = p.locator('[data-done-today]')

  // ── 1. 홈: 지원할 수 있는 공고 위 · 끝난 공고는 맨 아래 따로
  await p.goto(`${D}/`, { waitUntil: 'networkidle' })
  ok("제목 '모집 중인 알바 1' (끝난 공고는 세지 않음)", one(await heading.innerText()) === '모집 중인 알바 1', one(await heading.innerText().catch(() => '')))
  const order = await p.evaluate(([j1, j2]) => {
    const a = document.querySelector(`a[href="/jobs/${j2}"]`), head = document.querySelector('[data-done-today-head]'), c = document.querySelector(`[data-done-today] a[href="/jobs/${j1}"]`)
    if (!a || !head || !c) return 'missing'
    return a.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING ? 'ok' : 'wrong'
  }, [J, J2])
  ok('내일 공고가 위 · 끝난 공고는 아래 구분선 밑', order === 'ok', order)
  const head = p.locator('[data-done-today-head]')
  ok("구분선 '오늘 근무가 끝난 공고 1' · 한 줄", one(await head.innerText().catch(() => '')) === '오늘 근무가 끝난 공고 1' && (await head.evaluate((el) => el.getBoundingClientRect().height)) < 24)
  ok("끝난 공고 카드: '오늘 근무 종료' 배지 그대로 · 살짝 흐리게", (await done.locator(`a[href="/jobs/${J}"] [data-over-today]`).count()) === 1 && ((await done.locator('div.opacity-80').count()) === 1))
  ok("지원할 공고가 있으면 '지원할 수 있는 공고가 없어요' 없음", (await p.locator('[data-no-live]').count()) === 0)
  ok('360px 옆으로 안 밀림 (홈)', await noSide(p))
  if (SHOTS) {
    const bx = await p.locator('h2#jobs').boundingBox()
    const db = await done.boundingBox()
    if (bx && db) await p.screenshot({ path: `${SHOTS}/done-today-home.png`, fullPage: true, clip: { x: 0, y: Math.max(0, bx.y - 8), width: 360, height: db.y + db.height - bx.y + 16 } }).catch(() => {})
  }

  // ── 2. 회사 공고 모음: '모집 중 1개' · 링크 미리보기도 1개
  await p.goto(`${D}/?co=${C1}`, { waitUntil: 'networkidle' })
  ok("회사 카드 '모집 중 1개' (끝난 공고 빼고)", (await p.getByText('모집 중 1개').count()) === 1 && (await p.getByText('모집 중 2개').count()) === 0)
  ok('회사 공고 모음도 끝난 공고는 아래 따로', (await done.locator(`a[href="/jobs/${J}"]`).count()) === 1 && one(await heading.innerText()) === '모집 중인 알바 1')
  ok("링크 미리보기 '지금 모집 중 1개'", (await metaDesc()).startsWith('지금 모집 중 1개'), await metaDesc())

  // ── 3. 지원할 수 있는 공고가 없음 (내일 공고 취소): 끝난 공고만
  await rest(`jobs?id=eq.${J2}`, 'PATCH', { status: 'cancelled' })
  await p.goto(`${D}/`, { waitUntil: 'networkidle' })
  ok("홈: 제목에 숫자 없음 · '지금 지원할 수 있는 공고가 없어요' · 끝난 공고는 아래", one(await heading.innerText()) === '모집 중인 알바' && one(await p.locator('[data-no-live]').innerText().catch(() => '')) === '지금 지원할 수 있는 공고가 없어요' && (await done.locator(`a[href="/jobs/${J}"]`).count()) === 1)
  await p.goto(`${D}/?co=${C1}`, { waitUntil: 'networkidle' })
  ok("회사 공고 모음: '지금은 모집 중인 공고가 없어요' (같은 말 두 번 안 함)", (await p.getByText('지금은 모집 중인 공고가 없어요').count()) === 1 && (await p.locator('[data-no-live]').count()) === 0)
  ok("링크 미리보기: '공고가 올라오면 여기에서 바로 지원할 수 있어요'", (await metaDesc()) === '공고가 올라오면 여기에서 바로 지원할 수 있어요', await metaDesc())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
