// 묶음 41: 지원·확정한 공고 화면에서 받을 계좌가 없으면 '급여 계좌를 등록해 주세요' → 내 정보 계좌번호 칸으로 바로(커서)
//          (확정: '없으면 지급이 늦어져요' / 지원: '확정되면 바로 필요해요' · 계좌가 있으면·지원 안 했으면 없음) · 내 근무의 계좌 안내도 그 칸으로
//          불러오는 동안 회색 자리: 서류는 서류 모양(doc), 내 정보는 내 정보 모양(profile) · 360px
// node scripts/qa/batch41.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', AP = '33333333-0000-4000-8000-000000000011'
const NEW = 'bbbbbbbb-0000-4000-8000-0000000000b9', DOC = 'dddddddd-0000-4000-8000-000000000004'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, bank_name: null })
  await rest(`users?id=eq.${AP}`, 'PATCH', { bank_account_enc: null, bank_name: null })
  const [wRow] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...wRow, id: NEW, name: '새내기회원', phone: '01012121212', attendance: [], ratings: [], photo_at: new Date().toISOString(), bank_account_enc: null })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('install-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const nudge = (p) => p.locator('[data-account-nudge]')
  const openJob = async (p) => {
    await p.goto(`${D}/jobs/${J}`)
    await p.waitForLoadState('networkidle').catch(() => {})
  }

  // ── 1. 확정된 근무자, 계좌 없음 ──
  const w = await pg(W)
  await openJob(w)
  const t1 = (await nudge(w).innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("확정: '급여 계좌를 등록해 주세요 · 없으면 지급이 늦어져요'", t1.includes('급여 계좌를 등록해 주세요') && t1.includes('없으면 지급이 늦어져요'), t1)
  ok('계좌 안내 → 내 정보 계좌번호 칸', (await nudge(w).getAttribute('href').catch(() => '')) === '/me/profile#bank_account')
  ok('360px: 옆으로 안 밀림 (공고)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await nudge(w).click()
  await w.waitForURL(/\/me\/profile/, { timeout: 10000 }).catch(() => {})
  await w.waitForFunction(() => document.activeElement?.id === 'bank_account', null, { timeout: 8000 }).catch(() => {})
  ok('누르면 계좌번호 칸에 커서', (await w.evaluate(() => document.activeElement?.id)) === 'bank_account', w.url())

  // 내 근무의 '급여 계좌를 등록해 주세요'도 그 칸으로
  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle').catch(() => {})
  const meLink = w.locator('a', { hasText: '급여 계좌를 등록해 주세요' }).first()
  ok("내 근무 '급여 계좌를 등록해 주세요' → 계좌번호 칸", (await meLink.getAttribute('href').catch(() => '')) === '/me/profile#bank_account')

  // 계좌를 등록하면 안내 없음
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_name: 'KB국민은행', bank_account_enc: 'enc:123456789012' })
  await openJob(w)
  await w.locator('text=근무가 확정됐어요').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('계좌가 있으면 안내 없음', (await nudge(w).count()) === 0)

  // ── 2. 지원만 한 사람: '확정되면 바로 필요해요' ──
  const ap = await pg(AP)
  await openJob(ap)
  const t2 = (await nudge(ap).innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("지원: '확정되면 바로 필요해요'", t2.includes('급여 계좌를 등록해 주세요') && t2.includes('확정되면 바로 필요해요'), t2)

  // ── 3. 지원 안 한 회원: 안내 없음 ──
  const nw = await pg(NEW)
  await openJob(nw)
  ok('지원 안 했으면 계좌 안내 없음', (await nudge(nw).count()) === 0)

  // ── 4. 불러오는 동안 회색 자리 모양 ──
  await rest(`users?id=eq.${W}`, 'PATCH', { bank_account_enc: null, bank_name: null })
  await fetch(`${MD}/__latency?ms=400`)
  const watch = (p) => p.evaluate(() => { window.__skel = []; new MutationObserver(() => { document.querySelectorAll('[data-skeleton]').forEach((s) => window.__skel.push(s.getAttribute('data-skeleton'))) }).observe(document.body, { subtree: true, childList: true }) })
  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await watch(w)
  await w.locator('nav[data-bottom-nav] a[href="/me/profile"]').click()
  await w.locator('#account form').waitFor({ timeout: 20000 }).catch(() => {})
  const s1 = await w.evaluate(() => [...new Set(window.__skel)])
  ok("내 정보로 갈 때: 내 정보 모양 회색 자리 (profile)", s1.includes('profile'), JSON.stringify(s1))
  await w.goto(`${D}/me`)
  await w.waitForLoadState('networkidle').catch(() => {})
  await watch(w)
  // 내 근무의 서명할 서류 링크 (화면 안에서 이동)
  const docLink = w.locator(`a[href="/docs/${DOC}"]`).first()
  ok('내 근무에 서명할 서류 링크 있음 (준비)', (await docLink.count()) > 0)
  await docLink.click()
  await w.waitForURL(/\/docs\//, { timeout: 20000 }).catch(() => {})
  await w.locator('#sign').first().waitFor({ timeout: 20000 }).catch(() => {})
  await w.waitForLoadState('networkidle').catch(() => {})
  const s2 = await w.evaluate(() => [...new Set(window.__skel ?? [])])
  ok('서류로 갈 때: 서류 모양 회색 자리 (doc)', s2.includes('doc'), JSON.stringify(s2))
  await fetch(`${MD}/__latency?ms=5`)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
