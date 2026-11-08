// 묶음 149 (정기 개선 2026-11-08 23:35)
// · 대시보드 '확정 대기 지원자'는 최근 30명까지만 불러옴 → 더 많으면 진짜 수(제목·숫자 칸)와 '최근 30명만 보여요 · 나머지 n명은 공고 목록에서'
//   (예전엔 33명이 기다려도 30으로 보이고 나머지는 말없이 빠졌음)
// · 전문가 '견적·대금': 견적도 대금도 없으면 0원 칸·빈 칸 두 개 대신 안내 하나
// node scripts/qa/batch149.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const AP_APP = '11111111-0000-4000-8000-000000000012'
const PRO = 'bbbbbbbb-0000-4000-8000-0000000149e1'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await mk(A)
  const title = () => a.locator('#pending h2').innerText()
  const note = a.locator('[data-pending-more-total]')

  // ── 1. 30명 이하: 그대로 · 안내 없음
  await a.goto(`${D}/admin`)
  await a.locator('#pending').waitFor({ timeout: 15000 }).catch(() => {})
  ok('대기 1명: 제목 숫자 1 · 안내 없음', /확정 대기 지원자\s*1$/.test((await title()).trim()) && (await note.count()) === 0, (await title()).trim())

  // ── 2. 33명이 기다리면: 진짜 수 33 + 나머지 3명 안내
  const [apApp] = await rest(`applications?id=eq.${AP_APP}`)
  for (let i = 0; i < 32; i++) {
    const n = String(i).padStart(2, '0')
    const uid = `33333333-0000-4000-8000-0000001490${n}`
    await rest('applications', 'POST', { ...apApp, id: `11111111-0000-4000-8000-0000001490${n}`, user_id: uid, user: { ...apApp.user, id: uid, name: `대기${n}` }, held_at: null, status: 'applied', created_at: new Date(Date.now() - i * 60000).toISOString() })
  }
  await a.reload()
  await a.locator('#pending').waitFor({ timeout: 15000 }).catch(() => {})
  ok('제목 숫자는 진짜 수 33', /확정 대기 지원자\s*33$/.test((await title()).trim()), (await title()).trim())
  const stat = await a.locator('a[href="#pending"]').first().innerText()
  ok("숫자 칸 '확정 대기 지원'도 33", stat.includes('33'), stat.replace(/\n/g, ' '))
  ok("'최근 30명만 보여요 · 나머지 3명은 공고 목록에서' → 공고 목록", (await note.innerText().catch(() => '')).includes('최근 30명만 보여요 · 나머지 3명은 공고 목록에서') && (await note.getAttribute('href')) === '/admin/jobs', await note.innerText().catch(() => ''))
  ok('안내가 한 줄 (꺾이지 않음)', await note.evaluate((el) => el.getBoundingClientRect().height < 48))
  ok('360px: 옆으로 안 밀림', await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 전문가 견적·대금: 아무것도 없으면 안내 하나
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: PRO, name: '새전문가', phone: '01014901490', member_type: 'expert', specialty: '사회자', created_at: new Date().toISOString() })
  const p = await mk(PRO)
  await p.goto(`${D}/pro/money`)
  await p.getByText('견적 · 대금').first().waitFor({ timeout: 15000 }).catch(() => {})
  const main = await p.locator('main').innerText()
  ok("견적·대금 없음: 안내 하나 ('아직 받은 견적·대금이 없어요')", (await p.locator('[data-pro-money-empty]').count()) === 1 && main.includes('아직 받은 견적·대금이 없어요'))
  ok("0원 칸·빈 칸 두 개는 없음", !main.includes('받을 대금 0건') && !main.includes('받은 견적 요청이 없어요') && !main.includes('아직 대금 내역이 없어요'))
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
