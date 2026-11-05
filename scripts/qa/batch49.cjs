// 묶음 49: 문의 — 아직 지원한 회사가 없으면(해피워크 고객센터) 빠른 문의가 앱 사용 문의('지원은 어떻게 하나요?')
//          · 근무하는 회사 문의는 그대로 근무 날 문의('조금 늦을 것 같아요')
//          · 옆으로 미는 칩 줄: 넘치면 오른쪽 끝이 흐려져 '더 있어요' · 밀면 왼쪽도 흐려지고 끝까지 밀면 오른쪽 흐림이 사라짐
//          · 넘치지 않는 줄은 흐림 없음 · 360px
// node scripts/qa/batch49.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', NEW = 'bbbbbbbb-0000-4000-8000-0000000000c9'
const CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 아직 아무 데도 지원하지 않은 새 회원
  const [w] = await rest(`users?id=eq.${W}`)
  if (!(await rest(`users?id=eq.${NEW}`)).length) await rest('users', 'POST', { ...w, id: NEW, name: '새내기회원', phone: '01012129898', attendance: [], ratings: [], photo_at: new Date().toISOString(), bank_account_enc: null })
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
  const chips = (p) => p.locator('[data-quick-replies] button').allInnerTexts()
  const fade = (loc) => loc.evaluate((el) => { const s = getComputedStyle(el); return { s: s.getPropertyValue('--fade-s').trim(), e: s.getPropertyValue('--fade-e').trim(), mask: s.maskImage || s.webkitMaskImage, over: el.scrollWidth > el.clientWidth + 1 } })

  // ── 1. 새 회원: 해피워크 고객센터 ──
  const n = await pg(NEW)
  await n.goto(`${D}/me/chat`)
  await n.locator('[data-quick-replies]').waitFor({ timeout: 10000 }).catch(() => {})
  const nc = await chips(n)
  ok("고객센터: '지원은 어떻게 하나요?' 같은 앱 사용 문의", nc.some((t) => t.includes('지원은 어떻게 하나요?')) && nc.some((t) => t.includes('회원 탈퇴')), nc.join(' / '))
  ok("고객센터엔 근무 날 문의('조금 늦을 것 같아요')가 없음", !nc.some((t) => t.includes('조금 늦을 것 같아요')))
  await n.locator('[data-quick-replies] button', { hasText: '지원은 어떻게 하나요?' }).click()
  const box = n.locator('textarea[name=body]').first()
  ok('누르면 입력칸에 채워짐', (await box.inputValue()).includes('지원은 어떻게 하나요?'), await box.inputValue())

  // ── 2. 칩 줄 흐림: 넘치는 줄 ──
  const row = n.locator('[data-quick-replies]')
  const f0 = await fade(row)
  ok('빠른 문의 줄은 넘침 (옆으로 밀 수 있음)', f0.over)
  ok('처음: 오른쪽 끝만 흐림 (왼쪽은 또렷)', /linear-gradient/.test(f0.mask) && f0.s === '0px' && f0.e === '28px', JSON.stringify(f0))
  await row.evaluate((el) => { el.scrollLeft = el.scrollWidth / 2 - el.clientWidth / 2 })
  await n.waitForTimeout(250)
  const f1 = await fade(row)
  ok('가운데쯤: 양쪽 다 흐림', f1.s === '20px' && f1.e === '28px', JSON.stringify(f1))
  await row.evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await n.waitForTimeout(250)
  const f2 = await fade(row)
  ok('끝까지 밀면 오른쪽 흐림이 사라짐', f2.s === '20px' && f2.e === '0px', JSON.stringify(f2))
  ok('360px: 옆으로 안 밀림 (고객센터 문의)', await n.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 넘치지 않는 줄은 흐림 없음 ──
  const flat = await n.evaluate(() => {
    const d = document.createElement('div')
    d.className = 'fade-x flex gap-1.5 overflow-x-auto'
    d.innerHTML = '<span>하나</span><span>둘</span>'
    document.querySelector('main')?.appendChild(d)
    const s = getComputedStyle(d)
    const r = { s: s.getPropertyValue('--fade-s').trim(), e: s.getPropertyValue('--fade-e').trim() }
    d.remove()
    return r
  })
  ok('넘치지 않는 줄: 끝이 흐려지지 않음', flat.s === '0px' && flat.e === '0px', JSON.stringify(flat))

  // ── 4. 근무하는 회사 문의는 근무 날 문의 그대로 ──
  const p = await pg(W)
  await p.goto(`${D}/me/chat?co=${CO}`)
  await p.locator('[data-quick-replies]').waitFor({ timeout: 10000 }).catch(() => {})
  const wc = await chips(p)
  ok("회사 문의: '조금 늦을 것 같아요' 그대로", wc.some((t) => t.includes('조금 늦을 것 같아요')) && !wc.some((t) => t.includes('지원은 어떻게 하나요?')), wc.join(' / '))

  // ── 5. 홈 칩 줄 ──
  await p.goto(`${D}/`)
  const home = p.locator('[data-chip-row]')
  await home.waitFor({ timeout: 10000 }).catch(() => {})
  const h0 = await fade(home)
  ok('홈 칩 줄: 흐림 마스크', /linear-gradient/.test(h0.mask) && h0.s === '0px' && h0.e === (h0.over ? '28px' : '0px'), JSON.stringify(h0))
  ok('360px: 옆으로 안 밀림 (홈)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
