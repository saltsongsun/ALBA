// 묶음 264 (정기 개선 2026-11-15 18:35 KST)
// · 공고 지원 칸: 처음 지원하는 회사면 지원 버튼 위에 '[회사]에 처음 지원해요 · 지원하면 이 회사 담당자가 내 정보를 봐요'
//   (여러 회사가 함께 쓰는 앱 — 지원하면 그 회사가 내 연락처·계좌를 보게 되는 것을 지원 전에 알림 · '내 정보를 보는 회사'와 같은 기준)
//   이미 지원한 적 있는 회사 공고엔 안 나옴 · 지원하고 나면 내 정보의 '보는 회사'에 그 회사가 들어감
// · 회사 화면 맨 위: 건물 이모지 대신 회사 이름 첫 글자 (문의함·내 정보와 같은 표시)
// · 회사 설정 '근무자에게 이렇게 보여요' 미리보기도 첫 글자 — 상호를 고치면 바로 바뀌고 첫 글자가 바뀔 때 한 번 톡
// node scripts/qa/batch264.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-0000002640c2'
const J2 = 'cccccccc-0000-4000-8000-0000002640d2', J4 = 'cccccccc-0000-4000-8000-0000002640d4'
const NEW = 'bbbbbbbb-0000-4000-8000-000000026401'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // J를 내일~모레로 (오늘 근무가 끝났어도 지원 칸이 보이게) · 같은 회사 다른 공고 J4 · 다른 회사 '새봄이벤트'의 공고 J2
  const patch = { start_date: kst(1), end_date: kst(2), status: 'open' }
  await rest(`jobs?id=eq.${J}`, 'PATCH', patch)
  for (const app of await rest(`applications?job_id=eq.${J}`)) await rest(`applications?id=eq.${app.id}`, 'PATCH', { job: { ...app.job, ...patch } })
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새봄이벤트', contact_phone: '01055556666' })
  await rest('jobs', 'POST', { ...base, id: J2, company_id: C2, title: '새봄 축제 안내 스태프', ...patch })
  await rest('jobs', 'POST', { ...base, id: J4, title: '같은 회사 다른 행사', ...patch })
  // 사진이 있는 새 근무자 (지원한 회사 없음)
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: NEW, name: '새내기', phone: '01026402640', photo_at: new Date().toISOString(), created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  const as = async (u) => { await ctx.clearCookies(); await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }]) }
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const note = p.locator('[data-first-company]')

  // ── 1. 새 근무자: 처음 지원하는 회사 안내
  await as(NEW)
  await p.goto(`${D}/jobs/${J}`, { waitUntil: 'networkidle' })
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  const lines = await note.locator('span.min-w-0').evaluate((el) => ({ t: el.firstChild?.parentElement?.innerText, h: [...el.querySelectorAll('b, span')].map((x) => Math.round(x.getBoundingClientRect().height)) })).catch(() => null)
  ok("'주식회사 테스트에 처음 지원해요' · '지원하면 이 회사 담당자가 내 정보를 봐요'", one(await note.textContent().catch(() => '')) === '주식회사 테스트에 처음 지원해요지원하면 이 회사 담당자가 내 정보를 봐요', one(await note.textContent().catch(() => '')))
  const form = note.locator('xpath=ancestor::form[1]')
  ok('지원 버튼 바로 위', await note.evaluate((el) => !!el.nextElementSibling?.matches('button, [type=submit]') || !!el.nextElementSibling?.querySelector('button')).catch(() => false))
  const subH = await note.locator('span.block').evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 99)
  ok('안내 둘째 줄은 한 줄 · 360px 옆으로 안 밀림', subH < 22 && (await noSide(p)), `${subH}px ${JSON.stringify(lines?.h ?? [])}`)
  if (SHOTS) {
    await note.evaluate((el) => el.closest('form').scrollIntoView({ block: 'end' }))
    await p.evaluate(() => scrollBy(0, 90))
    await p.waitForTimeout(400)
    const bx = await form.boundingBox()
    if (bx) await p.screenshot({ path: `${SHOTS}/apply-first-company.png`, clip: { x: 0, y: Math.max(0, bx.y + bx.height - 260), width: 360, height: 270 } }).catch(() => {})
  }

  // ── 2. 지원하면 안내가 사라지고 내 정보 '보는 회사'에 들어감
  const btn = form.locator('button[type=submit]').last()
  await btn.click()
  await p.waitForTimeout(300)
  await btn.click()
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(800)
  const apps = await rest(`applications?job_id=eq.${J}&user_id=eq.${NEW}`)
  ok('지원됨', Array.isArray(apps) && apps.length === 1, JSON.stringify(apps?.map?.((a) => a.status)))
  await p.goto(`${D}/jobs/${J4}`, { waitUntil: 'networkidle' })
  ok('지원한 회사의 다른 공고엔 안내 없음', (await p.locator('form button[type=submit]').count()) > 0 && (await note.count()) === 0)
  await p.goto(`${D}/me/profile`, { waitUntil: 'networkidle' })
  ok("내 정보 '보는 회사 1곳' · 첫 글자 '테'", one(await p.locator('[data-seen-count]').textContent().catch(() => '')) === '1곳' && JSON.stringify((await p.locator('[data-seen-marks] [data-company-mark]').allTextContents()).map(one)) === '["테"]')

  // ── 3. 이미 지원한 근무자도 다른 회사 공고에선 안내 (사진이 있어야 지원 칸이 보임)
  await rest(`users?id=eq.${W}`, 'PATCH', { photo_at: new Date().toISOString() })
  await as(W)
  await p.goto(`${D}/jobs/${J2}`, { waitUntil: 'networkidle' })
  await note.waitFor({ timeout: 15000 }).catch(() => {})
  ok("다른 회사 공고: '새봄이벤트에 처음 지원해요'", one(await note.locator('b').textContent().catch(() => '')) === '새봄이벤트')
  await p.goto(`${D}/jobs/${J4}`, { waitUntil: 'networkidle' })
  ok('지원한 적 있는 회사 공고엔 안내 없음', (await note.count()) === 0)

  // ── 4. 회사 화면 맨 위: 회사 첫 글자
  await p.goto(`${D}/?co=${C1}`, { waitUntil: 'networkidle' })
  const head = p.locator('section.card').filter({ has: p.locator('[data-company-sub]') }).first()
  ok("회사 화면 맨 위: '🏢' 대신 '테'", one(await head.locator('[data-company-mark]').first().textContent().catch(() => '')) === '테' && !(await head.innerText().catch(() => '')).includes('🏢'))
  if (SHOTS) await head.screenshot({ path: `${SHOTS}/company-page-mark.png` }).catch(() => {})

  // ── 5. 회사 설정 미리보기: 첫 글자가 상호 따라 바뀜 + 한 번 톡
  await as(A)
  await p.goto(`${D}/admin/settings`, { waitUntil: 'networkidle' })
  const pv = p.locator('[data-worker-preview]')
  await pv.waitFor({ timeout: 15000 }).catch(() => {})
  const mark = pv.locator('[data-company-mark]')
  ok("미리보기 첫 글자 '테'", one(await mark.textContent().catch(() => '')) === '테')
  const name = p.locator('input[name=company_name]')
  await name.fill('')
  await name.pressSequentially('봄날기획', { delay: 10 })
  await p.waitForTimeout(80)
  const st = await mark.evaluate((el) => ({ t: el.textContent, a: getComputedStyle(el).animationName, d: getComputedStyle(el).animationDuration })).catch(() => null)
  ok("상호를 '봄날기획'으로 고치면 '봄' · 톡 (0.32초)", st?.t === '봄' && st.a === 'pop' && parseFloat(st.d) <= 0.32, JSON.stringify(st))
  ok('미리보기 바탕은 흰색 하나 (겹친 바탕색 없음)', ((await mark.getAttribute('class')) ?? '').split(/\s+/).filter((c) => c.startsWith('bg-')).length === 1)
  if (SHOTS) {
    await pv.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(400)
    await pv.screenshot({ path: `${SHOTS}/settings-preview-mark.png` }).catch(() => {})
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
