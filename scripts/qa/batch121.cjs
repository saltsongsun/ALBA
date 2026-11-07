// 묶음 121 (사용자 요청 2026-11-07 "채팅창에 링크 남기면 해당 사이트로 이동하는 기능")
// · 문의 채팅·단체방 말풍선의 주소(https://… · www.…)는 눌러서 새 탭으로 열림 (이 앱 주소는 넘기지 않음)
// · 휴대폰 번호(010-1234-5678)는 눌러서 전화 · 끝에 붙은 문장 부호는 주소에서 뺌
// · 막기: javascript: 같은 건 링크가 안 됨 · 계좌번호처럼 숫자가 이어지면 전화 링크 안 됨
// node scripts/qa/batch121.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', C = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const until = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 200) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 200)) } return null }

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const send = async (p, text) => {
    const box = p.locator('textarea[name=body]')
    await box.waitFor({ timeout: 15000 }).catch(() => {})
    await box.fill(text)
    await p.locator('button[type=submit][aria-label="보내기"]').click()
    await p.waitForTimeout(1200)
  }

  // ── 1. 문의 채팅: 담당자가 링크·번호를 보냄 → 근무자 화면에서 누를 수 있음 ──
  const a = await pg(A)
  await a.goto(`${D}/admin/chat/${W}`)
  const MSG = '행사장 지도는 여기 https://map.naver.com/p/entry/place/123?c=15.00 이고, 안내 페이지는 www.happyworks.kr. 급하면 010-1234-5678로 전화 주세요'
  await send(a, MSG)
  await send(a, '이건 링크가 아니에요 javascript:alert(1) · 계좌 0101234567890')
  ok('보낸 글은 그대로 저장', !!(await until(async () => (await rest(`messages?thread_user_id=eq.${W}`)).find((m) => m.body === MSG))))

  const w = await pg(W)
  await w.goto(`${D}/me/chat?co=${C}`)
  await w.locator('[data-chat-link]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const links = await w.locator('[data-chat-link]').evaluateAll((els) => els.map((e) => ({ k: e.dataset.chatLink, href: e.getAttribute('href'), text: e.textContent, target: e.getAttribute('target'), rel: e.getAttribute('rel') })))
  const naver = links.find((l) => l.href?.startsWith('https://map.naver.com'))
  ok('지도 주소: 그대로 눌러서 새 탭 (noopener·noreferrer)', !!naver && naver.href === 'https://map.naver.com/p/entry/place/123?c=15.00' && naver.target === '_blank' && /noopener/.test(naver.rel) && /noreferrer/.test(naver.rel), JSON.stringify(naver))
  const www = links.find((l) => l.text === 'www.happyworks.kr')
  ok("www 주소: 끝의 '.'은 빼고 https로", !!www && www.href === 'https://www.happyworks.kr/', JSON.stringify(www))
  const tel = links.find((l) => l.k === 'tel')
  ok('휴대폰 번호: 누르면 전화 (tel:01012345678)', !!tel && tel.href === 'tel:01012345678' && tel.text === '010-1234-5678', JSON.stringify(tel))
  ok('javascript:·계좌번호는 링크가 안 됨', !links.some((l) => /javascript/i.test(l.href ?? '') || /0101234567890/.test(l.text ?? '')) && links.length === 3, JSON.stringify(links.map((l) => l.text)))
  ok('담당자 화면에서도 링크 (내 말풍선은 흰 밑줄)', (await a.locator('[data-chat-link=url]').count()) >= 2)
  ok('360px: 옆으로 안 밀림 (긴 주소도 줄바꿈)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  if (SHOTS) await w.locator('[data-chat-link]').first().locator('xpath=ancestor::li[1]').screenshot({ path: `${SHOTS}/chat-links.png` }).catch(() => {})

  // ── 2. 단체방: 링크 ──
  await w.goto(`${D}/me/chat/room/${J}`)
  await send(w, '여기 참고하세요 https://example.com/guide?x=1')
  const roomLink = w.locator('[data-chat-link=url]').last()
  await roomLink.waitFor({ timeout: 10000 }).catch(() => {})
  ok('단체방 말풍선의 주소도 눌러서 열림', (await roomLink.getAttribute('href').catch(() => '')) === 'https://example.com/guide?x=1' && (await roomLink.getAttribute('target')) === '_blank')
  ok('360px: 옆으로 안 밀림 (단체방)', await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
