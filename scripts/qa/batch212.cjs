// 묶음 212 (정기 개선 2026-11-12 08:35 KST)
// · 현장 담당 번호가 없는 공고: 근무자에게 회사 문의 담당자(회사 설정의 문의 연락처)를 대신 보여 줌
//   - 내 근무 '오늘의 근무' 카드: '회사 담당 김담당 · 전화 · 문자' (현장 담당 번호가 있으면 전처럼 '현장 담당 …')
//   - 공고 화면 '담당자' 줄: '회사 담당 김담당 010-… · 전화 · 문자' (로그인한 회원에게만 — 비회원에겐 번호 없음)
// · 서류(서명) 화면을 여는 동안 같은 모양의 불러오는 화면 (돌아가기 줄 · 회사 줄 · 서류 종이 · 서명 칸)
// node scripts/qa/batch212.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000212'
const J4 = 'cccccccc-0000-4000-8000-00000000c212', APP4 = '11111111-0000-4000-8000-00000000a212'
const J4T = '새벽 주차 안내 (담당 번호 없음)'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  // 준비: 다른 회사(문의 담당 김담당 010-7777-0212) · 오늘 공고인데 현장 담당 번호 없음 · 근무자 확정
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새벽행사', contact_name: '김담당', contact_phone: '01077770212', company_phone: null, seal_image: null, created_at: nowIso })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const j4 = { ...j1, id: J4, company_id: C2, company: { company_name: '새벽행사' }, title: J4T, manager_name: null, manager_phone: null, applications: [], required_docs: [] }
  await rest('jobs', 'POST', j4)
  const [a1] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...a1, id: APP4, job_id: J4, company_id: C2, status: 'approved', position: null, available_dates: null, job: j4, created_at: nowIso })
  const att0 = await rest(`attendance?user_id=eq.${W}`)

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W)

  // ── 1. 내 근무 '오늘의 근무': 현장 담당 번호가 없으면 회사 담당
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const card = (t) => w.locator('#today-work .card', { hasText: t }).first()
  await card(J4T).waitFor({ timeout: 15000 }).catch(() => {})
  const coLine = card(J4T).locator('[data-today-contact]')
  const coTel = await card(J4T).locator('a[href^="tel:"]').first().getAttribute('href').catch(() => null)
  ok("번호 없는 공고: '회사 담당 김담당' + 전화(회사 문의 번호)", (await coLine.getAttribute('data-today-contact').catch(() => '')) === 'company' && one(await coLine.innerText().catch(() => '')) === '회사 담당 김담당' && coTel === 'tel:01077770212', `${one(await coLine.innerText().catch(() => ''))} ${coTel}`)
  ok('문자 버튼도 같은 번호', (await card(J4T).locator('a[href^="sms:"]').first().getAttribute('href').catch(() => '') ?? '').includes('01077770212'))
  const siteLine = card('경상남도').locator('[data-today-contact]')
  ok("번호 있는 공고는 전처럼 '현장 담당 담당'", (await siteLine.getAttribute('data-today-contact').catch(() => '')) === 'site' && one(await siteLine.innerText().catch(() => '')) === '현장 담당 담당')
  ok('360px 옆으로 안 밀림 (내 근무)', await noSide(w))
  if (SHOTS) await card(J4T).screenshot({ path: `${SHOTS}/today-company-contact.png` }).catch(() => {})

  // ── 2. 공고 화면 '담당자' 줄
  await w.goto(`${D}/jobs/${J4}`, { waitUntil: 'networkidle' })
  const mc = w.locator('[data-manager-contact="company"]')
  await mc.waitFor({ timeout: 15000 }).catch(() => {})
  ok("공고 화면: '회사 담당 김담당 010-7777-0212' + 전화·문자", one(await mc.innerText().catch(() => '')).startsWith('회사 담당 김담당 010-7777-0212') && (await mc.locator('a[href="tel:01077770212"]').count()) === 1, one(await mc.innerText().catch(() => '')))
  ok('담당자 줄: 이름·번호 한 줄 · 화면 안 · 옆으로 안 밀림', (await mc.locator('span').first().evaluate((el) => el.getBoundingClientRect().height < 26 && el.getBoundingClientRect().right <= innerWidth - 8)) && (await noSide(w)))
  if (SHOTS) await mc.screenshot({ path: `${SHOTS}/job-company-contact.png` }).catch(() => {})
  await w.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  await w.locator('[data-manager-contact]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('번호 있는 공고는 전처럼 현장 담당 번호', (await w.locator('[data-manager-contact="company"]').count()) === 0 && one(await w.locator('[data-manager-contact]').first().innerText().catch(() => '')).startsWith('담당 010-5555-6666'))
  const g = await mk(null)
  await g.goto(`${D}/jobs/${J4}`, { waitUntil: 'networkidle' })
  await g.waitForTimeout(300)
  ok('비회원에게는 회사 번호를 보여 주지 않음', (await g.locator('[data-manager-contact]').count()) === 0 && !(await g.locator('body').innerText()).includes('010-7777-0212'))

  // ── 3. 서류(서명) 화면을 여는 동안: 같은 모양의 불러오는 화면
  await rest(`attendance?user_id=eq.${W}`, 'DELETE') // 출근 전 → 오늘의 근무 카드에 '서명 ›'
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const sign = w.locator('[data-sign-before-start]').first()
  await sign.waitFor({ timeout: 15000 }).catch(() => {})
  // 서류 화면 응답을 1.5초 늦춤 (느린 휴대폰 망처럼)
  await w.route('**/docs/**', async (route) => {
    if (route.request().headers()['rsc'] === '1') await new Promise((r) => setTimeout(r, 1500))
    await route.continue().catch(() => {})
  })
  await sign.click()
  const sk = w.locator('[data-skeleton="doc"]')
  const shown = await sk.waitFor({ timeout: 1400 }).then(() => true, () => false)
  ok('누르자마자 서류 모양의 불러오는 화면 (돌아가기 줄 · 서류 종이 · 서명 칸)', shown && (await sk.locator('.card').count()) === 2 && (await sk.locator('.border-dashed').count()) === 1)
  if (SHOTS && shown) await w.screenshot({ path: `${SHOTS}/doc-skeleton.png`, clip: { x: 0, y: 0, width: 360, height: 740 } }).catch(() => {})
  ok('불러오는 화면도 360px 옆으로 안 밀림', await noSide(w))
  await w.waitForURL(/\/docs\//, { timeout: 15000 }).catch(() => {})
  ok('다 불러오면 서명 화면으로 바뀜', await w.locator('canvas').first().waitFor({ timeout: 15000 }).then(() => true, () => false) && (await sk.count()) === 0)
  await w.unroute('**/docs/**')

  // 정리
  for (const a of att0) await rest('attendance', 'POST', a)
  await rest(`applications?id=eq.${APP4}`, 'DELETE')
  await rest(`jobs?id=eq.${J4}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
