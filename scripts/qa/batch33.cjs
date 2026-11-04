// 묶음 33: 회사를 바꿔도 보던 메뉴에 그대로 (공고·근무자 한 명처럼 회사마다 다른 화면이면 그 목록으로) + 'OO 화면으로 바꿨어요' 안내
//          · 정해 둔 메뉴만 (다른 주소로 보내는 값은 무시하고 홈으로)
//          휴대폰 키보드가 올라와 있는 동안 아래 탭을 숨기고 대화 입력칸이 키보드 바로 위로 (근무자·관리자) · 키보드가 내려가면 다시 · 컴퓨터는 그대로
// node scripts/qa/batch33.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

;(async () => {
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새내기행사', seal_image: null, created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const sel = (p) => p.locator('header select[name=company]')
  const switchTo = async (p, id) => {
    await sel(p).waitFor({ timeout: 10000 }).catch(() => {})
    await p.waitForLoadState('networkidle').catch(() => {})
    await sel(p).selectOption(id)
    // (고르기 칸 값은 바로 바뀌므로, 서버에서 돌아온 안내가 보일 때까지 기다림)
    await p.getByText('화면으로 바꿨어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  }
  const path = (p) => new URL(p.url()).pathname

  // ── 1. 회사 바꾸기: 보던 메뉴에 그대로 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/workers`)
  await switchTo(ad, C2)
  ok('근무자 메뉴에서 바꾸면 근무자 메뉴 그대로', path(ad) === '/admin/workers', ad.url())
  ok("'새내기행사 화면으로 바꿨어요' 안내", await see(ad, '새내기행사 화면으로 바꿨어요'))
  await ad.goto(`${D}/admin/chat`)
  await switchTo(ad, C1)
  ok('문의 메뉴에서 바꾸면 문의 메뉴 그대로 + 안내', path(ad) === '/admin/chat' && (await see(ad, '주식회사 테스트 화면으로 바꿨어요')))
  // 회사마다 다른 화면(공고 하나)이면 그 목록으로
  await ad.goto(`${D}/admin/jobs/${J}`)
  await switchTo(ad, C2)
  ok('공고 하나를 보다 바꾸면 공고 목록으로 (없는 화면 대신)', path(ad) === '/admin/jobs', ad.url())
  ok('공고 목록에도 안내', await see(ad, '새내기행사 화면으로 바꿨어요'))
  // 홈(대시보드)은 홈 그대로
  await ad.goto(`${D}/admin`)
  await switchTo(ad, C1)
  ok('홈에서 바꾸면 홈', path(ad) === '/admin')
  // 다른 주소로 보내는 값은 무시
  await ad.goto(`${D}/admin/workers`)
  await sel(ad).waitFor({ timeout: 10000 }).catch(() => {})
  await ad.waitForLoadState('networkidle').catch(() => {})
  await ad.evaluate(() => { document.querySelector('header form input[name=back]').value = 'https://evil.example/admin/jobs' })
  await sel(ad).selectOption(C2)
  await ad.getByText('화면으로 바꿨어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('바깥 주소는 무시하고 홈으로', new URL(ad.url()).origin === new URL(D).origin && path(ad) === '/admin', ad.url())
  await ad.goto(`${D}/admin/workers`)
  await sel(ad).waitFor({ timeout: 10000 }).catch(() => {})
  await ad.waitForLoadState('networkidle').catch(() => {})
  await ad.evaluate(() => { document.querySelector('header form input[name=back]').value = '/admin/../me/profile' })
  await sel(ad).selectOption(C1)
  await ad.getByText('화면으로 바꿨어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('정해 둔 메뉴가 아니면 홈으로', path(ad) === '/admin', ad.url())
  ok('360px: 안내가 보여도 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 휴대폰 키보드: 아래 탭 숨기고 입력칸을 키보드 바로 위로 ──
  const kb = async (p, label, navSel, composerSel) => {
    await p.locator(composerSel).first().waitFor({ timeout: 10000 }).catch(() => {})
    await p.waitForLoadState('networkidle').catch(() => {})
    ok(`${label}: 휴대폰(터치)으로 인식`, await p.evaluate(() => matchMedia('(pointer: coarse)').matches))
    const navVis = () => p.evaluate((s) => getComputedStyle(document.querySelector(s)).visibility, navSel)
    ok(`${label}: 처음엔 아래 탭 보임`, (await navVis()) === 'visible' && (await p.evaluate(() => !('kb' in document.documentElement.dataset))))
    // 입력칸 없이 화면만 줄면(회전 등) 그대로
    await p.setViewportSize({ width: 360, height: 420 })
    await p.waitForTimeout(300)
    ok(`${label}: 입력 중이 아니면 화면이 줄어도 아래 탭 그대로`, (await p.evaluate(() => !('kb' in document.documentElement.dataset))) && (await navVis()) === 'visible')
    await p.setViewportSize({ width: 360, height: 740 })
    await p.waitForTimeout(300)
    // 입력칸을 누르고 키보드가 올라옴 (화면 높이가 줄어듦)
    await p.locator(`${composerSel} textarea`).first().focus()
    await p.waitForTimeout(150)
    await p.setViewportSize({ width: 360, height: 420 })
    await p.waitForFunction(() => 'kb' in document.documentElement.dataset, null, { timeout: 3000 }).catch(() => {})
    await p.waitForTimeout(400)
    ok(`${label}: 키보드가 올라오면 아래 탭 숨김`, (await p.evaluate(() => 'kb' in document.documentElement.dataset)) && (await navVis()) === 'hidden')
    const gap = await p.locator(composerSel).first().evaluate((el) => innerHeight - el.getBoundingClientRect().bottom)
    ok(`${label}: 입력칸이 키보드(화면 아래) 바로 위로`, gap >= 0 && gap <= 24, `아래 여백 ${Math.round(gap)}px`)
    ok(`${label}: 옆으로 안 밀림`, await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
    // 키보드가 내려감
    await p.evaluate(() => document.activeElement?.blur())
    await p.setViewportSize({ width: 360, height: 740 })
    await p.waitForFunction(() => !('kb' in document.documentElement.dataset), null, { timeout: 3000 }).catch(() => {})
    await p.waitForTimeout(400)
    const box = await p.locator(navSel).boundingBox()
    ok(`${label}: 키보드가 내려가면 아래 탭이 다시 화면 아래에`, (await navVis()) === 'visible' && !!box && Math.abs(box.y + box.height - 740) <= 2, JSON.stringify(box))
  }
  const w = await pg(W)
  await w.goto(`${D}/me/chat?co=${C1}`)
  await kb(w, '근무자 문의', 'nav[data-bottom-nav]', 'form:has(textarea[name=body])')
  await ad.goto(`${D}/admin/chat/${W}`)
  await kb(ad, '관리자 답장', 'nav[data-admin-tabbar]', 'form:has(textarea[name=body])')

  // 컴퓨터(마우스)는 그대로
  const desk = await pg(W, { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } })
  await desk.goto(`${D}/me/chat?co=${C1}`)
  await desk.locator('textarea[name=body]').first().focus().catch(() => {})
  await desk.setViewportSize({ width: 1280, height: 400 })
  await desk.waitForTimeout(400)
  ok('컴퓨터: 키보드 숨김 동작 없음', await desk.evaluate(() => !('kb' in document.documentElement.dataset)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
