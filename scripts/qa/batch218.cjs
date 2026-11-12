// 묶음 218 (정기 개선 2026-11-12 15:35 KST · 이용 기록(최근 48시간)으로 찾은 개선)
// · 가입 비밀번호: 쓰는 동안 '숫자 6자리 · 지금 n자리' (회색) · 6자리가 안 된 채 가입을 누르면 보내기 전에 멈추고 주황 안내 + 그 칸으로
//   ('비밀번호는 숫자 #자리로 정해 주세요' 오류를 서버까지 갔다 와서 받던 것) · 확인 칸이 다르면 확인 칸으로
// · 지난 근무 카드: 제목뿐 아니라 회사·날짜 줄을 눌러도 공고로 (회사·날짜 줄을 여러 번 누르던 것) — 지난 근무 화면 · 내 근무 화면
// · 병아리 레벨 카드: 병아리를 누르면 톡 뛰고 말풍선 한마디 (누를 때마다 다음 말 · 1.8초 뒤 사라짐) — 병아리 그림을 여러 번 누르던 것
// node scripts/qa/batch218.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
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

  // ── 1. 가입 비밀번호 (외주 업체 가입: 사진·주민번호 칸이 없어 비밀번호만 봄)
  const g = await mk(null)
  let posts = 0
  g.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) posts++ })
  await g.goto(`${D}/signup?type=vendor`, { waitUntil: 'networkidle' })
  const hint = g.locator('[data-pin-hint]')
  const pin = g.locator('input[name=pin]'), pin2 = g.locator('input[name=pin2]')
  await pin.waitFor({ timeout: 15000 }).catch(() => {})
  await pin.pressSequentially('1234')
  await g.waitForTimeout(150)
  ok("쓰는 동안 '숫자 6자리 · 지금 4자리' (회색 · 한 줄)", (await hint.getAttribute('data-pin-hint')) === 'count' && one(await hint.innerText()) === '숫자 6자리 · 지금 4자리' && (await hint.evaluate((el) => el.getBoundingClientRect().height < 22)), one(await hint.innerText()))
  ok('쓰는 동안엔 주황 테두리 없음', (await pin.getAttribute('aria-invalid')) === null)
  // 다른 필수 칸은 비워 둔 채로 이 칸만 보려고 브라우저 기본 확인은 끔
  await g.evaluate(() => { document.querySelector('input[name=pin]').form.noValidate = true })
  await pin2.focus()
  await g.getByRole('button', { name: /가입/ }).last().click()
  await g.waitForTimeout(400)
  ok("6자리가 안 된 채 가입: '비밀번호는 숫자 6자리예요 · 지금 4자리' (주황) · 서버로 안 보냄", (await hint.getAttribute('data-pin-hint')) === 'weak' && one(await hint.innerText()) === '비밀번호는 숫자 6자리예요 · 지금 4자리' && posts === 0, `${one(await hint.innerText())} posts=${posts}`)
  ok('비밀번호 칸으로 커서 · 주황 테두리', (await g.evaluate(() => document.activeElement?.getAttribute('name'))) === 'pin' && (await pin.getAttribute('aria-invalid')) === 'true')
  if (SHOTS) await pin.locator('xpath=ancestor::div[contains(@class,"space-y-1.5")][1]').screenshot({ path: `${SHOTS}/pin-short.png` }).catch(() => {})
  await pin.fill('')
  await pin.pressSequentially('583920')
  await pin2.pressSequentially('58392')
  await g.waitForTimeout(150)
  await g.getByRole('button', { name: /가입/ }).last().click()
  await g.waitForTimeout(400)
  ok("확인 칸이 다르면: '비밀번호 확인이 달라요…' · 확인 칸으로 · 서버로 안 보냄", one(await hint.innerText()).startsWith('비밀번호 확인이 달라요') && (await g.evaluate(() => document.activeElement?.getAttribute('name'))) === 'pin2' && posts === 0, `${one(await hint.innerText())} posts=${posts}`)
  await pin2.pressSequentially('0')
  await g.waitForTimeout(150)
  ok("맞게 고치면 '✓ 쓸 수 있는 비밀번호예요 · 확인도 같아요'", (await hint.getAttribute('data-pin-hint')) === 'ok')
  ok('360px 옆으로 안 밀림 (가입)', await noSide(g))

  // ── 2. 지난 근무 카드: 회사·날짜 줄을 눌러도 공고로
  const w = await mk(W)
  const tapLine = async (page, sel) => {
    // 화면 가운데로 옮긴 뒤 그 줄을 손가락처럼 누름 (아래 탭 막대에 가리지 않게)
    await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {})
    await page.waitForTimeout(200)
    const box = await page.locator(sel).first().boundingBox()
    if (!box) return false
    await page.mouse.click(box.x + Math.min(box.width / 2, 60), box.y + box.height / 2)
    return page.waitForURL((u) => new URL(u).pathname === `/jobs/${J}`, { timeout: 10000 }).then(() => true, () => false)
  }
  await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  await w.locator(`[data-history-job="${J}"]`).waitFor({ timeout: 15000 }).catch(() => {})
  ok('지난 근무: 회사 줄을 누르면 그 공고로', await tapLine(w, `[data-history-job="${J}"] [data-history-info] p >> text=🏢`))
  await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  await w.locator(`[data-history-job="${J}"]`).waitFor({ timeout: 15000 }).catch(() => {})
  const dateSel = `[data-history-job="${J}"] [data-history-info] p.text-sm`
  ok('지난 근무: 날짜 줄을 눌러도 그 공고로', await tapLine(w, dateSel))
  await w.goto(`${D}/me/history`, { waitUntil: 'networkidle' })
  await w.locator(`[data-history-job="${J}"]`).waitFor({ timeout: 15000 }).catch(() => {})
  ok("제목 링크는 그대로 ('…›' · 공고 주소)", (await w.locator(`[data-history-job="${J}"] a[data-history-title]`).getAttribute('href')) === `/jobs/${J}` && one(await w.locator(`[data-history-job="${J}"] a[data-history-title]`).innerText()).endsWith('›'))
  ok('오른쪽 금액·배지는 링크에 덮이지 않음 (누르는 곳이 왼쪽 칸 안)', await w.locator(`[data-history-job="${J}"] [data-history-info]`).evaluate((el) => { const a = el.querySelector('a').getBoundingClientRect(), r = el.getBoundingClientRect(); return a.width <= r.width + 1 }))
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  await w.locator(`[data-history-job="${J}"]`).waitFor({ timeout: 15000 }).catch(() => {})
  ok('내 근무 화면의 지난 근무 카드도: 회사 줄을 누르면 공고로', await tapLine(w, `[data-history-job="${J}"] [data-history-info] p >> text=🏢`))

  // ── 3. 병아리를 누르면 톡 뛰고 말풍선
  await w.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const chick = w.locator('[data-xp-chick]')
  await chick.waitFor({ timeout: 15000 }).catch(() => {})
  await chick.scrollIntoViewIfNeeded().catch(() => {})
  await chick.click()
  await w.waitForTimeout(120)
  const say = w.locator('[data-xp-say]')
  const s1 = one(await say.innerText().catch(() => ''))
  const hop = await chick.locator('span').first().getAttribute('class')
  ok("누르면 말풍선 '삐약! 👋' · 병아리가 톡 뜀 (0.3초)", s1 === '삐약! 👋' && (hop ?? '').includes('animate-hop'), `${s1} | ${hop}`)
  ok('말풍선은 카드 안 · 화면 안 · 옆으로 안 밀림', (await say.evaluate((el) => { const r = el.getBoundingClientRect(), c = el.closest('[data-xp-card]').getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.right <= innerWidth - 8 })) && (await noSide(w)))
  if (SHOTS) {
    // 말풍선이 카드 위 가장자리에 걸치므로 카드 위쪽까지 조금 더
    const box = await w.locator('[data-xp-card]').boundingBox()
    if (box) await w.screenshot({ path: `${SHOTS}/chick-say.png`, clip: { x: 0, y: Math.max(0, box.y - 20), width: 360, height: box.height + 28 } }).catch(() => {})
  }
  await chick.click()
  await w.waitForTimeout(120)
  const s2 = one(await say.innerText().catch(() => ''))
  ok("또 누르면 다음 말 ('근무 n번 더 하면 Lv.n!' 또는 '최고 레벨이에요')", s2 !== s1 && (/^근무 \d+번 더 하면 Lv\.\d+!$/.test(s2) || s2 === '최고 레벨이에요 👑'), s2)
  await w.waitForTimeout(2000)
  ok('1.8초 뒤 말풍선이 사라짐', (await say.count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
