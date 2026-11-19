// 묶음 317 (정기 개선 2026-11-19 20:35 KST)
// · 근무자 홈: 오늘 공고가 모두 끝나 '지금 지원할 수 있는 공고가 없어요'일 때도 알림을 안 켠 회원에게 '휴대폰 알림 받기' 카드
//   (공고가 아예 없을 때와 같게 · 그냥 나가지 않게) · 로그인 전에는 없음
// · 외주 관리 대금 지급 탭 '＋ 지급 건 등록' 접힌 줄: 360px에서 끝이 잘리던 안내 → '견적 없이 직접 등록 · 선정한 견적은 자동' (한 줄에 다 보임)
// node scripts/qa/batch317.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const N = '33333333-0000-4000-8000-0000000317a1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kmin = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes() }

;(async () => {
  // 오늘 공고를 이미 끝난 시간으로 (자정 바로 뒤에 돌 때는 건너뜀) · 처음 온 근무자
  const late = kmin() > 2
  if (late) await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '00:00:00', end_time: '00:01:00' })
  const [u] = await rest(`users?id=eq.${K}`)
  const { attendance: _a, ratings: _r, ...ub } = u
  await rest('users', 'POST', { ...ub, id: N, name: '알림없음', phone: '01031703170', created_at: '2026-10-20T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {}
      // 알림을 켤 수 있는 휴대폰처럼 (권한 아직 안 물음 · 시험용 브라우저는 기본이 '거부')
      try { Object.defineProperty(Notification, 'permission', { get: () => 'default' }) } catch {}
    })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  if (late) {
    // ── 1. 지원할 공고가 없음 + 알림 안 켬 → 알림 받기 카드
    const w = await mk(N)
    await w.goto(`${D}/`, { waitUntil: 'networkidle' })
    const noLive = w.locator('[data-no-live]')
    ok("'지금 지원할 수 있는 공고가 없어요' 그대로", one(await noLive.innerText().catch(() => '')) === '지금 지원할 수 있는 공고가 없어요')
    const card = w.locator('.card', { hasText: '휴대폰 알림 받기' })
    await card.first().waitFor({ timeout: 5000 }).catch(() => {})
    ok("바로 아래 '휴대폰 알림 받기 · 모집·확정을 바로 알려요' 카드 + 켜기 버튼", (await card.count()) === 1 && one(await card.innerText()).includes('모집·확정을 바로 알려요') && (await card.locator('button').count()) === 1)
    ok('알림 카드는 끝난 공고 줄보다 위 (먼저 보이게)', await w.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((e) => e.textContent.includes('휴대폰 알림 받기')); const n = document.querySelector('[data-no-live]'); return !!c && !!n && (n.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 && c.getBoundingClientRect().top < (document.querySelector('a[href="/jobs/' + 'cccccccc-0000-4000-8000-000000000003' + '"]')?.getBoundingClientRect().top ?? 1e9) }))
    ok('안내 줄과 알림 카드 사이 간격 (붙지 않게)', await w.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((e) => e.textContent.includes('휴대폰 알림 받기')); const n = document.querySelector('[data-no-live]'); return !!c && !!n && c.getBoundingClientRect().top - n.getBoundingClientRect().bottom >= 6 }))
    ok('360px 옆으로 안 밀림 (홈)', await noSide(w))
    if (SHOTS) await w.screenshot({ path: `${SHOTS}/home-no-live-push.png` })
    // ── 2. 로그인 전에는 알림 카드 없음
    const g = await mk(null)
    await g.goto(`${D}/`, { waitUntil: 'networkidle' })
    ok('로그인 전: 알림 카드 없음 (안내 줄은 그대로)', (await g.locator('[data-no-live]').count()) === 1 && (await g.locator('.card', { hasText: '휴대폰 알림 받기' }).count()) === 0)
  } else {
    console.log('SKIP  자정 바로 뒤라 공고를 끝난 시간으로 바꿀 수 없음')
  }

  // ── 3. 외주 관리 '＋ 지급 건 등록' 접힌 줄이 한 줄에 다 보임
  const a = await mk(A)
  await a.goto(`${D}/admin/vendors?tab=pay`, { waitUntil: 'networkidle' })
  const fold = a.locator('details', { hasText: '지급 건 등록' }).first()
  const line = fold.locator('summary span.truncate').first()
  ok("접힌 줄: '견적 없이 직접 등록 · 선정한 견적은 자동'", one(await line.textContent().catch(() => '')) === '견적 없이 직접 등록 · 선정한 견적은 자동')
  ok('360px에서 잘리지 않음 (… 없음)', await line.evaluate((el) => el.scrollWidth <= el.clientWidth + 1).catch(() => false))
  ok('360px 옆으로 안 밀림 (외주 관리)', await noSide(a))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
