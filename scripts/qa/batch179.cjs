// 묶음 179 (정기 개선 2026-11-10 17:35 KST)
// · 공고에서 넘어온 가입·로그인 이어 주기:
//   - /signup?next=/jobs/ID 처럼 유형 없이 와도(로그인 화면의 '가입하기' 등) 공고 종류에 맞는 가입 화면으로 바로
//     ('유형 다시 고르기'를 누르면 고르는 화면 — 다시 튕기지 않음)
//   - 로그인 화면에도 공고 제목 + '로그인하면 이 공고로 돌아가요' (공개된 공고만)
// · 공고 등록: '현장에서만 근무 시작 가능'을 켰는데 행사장 좌표가 없으면 바로 '행사장 위치가 비어 있어요' + '현재 위치로'
//   (저장할 때 막히던 것을 켜는 순간 알려 줌) · 좌표가 들어오면 안내가 사라짐
// · '현재 위치로': 찾는 동안 '찾는 중…'(눌리지 않음) → 들어오면 두 칸에 표시 · 좌표 붙여넣기도 같게
// node scripts/qa/batch179.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, init) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (init) await ctx.addInitScript(init)
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const next = encodeURIComponent(`/jobs/${J}`)

  // ── 1. 유형 없이 공고에서 온 가입 → 알바 가입 화면으로 바로
  const g = await pg(null)
  await g.goto(`${D}/signup?next=${next}`)
  await g.getByRole('heading', { name: '간편 가입' }).waitFor({ timeout: 15000 }).catch(() => {})
  const u1 = new URL(g.url())
  ok('유형 없이 와도 알바 가입 화면으로 바로', u1.pathname === '/signup' && u1.searchParams.get('type') === 'worker' && u1.searchParams.get('next') === `/jobs/${J}` && (await g.locator('[data-signup-for]').count()) === 1, g.url())
  // '유형 다시 고르기' → 고르는 화면 (다시 튕기지 않음)
  const back = g.getByRole('link', { name: '← 유형 다시 고르기' })
  ok("'유형 다시 고르기' 주소에 pick=1", (await back.getAttribute('href').catch(() => '')) === `/signup?pick=1&next=${next}`, await back.getAttribute('href').catch(() => ''))
  await back.click()
  await g.getByRole('heading', { name: '어떤 분이세요?' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('다시 고르기를 누르면 고르는 화면에 머묾', (await g.getByRole('heading', { name: '어떤 분이세요?' }).count()) === 1 && new URL(g.url()).searchParams.get('pick') === '1', g.url())
  ok('고른 뒤에도 그 공고로 돌아가게 (next 유지)', (await g.locator(`a[href="/signup?type=expert&next=${next}"]`).count()) === 1)
  // 공고가 아닌 곳에서 온 가입은 그대로 고르는 화면
  await g.goto(`${D}/signup?next=${encodeURIComponent('/me')}`)
  await g.getByRole('heading', { name: '어떤 분이세요?' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('공고가 아닌 곳에서 오면 고르는 화면 그대로', (await g.getByRole('heading', { name: '어떤 분이세요?' }).count()) === 1)
  // 전문가 의뢰면 전문가 가입 화면
  await rest(`jobs?id=eq.${J}`, 'PATCH', { audience: 'expert' })
  await g.goto(`${D}/signup?next=${next}`)
  await g.getByRole('heading', { name: '전문가 가입' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('전문가 의뢰에서 오면 전문가 가입 화면', new URL(g.url()).searchParams.get('type') === 'expert' && (await g.getByRole('heading', { name: '전문가 가입' }).count()) === 1, g.url())
  await rest(`jobs?id=eq.${J}`, 'PATCH', { audience: 'worker' })

  // ── 2. 로그인 화면: 공고 제목 + '로그인하면 이 공고로 돌아가요'
  await g.goto(`${D}/login?next=${next}`)
  const lf = g.locator('[data-login-for]')
  await lf.waitFor({ timeout: 15000 }).catch(() => {})
  const lt = ((await lf.innerText().catch(() => '')) ?? '').replace(/\n+/g, ' / ').trim()
  ok("로그인 화면: 공고 제목 + '로그인하면 이 공고로 돌아가요'", lt === `${TITLE} / 로그인하면 이 공고로 돌아가요`, lt)
  ok('제목 한 줄(길면 줄임) · 360px 옆으로 안 밀림', (await lf.evaluate((el) => el.querySelector('b').getBoundingClientRect().height < 24 && el.getBoundingClientRect().height < 64)) && (await noSide(g)))
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/login-for-job.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})
  // 로그인 화면의 '1분 만에 가입하기' → 고르기 없이 알바 가입
  await g.getByRole('link', { name: '1분 만에 가입하기' }).click()
  await g.getByRole('heading', { name: '간편 가입' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok("로그인 화면의 '가입하기' → 고르기 없이 알바 가입", new URL(g.url()).searchParams.get('type') === 'worker' && (await g.getByText('어떤 분이세요?').count()) === 0, g.url())
  // 공고 없이 온 로그인 · 공개 전 공고: 표시 없음
  await g.goto(`${D}/login`)
  await g.getByRole('heading', { name: '로그인' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('공고 없이 온 로그인은 그대로', (await g.locator('[data-login-for]').count()) === 0 && (await g.getByText('가입할 때 쓴 휴대폰 번호로 로그인하세요.').count()) === 1)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'draft' })
  await g.goto(`${D}/login?next=${next}`)
  await g.getByRole('heading', { name: '로그인' }).waitFor({ timeout: 15000 }).catch(() => {})
  ok('공개 전 공고는 제목을 보여 주지 않음', (await g.locator('[data-login-for]').count()) === 0)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { status: 'open' })

  // ── 3. 공고 등록: '현장에서만 근무 시작 가능' + 좌표 없음 → 바로 안내
  // (위치는 0.6초 뒤에 들어오게 — '찾는 중…'을 볼 수 있게)
  const a = await pg(A, () => {
    try { navigator.geolocation.getCurrentPosition = (done) => { setTimeout(() => done({ coords: { latitude: 35.189, longitude: 128.0814, accuracy: 5 } }), 600) } } catch {}
  })
  await a.goto(`${D}/admin/jobs/new`)
  const gps = a.locator('input[name=gps_required]')
  await gps.waitFor({ timeout: 15000 }).catch(() => {})
  await a.waitForLoadState('networkidle').catch(() => {})
  const need = a.locator('[data-gps-need]')
  ok('처음엔 안내 없음', (await need.count()) === 0)
  await gps.check()
  await need.waitFor({ timeout: 5000 }).catch(() => {})
  const nt = ((await need.locator('p').innerText().catch(() => '')) ?? '').replace(/\n+/g, ' / ').trim()
  ok("켜면 바로 '행사장 위치가 비어 있어요 / 위도·경도가 있어야 저장돼요'", nt === '행사장 위치가 비어 있어요 / 위도·경도가 있어야 저장돼요', nt)
  ok('두 줄 각각 한 줄 · 360px 옆으로 안 밀림', (await need.evaluate((el) => [...el.querySelectorAll('p > *')].every((c) => c.getBoundingClientRect().height < 22))) && (await noSide(a)))
  if (SHOTS) await need.screenshot({ path: `${SHOTS}/gps-need.png` }).catch(() => {})
  // 안내의 '현재 위치로' → 찾는 중… → 좌표가 들어오고 안내가 사라짐
  const here = a.locator('[data-loc-here]')
  await need.getByRole('button', { name: '현재 위치로' }).click()
  const busy = await here.evaluate((el) => ({ text: el.textContent.trim(), disabled: el.disabled, busy: el.getAttribute('aria-busy') }))
  ok("찾는 동안 '찾는 중…' · 눌리지 않음", busy.text === '찾는 중…' && busy.disabled && busy.busy === 'true', JSON.stringify(busy))
  await a.waitForFunction(() => document.querySelector('input[name=lat]')?.value, null, { timeout: 5000 }).catch(() => {})
  const lat = a.locator('input[name=lat]'), lng = a.locator('input[name=lng]')
  ok('좌표가 두 칸에 들어옴', (await lat.inputValue()) === '35.189000' && (await lng.inputValue()) === '128.081400', `${await lat.inputValue()}, ${await lng.inputValue()}`)
  ok('들어온 칸에 표시 · 버튼은 원래대로', !!(await lat.getAttribute('data-filled')) && !!(await lng.getAttribute('data-filled')) && (await here.evaluate((el) => el.textContent.trim() === '현재 위치로' && !el.disabled)))
  ok('좌표가 들어오면 안내가 사라짐', await need.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false))
  // 좌표를 지우면 다시 안내 · 좌표 붙여넣기(위도 칸)로도 사라짐
  await lat.fill('')
  await lat.blur()
  ok('좌표를 지우면 다시 안내', await need.waitFor({ timeout: 5000 }).then(() => true, () => false))
  await lat.evaluate((el) => { const dt = new DataTransfer(); dt.setData('text', '35.1234, 128.5678'); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) })
  ok('좌표 붙여넣기: 두 칸이 채워지고 안내가 사라짐', (await need.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false)) && (await lat.inputValue()) === '35.1234' && (await lng.inputValue()) === '128.5678', `${await lat.inputValue()}, ${await lng.inputValue()}`)
  // 끄면 좌표가 없어도 안내 없음
  await lat.fill('')
  await lng.fill('')
  await lng.blur()
  await need.waitFor({ timeout: 5000 }).catch(() => {})
  await gps.uncheck()
  ok('끄면 좌표가 없어도 안내 없음', await need.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
