// 근무가 취소되면 서류(근로계약서 등) 접근을 막고 '관리자에게 문의'로
// 지원 취소 · 확정 되돌림(대기) · 미선발 → 서명한 서류도 근무자는 못 엶 (관리자는 봄), 다시 확정되면 다시 열림
// node scripts/qa/doc-access.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const WK = 'bbbbbbbb-0000-4000-8000-000000000002', A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
const APP = '11111111-0000-4000-8000-000000000008'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (path, method = 'GET', body) => fetch(`${MD}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const setApp = (status) => rest(`applications?id=eq.${APP}`, 'PATCH', { status })
const LOCK = '관리자에게 문의해 주세요'
;(async () => {
  const b = await chromium.launch()
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message))
    return p
  }
  const errs = []
  const w = await pg(WK)
  const ad = await pg(A)

  // 1. 확정된 동안: 서명한 서류·서명할 서류 모두 열림
  await w.goto(`${D}/docs/${DOC_SIGNED}`)
  ok('확정 중: 서명한 서류 열림', (await w.locator('article.print-sheet').count()) === 1 && !(await see(w, LOCK, 800)))
  await w.goto(`${D}/docs/${DOC}`)
  ok('확정 중: 서명할 서류 열림', await see(w, '서명하고 제출하기'))

  // 2. 서명 화면을 열어 둔 사이 근무가 취소되면 제출해도 서명 안 됨
  await w.locator('canvas').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const box = await w.locator('canvas').boundingBox()
  await w.mouse.move(box.x + 30, box.y + 100)
  await w.mouse.down()
  for (let i = 1; i <= 12; i++) await w.mouse.move(box.x + 30 + i * 18, box.y + 100 + (i % 2 ? -30 : 30))
  await w.mouse.up()
  await w.locator('input[name=agree]').check()
  await setApp('cancelled')
  await w.getByRole('button', { name: '서명하고 제출하기' }).click()
  ok('취소 뒤 제출: 막힘 안내', await see(w, '근무가 취소된 서류예요. 관리자에게 문의해 주세요.'))
  ok('취소 뒤 제출: 서명 안 됨', (await rest(`signed_docs?id=eq.${DOC}`))[0].status === 'pending')

  // 3. 지원 취소: 서명한 서류도 못 엶 → 관리자 문의 (내용·서명 없음)
  await w.goto(`${D}/docs/${DOC_SIGNED}`)
  ok('지원 취소: 관리자 문의 화면', await see(w, LOCK))
  ok('지원 취소: 서류 내용 안 보임', (await w.locator('article.print-sheet').count()) === 0)
  const ask = w.getByRole('link', { name: '💬 담당자에게 문의' })
  ok('문의 버튼: 그 공고 문의로', ((await ask.getAttribute('href')) || '').endsWith(`/me/chat?job=${J}`))
  await w.goto(`${D}/docs/${DOC}`)
  ok('지원 취소: 서명할 서류도 못 엶', (await see(w, LOCK)) && !(await see(w, '서명하고 제출하기', 800)))

  // 4. 내 근무 목록: 서명한 서류는 '🔒 관리자 문의'로, 서명할 서류 안내는 없음
  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle')
  ok('내 근무: 서명할 서류 안내 없음', !(await see(w, /서명할 서류가 \d+건/, 1000)))
  const row = w.locator('a', { hasText: '서약서' }).filter({ hasText: '관리자 문의' })
  ok('내 근무: 서명한 서류 🔒 관리자 문의', (await row.count()) >= 1)
  ok('잠긴 서류 줄: 문의로 연결', ((await row.first().getAttribute('href')) || '').includes(`/me/chat?job=${J}`))
  await w.goto(`${D}/me/history`)
  await w.waitForLoadState('networkidle')
  const hist = w.getByRole('link', { name: '🔒 서류는 관리자 문의' })
  ok('지난 근무: 서류 버튼 대신 관리자 문의', (await hist.count()) >= 1 && (await w.getByRole('link', { name: '서약서' }).count()) === 0)

  // 5. 관리자는 그대로 봄
  await ad.goto(`${D}/docs/${DOC_SIGNED}`)
  ok('관리자: 취소된 근무자 서류도 봄', (await ad.locator('article.print-sheet').count()) === 1 && !(await see(ad, LOCK, 800)))

  // 6. 확정을 되돌림(대기)·미선발도 같음
  for (const st of ['applied', 'rejected']) {
    await setApp(st)
    await w.goto(`${D}/docs/${DOC_SIGNED}`)
    ok(`${st === 'applied' ? '확정 되돌림(대기)' : '미선발'}: 관리자 문의`, await see(w, LOCK))
  }

  // 7. 다시 확정되면 다시 열림
  await setApp('approved')
  await w.goto(`${D}/docs/${DOC_SIGNED}`)
  ok('다시 확정: 서류 열림', (await w.locator('article.print-sheet').count()) === 1 && !(await see(w, LOCK, 800)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
  process.exit(fails ? 1 : 0)
})()
