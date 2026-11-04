// 묶음 28: 여러 회사를 맡은 관리자 — 다른 회사에 온 새 문의 (대시보드 안내 · 회사 고르기 점·'새 문의 N') → 눌러서 그 회사로
//          지난 근무 합계 숫자가 0에서 올라가며 나타남
// node scripts/qa/batch28.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
let fails = 0
// 오늘(한국 시간) 10:00~14:00 근무 — 공고 시간(09~18시) 안이라 언제 돌려도 4시간으로 계산됨 (지금-4시간이면 저녁 6시 뒤엔 0분이 됨)
const inShift = () => { const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); return { clock_in: `${d}T01:00:00.000Z`, clock_out: `${d}T05:00:00.000Z` } }
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 두 번째 회사 + 그 회사로 온 안 읽은 근무자 문의 2건
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null, created_at: new Date().toISOString() })
  for (const body of ['내일 주차 되나요?', '복장 문의드려요']) {
    await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, job_id: null, company_id: C2, body, read_at: null, created_at: new Date().toISOString() })
  }

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 다른 회사 새 문의 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin`)
  const notice = ad.locator('[data-other-companies]')
  await notice.waitFor({ timeout: 10000 }).catch(() => {})
  ok('대시보드: 다른 회사에 새 문의 (새내기행사 2)', (await notice.count()) === 1 && /새내기행사\s*2/.test(await notice.innerText()), await notice.innerText().catch(() => ''))
  ok('회사 고르기: 빨간 점', (await ad.locator('header [data-other-unread]').count()) === 1)
  const opt = await ad.locator(`header select[name=company] option[value="${C2}"]`).innerText()
  ok("회사 고르기 목록: '새내기행사 · 새 문의 2'", opt.includes('새내기행사') && opt.includes('새 문의 2'), opt)
  ok('지금 보는 회사에는 표시 없음', !(await ad.locator(`header select[name=company] option[value="${C1}"]`).innerText()).includes('새 문의'))
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // 누르면 그 회사로
  await notice.getByRole('button', { name: /새내기행사/ }).click()
  await ad.waitForFunction((c2) => document.querySelector('header select[name=company]')?.value === c2, C2, { timeout: 10000 }).catch(() => {})
  ok('누르면 그 회사 화면으로', (await ad.locator('header select[name=company]').inputValue()) === C2)
  ok('그 회사 확인할 일에 새 문의 2건', /새 문의[\s\S]*2건/.test(await ad.locator('section', { hasText: '✅ 확인할 일' }).innerText().catch(() => '')))
  // 기본 회사에도 안 읽은 근무자 문의가 1건 있으므로, 이제는 기본 회사가 '다른 회사'로
  ok("이번엔 기본 회사가 '다른 회사 새 문의'에", /주식회사 테스트\s*1/.test(await ad.locator('[data-other-companies]').innerText().catch(() => '')))

  // 한 회사만 맡은 관리자라면 안내 없음 (회사 하나)
  await rest(`companies?id=eq.${C2}`, 'PATCH', { active: false })
  await ad.goto(`${D}/admin`)
  ok('회사가 하나면 안내 없음', (await ad.locator('[data-other-companies]').count()) === 0)

  // ── 2. 지난 근무 합계 숫자 올라가기 ──
  const w = await pg(W)
  await rest(`attendance?user_id=eq.${W}`, 'PATCH', inShift())
  // 화면이 그려지는 처음부터 실수령 숫자를 모두 기록 (서버가 바쁘면 올라가기가 금방 끝나 버려서)
  await w.addInitScript(() => {
    window.__seen = []
    new MutationObserver(() => {
      const el = document.querySelector('[data-summary=실수령] [data-value]')
      if (el) window.__seen.push(Number(el.textContent.replace(/,/g, '')))
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  await w.goto(`${D}/me/history`)
  const money = w.locator('[data-summary=실수령] [data-value]')
  await money.waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForTimeout(1200)
  const target = Number(await money.getAttribute('data-value'))
  const seen = await w.evaluate(() => window.__seen)
  const early = Math.min(...seen)
  const late = Number((await money.innerText()).replace(/,/g, ''))
  ok('실수령 숫자가 올라가며 나타남 (처음엔 작고 끝엔 실제 금액)', target > 0 && early < target && late === target, `${early} → ${late} / ${target}`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
