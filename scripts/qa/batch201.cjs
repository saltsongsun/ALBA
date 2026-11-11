// 묶음 201 (정기 개선 2026-11-11 18:35 KST)
// · 회사 공고 모음 링크(/?co=회사)로 가입한 직후: 그 회사 화면에 '🎉 가입이 끝났어요 · 아직 지원한 공고는 없어요' + 다음 할 일 하나
//   - 지원받는 공고가 1개면 그 공고로 바로 가는 버튼 · 여러 개면 '지원받는 공고 n개 보기 ↓' · 없으면 버튼 없이 안내만
//   - 이미 지원한 사람·비회원·회사 화면이 아닌 곳에는 안 보임 (공고 링크로 가입하면 전처럼 공고 화면 안내)
// · 회사 공고 모음의 공고 카드: 회사 이름 줄을 카드마다 되풀이하지 않음 (위 카드에 이미 있음) — 전체 공고에서는 그대로
// · 공고가 하나도 없는 회사: 같은 문장('지금은 모집 중인 공고가 없어요')을 두 번 쓰지 않음
// node scripts/qa/batch201.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const FACE = path.join(__dirname, 'face.jpg')
const J = 'cccccccc-0000-4000-8000-000000000003', AP = '33333333-0000-4000-8000-000000000011'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const J3 = 'cccccccc-0000-4000-8000-0000000000c3'
const TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const enc = encodeURIComponent
const kst = (plus = 0) => new Date(Date.now() + 9 * 3600e3 + plus * 864e5).toISOString().slice(0, 10)
const text = async (l) => ((await l.innerText({ timeout: 8000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()

;(async () => {
  // 시각과 상관없이 지원할 수 있게: 공고를 모레까지로 (오늘 근무가 끝난 저녁에도 '지원받는 공고')
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: kst(2), status: 'open' })
  // 회사2 = 공고가 하나도 없는 회사
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, verified: false, created_at: '2026-10-15T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const CO = `/?co=${C1}`
  const join = async (p, { name, phone, rrn2 }) => {
    await p.locator('input[name=rrn1]').waitFor({ timeout: 15000 })
    await p.locator('input[name=name]').fill(name)
    await p.locator('input[name=rrn1]').fill('990315')
    await p.locator('input[name=rrn2]').fill(rrn2)
    await p.locator('input[name=phone]').fill(phone)
    await p.locator('input[name=pin]').fill('583920')
    await p.locator('input[name=pin2]').fill('583920')
    for (const n of ['agree_privacy', 'agree_third', 'agree_rrn']) await p.locator(`input[name=${n}]`).check()
    await p.locator('[data-photo-field] input[type=file]').last().setInputFiles(FACE)
    await p.locator('[data-photo-field] img[alt="내 사진"]').waitFor({ timeout: 8000 }).catch(() => {})
    await p.getByRole('button', { name: /아르바이트로 가입하기/ }).last().click()
  }

  // ── 1. 회사 링크로 실제 가입 → 그 회사 화면 + 가입 완료 안내 (공고 1개: 바로 가는 버튼)
  const g = await pg(null)
  await g.goto(`${D}/signup?type=worker&next=${enc(CO)}`)
  await join(g, { name: '새가입', phone: '010-7777-0201', rrn2: '1234567' })
  await g.waitForURL((u) => new URL(u).pathname === '/', { timeout: 20000 }).catch(() => {})
  const u1 = new URL(g.url())
  ok('가입하면 그 회사 공고 모음으로 돌아옴 (joined=1)', u1.pathname === '/' && u1.searchParams.get('co') === C1 && u1.searchParams.get('joined') === '1', g.url())
  const jb = g.locator('[data-co-joined]')
  await jb.waitFor({ timeout: 15000 }).catch(() => {})
  const t1 = await text(jb)
  ok("'🎉 가입이 끝났어요 · 아직 지원한 공고는 없어요'", t1.startsWith('🎉 가입이 끝났어요 아직 지원한 공고는 없어요. 내용을 보고 함께하고 싶으면 지원해 주세요.'), t1)
  const go = jb.locator('[data-co-joined-go]')
  ok('지원받는 공고가 1개면 그 공고로 바로 가는 버튼 (제목 + 보기 →)', (await go.getAttribute('href').catch(() => '')) === `/jobs/${J}` && (await text(go)).endsWith('보기 →') && (await text(go)).includes('경상남도'), await text(go))
  await g.waitForTimeout(500)
  ok('버튼 한 줄(긴 제목은 줄임) · 누르기 쉬운 높이 · 옆으로 안 밀림', (await go.evaluate((el) => { const r = el.getBoundingClientRect(); return r.height >= 40 && r.height < 48 && r.right <= innerWidth - 16 }).catch(() => false)) && (await noSide(g)))
  ok('톡 나타남 (animate-pop)', ((await jb.getAttribute('class')) ?? '').includes('animate-pop'))
  ok("아래 회사 카드는 '내 근무 보기' (지원 전이라 '내 지원' 줄 없음)", (await g.locator('[data-company-mine]').count()) === 0 && (await g.getByRole('link', { name: /새가입님 내 근무 보기 →/ }).count()) === 1)
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/company-joined-one.png`, clip: { x: 0, y: 0, width: 360, height: 620 } }).catch(() => {})

  // ── 2. 회사 화면의 공고 카드: 회사 이름 줄을 되풀이하지 않음 (전체 공고에서는 그대로)
  const card = g.locator('#jobs ~ .stagger a.card-link', { hasText: TITLE }).first()
  ok('회사 화면 카드: 회사 이름 줄 없음', (await card.count()) === 1 && !(await card.innerText()).includes('🏢'), (await card.innerText().catch(() => '')).replace(/\n+/g, ' / ').slice(0, 90))
  ok('회사 이름은 위 카드에 한 번', (await g.getByText('주식회사 테스트', { exact: true }).count()) === 1)

  // 버튼을 누르면 그 공고 화면
  await go.click()
  await g.waitForURL((u) => new URL(u).pathname === `/jobs/${J}`, { timeout: 15000 }).catch(() => {})
  ok('버튼 → 그 공고 화면', new URL(g.url()).pathname === `/jobs/${J}`, g.url())
  await g.goto(`${D}/`, { waitUntil: 'networkidle' })
  const allCard = g.locator('#jobs ~ .stagger a.card-link', { hasText: TITLE }).first()
  ok('전체 공고 카드에는 회사 이름 그대로', ((await allCard.innerText().catch(() => '')) ?? '').includes('🏢 주식회사 테스트'))
  ok('회사 화면이 아니면 가입 안내 없음 (/?joined=1)', await g.goto(`${D}/?joined=1`, { waitUntil: 'networkidle' }).then(async () => (await g.locator('[data-co-joined]').count()) === 0))

  // ── 3. 지원받는 공고가 여러 개: '지원받는 공고 n개 보기 ↓' → 목록으로
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J3, title: '주말 무대 설치 보조', start_date: kst(3), end_date: kst(4), applications: [], required_docs: [] })
  await g.goto(`${D}${CO}&joined=1`, { waitUntil: 'networkidle' })
  const t3 = await text(g.locator('[data-co-joined]'))
  const go3 = g.locator('[data-co-joined-go]')
  ok("여러 개: '아래에서 … 골라 지원' + '지원받는 공고 2개 보기 ↓'", t3.includes('아래에서 함께하고 싶은 공고를 골라 지원해 주세요.') && (await text(go3)) === '지원받는 공고 2개 보기 ↓' && (await go3.getAttribute('href')) === '#jobs', t3)
  if (SHOTS) await g.waitForTimeout(600)
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/company-joined-many.png`, clip: { x: 0, y: 0, width: 360, height: 620 } }).catch(() => {})
  await go3.click()
  await g.waitForTimeout(700)
  ok('누르면 공고 목록이 화면 안으로', await g.locator('#jobs').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight - 100 }).catch(() => false))

  // ── 4. 지원받는 공고가 없으면: 버튼 없이 안내만
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'closed' })
  await rest(`jobs?id=eq.${J3}`, 'PATCH', { status: 'closed' })
  await g.goto(`${D}${CO}&joined=1`, { waitUntil: 'networkidle' })
  const t4 = await text(g.locator('[data-co-joined]'))
  ok('지원받는 공고가 없으면: 새 공고가 올라오면 지원할 수 있다고만 (버튼 없음)', t4.includes('지금은 지원받는 공고가 없어요. 새 공고가 올라오면 바로 지원할 수 있어요.') && (await g.locator('[data-co-joined-go]').count()) === 0, t4)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'open' })
  await rest(`jobs?id=eq.${J3}`, 'DELETE')

  // ── 5. 안 보여야 하는 곳
  await g.goto(`${D}${CO}`, { waitUntil: 'networkidle' })
  ok('joined 표시가 없으면 안내 없음 (다시 들어오면 사라짐)', (await g.locator('[data-co-joined]').count()) === 0)
  const ap = await pg(AP)
  await ap.goto(`${D}${CO}&joined=1`, { waitUntil: 'networkidle' })
  ok("이미 지원한 사람: 안내 없이 '내 지원' 줄", (await ap.locator('[data-co-joined]').count()) === 0 && (await ap.locator('[data-company-mine]').count()) === 1)
  const guest = await pg(null)
  await guest.goto(`${D}${CO}&joined=1`, { waitUntil: 'networkidle' })
  ok('비회원: 안내 없음', (await guest.locator('[data-co-joined]').count()) === 0 && (await guest.getByRole('link', { name: '간편 가입' }).count()) === 1)

  // ── 6. 공고 링크로 가입하면 전처럼 공고 화면의 안내 (회사 안내와 섞이지 않음)
  const g2 = await pg(null)
  await g2.goto(`${D}/signup?type=worker&next=${enc(`/jobs/${J}`)}`)
  await join(g2, { name: '공고가입', phone: '010-7777-0202', rrn2: '2234567' })
  await g2.waitForURL((u) => new URL(u).pathname === `/jobs/${J}`, { timeout: 20000 }).catch(() => {})
  const u6 = new URL(g2.url())
  ok('공고 링크로 가입: 그 공고 화면 + 가입 완료 · 아직 지원 전 안내 (전처럼)', u6.pathname === `/jobs/${J}` && u6.searchParams.get('joined') === '1' && (await g2.getByText('가입이 끝났어요').first().waitFor({ timeout: 8000 }).then(() => true, () => false)), g2.url())

  // ── 7. 공고가 하나도 없는 회사: 같은 문장을 두 번 쓰지 않음
  await guest.goto(`${D}/?co=${C2}`, { waitUntil: 'networkidle' })
  const body = (await guest.locator('main').innerText().catch(() => '')) ?? ''
  const no = guest.locator('[data-home-nojobs]')
  ok("빈 회사: 위 카드 '지금은 모집 중인 공고가 없어요' 한 번 + 아래 '새 공고가 올라오면 여기에 보여요'", body.split('지금은 모집 중인 공고가 없어요').length - 1 === 1 && (await text(no)).includes('새 공고가 올라오면 여기에 보여요') && (await no.getByRole('link', { name: '다른 회사 공고 보기 →' }).count()) === 1, (await text(no)).slice(0, 80))
  ok('360px: 옆으로 안 밀림 (빈 회사)', await noSide(guest))
  if (SHOTS) await guest.waitForTimeout(600)
  if (SHOTS) await guest.screenshot({ path: `${SHOTS}/company-empty.png`, clip: { x: 0, y: 0, width: 360, height: 560 } }).catch(() => {})

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})()
