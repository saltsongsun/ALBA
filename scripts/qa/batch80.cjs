// 묶음 80: 사진 없는 새 회원의 공고 화면 — 아래 고정 바가 '지원하기' 대신 할 일을 그대로 말함 · 사진을 올리면 '이제 지원할 수 있어요'
// · 인사이트: 막 가입한 근무자가 공고 4개를 보고도 지원하지 않음 (바의 '지원하기'를 눌렀는데 지원이 아니라 사진 올리기가 나옴)
// · 사진 없음: 바 '지원 전에 얼굴 사진 1장이 필요해요' + '사진 올리고 지원' → 누르면 사진 칸으로
// · 사진을 올리면 지원 칸 맨 위에 '✓ 사진을 올렸어요 · 이제 지원할 수 있어요' (한 번만) · 사진 있는 근무자는 그대로 '지원하기' · 360px
// node scripts/qa/batch80.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const N = 'bbbbbbbb-0000-4000-8000-0000000000f0'
const FACE = path.join(__dirname, 'face.jpg')
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 막 가입한 사진 없는 근무자
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: N, name: '새회원', phone: '01077770123', photo_at: null, created_at: new Date().toISOString() })
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 사진 없는 새 회원 ──
  const n = await pg(N)
  await n.goto(`${D}/jobs/${J}`)
  const note = n.locator('[data-sticky-note]')
  await note.waitFor({ timeout: 10000 }).catch(() => {})
  ok("아래 바: '지원 전에 얼굴 사진 1장이 필요해요'", (await note.innerText().catch(() => '')).includes('얼굴 사진 1장이 필요해요'))
  const bar = n.getByRole('button', { name: '사진 올리고 지원' })
  ok("바 버튼: '사진 올리고 지원' (그냥 '지원하기'가 아님)", (await bar.count()) === 1 && (await n.getByRole('button', { name: '지원하기', exact: true }).count()) === 0)
  ok('360px: 옆으로 안 밀림 · 버튼 글자 한 줄', (await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)) && (await bar.evaluate((el) => el.getBoundingClientRect().height < 56)))
  await bar.click()
  await n.waitForTimeout(900)
  const photoCard = n.locator('#apply input[type=file]').first()
  ok('누르면 사진 올리기 칸으로', await n.locator('#apply').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 }))
  await photoCard.setInputFiles(FACE)
  await n.locator('#message').waitFor({ timeout: 15000 }).catch(() => {})
  const done = n.locator('[data-photo-done]')
  await done.waitFor({ timeout: 5000 }).catch(() => {})
  ok("사진을 올리면 지원 칸 맨 위에 '✓ 사진을 올렸어요 · 이제 지원할 수 있어요'", (await n.locator('#message').count()) === 1 && (await done.innerText().catch(() => '')).includes('이제 지원할 수 있어요'))
  await n.reload()
  await n.locator('#message').waitFor({ timeout: 10000 }).catch(() => {})
  ok('안내는 한 번만 (다시 열면 없음)', (await n.locator('[data-photo-done]').count()) === 0)

  // ── 2. 사진 있는 근무자: 그대로 ──
  const w = await pg(W)
  await w.goto(`${D}/jobs/${J}`)
  await w.locator('#apply').waitFor({ timeout: 10000 }).catch(() => {})
  await w.evaluate(() => scrollTo(0, 0))
  await w.waitForTimeout(500)
  const hasApp = (await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)).some((a) => a.status !== 'cancelled')
  if (!hasApp) ok("사진 있으면 바는 그대로 '지원하기'", (await w.getByRole('button', { name: '지원하기', exact: true }).count()) === 1 && (await w.locator('[data-sticky-note]').count()) === 0)
  else ok('(이미 지원한 근무자: 바 없음)', (await w.locator('[data-sticky-note]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
