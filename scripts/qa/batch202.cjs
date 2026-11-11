// 묶음 202 (정기 개선 2026-11-11 20:36 KST)
// · 인터넷이 끊기면(행사장처럼 신호가 약한 곳) 위에 작은 안내: '인터넷이 끊겼어요 · 연결되면 이어져요' → 돌아오면 '다시 연결됐어요'
// · 끊긴 동안 다른 화면으로 가는 링크·보내기를 누르면 막고 알려 줌 — 보던 화면과 쓰던 내용(문의 등)을 잃지 않게
//   (같은 화면 안의 자리 옮기기 · 전화·문자 링크는 그대로)
// · 연결되면 그대로 다시 눌러 보낼 수 있음
// node scripts/qa/batch202.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const C1 = '99999999-0000-4000-8000-000000000099'
const MSG = '끊긴 동안 쓴 문의예요'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const sent = async () => (await rest('messages')).filter((m) => (m.body ?? '').includes(MSG)).length

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const bar = (p) => p.locator('[data-offline]')
  const barText = async (p) => ((await p.locator('[data-offline-text]').innerText({ timeout: 3000 }).catch(() => '')) ?? '').trim()

  // ── 1. 근무자: 문의를 쓰는 중에 인터넷이 끊김
  const w = await pg(W)
  await w.goto(`${D}/me/chat?co=${C1}`, { waitUntil: 'networkidle' })
  const box = w.locator('textarea[name=body]')
  await box.waitFor({ timeout: 15000 })
  ok('연결돼 있을 때는 안내 없음', (await bar(w).count()) === 0)
  await box.fill(MSG)
  await w.context().setOffline(true)
  ok('끊기면 위에 안내가 내려옴', await w.locator('[data-offline="off"]').waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok("'인터넷이 끊겼어요 · 연결되면 이어져요'", (await barText(w)) === '인터넷이 끊겼어요 · 연결되면 이어져요', await barText(w))
  await w.waitForTimeout(500)
  ok('한 줄 · 화면 안 · 머리글 아래 · 옆으로 안 밀림', await bar(w).locator('p').evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.querySelector('[data-app-header]')?.getBoundingClientRect(); return r.height < 44 && r.left >= 8 && r.right <= innerWidth - 8 && (!h || r.top >= h.bottom) && document.scrollingElement.scrollWidth <= innerWidth + 1 }).catch(() => false))
  ok('안내가 아래 화면을 가로막지 않음 (눌러도 통과)', (await bar(w).evaluate((el) => getComputedStyle(el).pointerEvents)) === 'none')
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/offline-bar.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})

  // 몇 초 뒤에는 한마디로 줄어듦 (끊긴 동안 계속 떠 있어도 화면을 덜 가리게)
  const small = await w.waitForFunction(() => document.querySelector('[data-offline-text]')?.textContent === '인터넷 끊김', null, { timeout: 8000 }).then(() => true, () => false)
  await w.waitForTimeout(400)
  ok("몇 초 뒤 '인터넷 끊김' 한마디로 줄어듦 (작게 · 머리글 바로 아래 오른쪽 틈 — 내용을 가리지 않게)", small && (await bar(w).locator('p').evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.querySelector('[data-app-header]').getBoundingClientRect(); return r.width < 120 && r.height <= 28 && r.top >= h.bottom && r.bottom <= h.bottom + 32 && r.right <= innerWidth - 12 && r.left > innerWidth / 2 })))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/offline-small.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})

  // 보내기를 누르면: 막고 알려 줌 (다시 펼쳐짐) · 쓴 내용은 그대로 · 화면도 그대로
  const before = w.url()
  await w.getByRole('button', { name: '보내기' }).click()
  await w.waitForTimeout(800)
  ok("보내기를 막고 '연결되면 다시 눌러 주세요 · 내용은 그대로예요'", (await barText(w)) === '연결되면 다시 눌러 주세요 · 내용은 그대로예요', await barText(w))
  ok('쓴 내용이 그대로 · 화면도 그대로 (오류 화면으로 안 넘어감)', (await box.inputValue()) === MSG && w.url() === before && (await w.getByText('잠시 문제가 생겼어요').count()) === 0 && (await w.getByText('인터넷 연결이 끊겼어요').count()) === 0)
  ok('긴 안내도 한 줄 · 화면 안', await bar(w).locator('p').evaluate((el) => { const r = el.getBoundingClientRect(); return r.height < 44 && r.left >= 8 && r.right <= innerWidth - 8 }).catch(() => false))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/offline-send-blocked.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})

  // 다른 화면으로 가는 링크: 막고 알려 줌 (그대로 두면 '연결 없음' 화면으로 넘어가 쓴 내용을 잃음)
  await w.locator('a[href="/me"]:visible').first().click()
  await w.waitForTimeout(800)
  ok("다른 화면 링크를 막고 '인터넷이 연결되면 열 수 있어요'", w.url() === before && (await barText(w)) === '인터넷이 연결되면 열 수 있어요' && (await box.inputValue()) === MSG, `${w.url()} / ${await barText(w)}`)
  // 같은 화면 안의 자리 옮기기 · 전화 링크는 막지 않음
  const pass = await w.evaluate(() => {
    const out = {}
    for (const [id, href] of [['hash', '#somewhere'], ['tel', 'tel:01012345678'], ['ext', 'https://example.com/']]) {
      const a = document.createElement('a'); a.href = href; a.textContent = id; document.body.appendChild(a)
      let prevented = null
      a.addEventListener('click', (e) => { prevented = e.defaultPrevented; e.preventDefault() })
      a.click()
      out[id] = prevented
      a.remove()
    }
    return out
  })
  ok('같은 화면 안 자리 옮기기 · 전화 · 다른 사이트 링크는 그대로', pass.hash === false && pass.tel === false && pass.ext === false, JSON.stringify(pass))
  ok('끊긴 동안 보낸 것은 없음', (await sent()) === 0)

  // ── 2. 다시 연결되면
  await w.context().setOffline(false)
  ok("연결되면 '다시 연결됐어요'", await w.locator('[data-offline="back"]').waitFor({ timeout: 10000 }).then(() => true, () => false))
  ok('초록색 · 체크', (await barText(w)) === '다시 연결됐어요' && ((await bar(w).locator('p').getAttribute('class')) ?? '').includes('bg-emerald-600'))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/online-back.png`, clip: { x: 0, y: 0, width: 360, height: 300 } }).catch(() => {})
  ok('잠시 뒤 안내가 사라짐', await bar(w).waitFor({ state: 'detached', timeout: 6000 }).then(() => true, () => false))
  // 쓴 내용 그대로 다시 눌러 보냄
  ok('쓴 내용이 남아 있음', (await box.inputValue()) === MSG)
  await w.getByRole('button', { name: '보내기' }).click()
  let n = 0
  for (let i = 0; i < 30 && n === 0; i++) { await w.waitForTimeout(300); n = await sent() }
  ok('연결된 뒤 다시 누르면 보내짐 (한 번만)', n === 1, `보낸 수 ${n}`)
  ok('보낸 글이 화면에 보임 · 입력칸은 비워짐', (await w.getByText(MSG).first().waitFor({ timeout: 8000 }).then(() => true, () => false)) && (await box.inputValue()) === '')
  await w.locator('a[href="/me"]:visible').first().click()
  await w.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 15000 }).catch(() => {})
  ok('링크도 다시 열림', new URL(w.url()).pathname === '/me', w.url())

  // ── 3. 관리자 화면도 같게
  const a = await pg(A)
  await a.goto(`${D}/admin`, { waitUntil: 'networkidle' })
  await a.context().setOffline(true)
  ok('관리자: 끊기면 안내', await a.locator('[data-offline="off"]').waitFor({ timeout: 8000 }).then(() => true, () => false))
  await a.locator('a[href="/admin/jobs"]:visible').first().click()
  await a.waitForTimeout(800)
  ok('관리자: 다른 화면 링크를 막음 (보던 현황 화면 그대로)', new URL(a.url()).pathname === '/admin' && (await barText(a)) === '인터넷이 연결되면 열 수 있어요', a.url())
  await a.context().setOffline(false)
  await a.locator('[data-offline="back"]').waitFor({ timeout: 10000 }).catch(() => {})
  await a.locator('a[href="/admin/jobs"]:visible').first().click()
  await a.waitForURL((u) => new URL(u).pathname === '/admin/jobs', { timeout: 15000 }).catch(() => {})
  ok('관리자: 연결되면 다시 열림', new URL(a.url()).pathname === '/admin/jobs', a.url())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
