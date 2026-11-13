// 묶음 238 (정기 개선 2026-11-13 20:36 KST)
// · 관리자 공고 목록 '공고 모음 링크' 칸: 링크를 열면 근무자에게 지금 보이는 '지원받는' 공고 수를 한 줄로
//   '● 링크에 지금 1개 · 새 공고도 여기서 봐요' (초록 점) · 없으면 '● 지금 링크엔 지원할 공고가 없어요' (주황 점 · 공유하기 버튼은 덜 눈에 띄게)
//   기준은 홈 '모집 중 n개'와 같음: 모집 중 · 근무자 공고(전문가 공고 빼고) · 오늘 근무가 끝난 공고 빼고
// · 홈(비회원) 아래 가입 안내: 오늘 근무가 끝난 공고만 남았으면 '미리 가입해 두세요' (예전엔 '마음에 드는 공고가 있나요?')
// node scripts/qa/batch238.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', JX = 'cccccccc-0000-4000-8000-0000000238e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const now = new Date(Date.now() + 9 * 3600e3)
  const early = now.getUTCHours() * 60 + now.getUTCMinutes() < 3
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const card = a.locator('[data-share-card]')
  const line = card.locator('[data-link-count]')
  const share = card.getByRole('button', { name: '공유하기' })
  const open = async () => { await a.goto(`${D}/admin/jobs`, { waitUntil: 'networkidle' }); await card.waitFor({ timeout: 15000 }).catch(() => {}) }
  const g = await mk(null)
  const joinTitle = async () => { await g.goto(`${D}/`, { waitUntil: 'networkidle' }); return one(await g.locator('[data-join-title]').innerText().catch(() => '')) }

  // ── 1. 내일 모집 중 공고 1개: '링크에 지금 1개' · 초록 점 · 공유하기 강조
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(1), end_date: kst(1), start_time: '09:00:00', end_time: '18:00:00', status: 'open' })
  await open()
  ok("'링크에 지금 1개 · 새 공고도 여기서 봐요' · 초록 점", (await line.getAttribute('data-link-count')) === '1' && one(await line.innerText()) === '링크에 지금 1개 · 새 공고도 여기서 봐요' && (await line.locator('span.bg-emerald-500').count()) === 1, one(await line.innerText().catch(() => '')))
  ok("공유하기는 파란 버튼 그대로", ((await share.getAttribute('class')) ?? '').includes('chip-primary'))
  const fit = await line.evaluate((el) => ({ rows: el.getClientRects().length, cut: el.scrollWidth > el.clientWidth + 1, h: Math.round(el.getBoundingClientRect().height) }))
  ok('한 줄 · 잘리지 않음 · 360px 옆으로 안 밀림', fit.rows === 1 && !fit.cut && fit.h < 22 && (await noSide(a)), JSON.stringify(fit))
  if (SHOTS) await card.screenshot({ path: `${SHOTS}/share-count-1.png` }).catch(() => {})
  ok("홈 가입 안내: 지원할 공고가 있으면 '마음에 드는 공고가 있나요?'", (await joinTitle()) === '마음에 드는 공고가 있나요?')

  // ── 2. 전문가 공고는 근무자 링크에 안 보이므로 세지 않음
  const [j] = await rest(`jobs?id=eq.${J}`)
  const { applications, company, ...base } = j ?? {}
  await rest('jobs', 'POST', { ...base, id: JX, title: '음향 감독 (전문가)', audience: 'expert', created_at: new Date().toISOString() })
  await open()
  ok('전문가 공고는 세지 않음 (그대로 1개)', (await line.getAttribute('data-link-count')) === '1')

  // ── 3. 오늘 근무가 끝난 공고만 (오늘 00:00~00:01): '지금 링크엔 지원할 공고가 없어요' · 주황 점 · 공유하기 덜 눈에 띄게
  if (early) console.log('SKIP  00:03 전이라 끝난 근무 확인 생략')
  else {
    await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(0), end_date: kst(0), start_time: '00:00:00', end_time: '00:01:00' })
    await open()
    ok("'지금 링크엔 지원할 공고가 없어요' · 주황 점", (await line.getAttribute('data-link-count')) === '0' && one(await line.innerText()) === '지금 링크엔 지원할 공고가 없어요' && (await line.locator('span.bg-amber-500').count()) === 1 && ((await line.getAttribute('class')) ?? '').includes('text-amber-700'), one(await line.innerText().catch(() => '')))
    ok('공유하기는 회색 버튼으로 (빈 링크를 올리지 않게)', !((await share.getAttribute('class')) ?? '').includes('chip-primary') && ((await share.getAttribute('class')) ?? '').includes('chip'))
    ok('360px 옆으로 안 밀림 (빈 링크)', await noSide(a))
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/share-count-0.png` }).catch(() => {})
    ok("홈 가입 안내: 끝난 공고만 남으면 '미리 가입해 두세요'", (await joinTitle()) === '미리 가입해 두세요')
  }

  // ── 4. 모집 마감 공고도 세지 않음
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kst(1), end_date: kst(1), start_time: '09:00:00', end_time: '18:00:00', status: 'closed' })
  await open()
  ok('모집 마감만 있으면 0개', (await line.getAttribute('data-link-count')) === '0')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
