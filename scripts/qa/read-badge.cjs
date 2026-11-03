// 읽으면 바로 '문의' 숫자가 사라짐 (화면 위·아래 공통 틀까지) + 지원한 적 없는 회원의 문의는 '해피워크 고객센터'
// node scripts/qa/read-badge.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C1 = '99999999-0000-4000-8000-000000000099'
const NEW = '44444444-0000-4000-8000-0000000000c7'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)

;(async () => {
  // 근무자에게 안 읽은 답장 2개, 관리자에게 안 읽은 문의 1개
  await fetch(`${MD}/rest/v1/messages?thread_user_id=eq.${W}`, { method: 'DELETE' })
  const now = Date.now()
  for (const [fa, body, ago] of [[true, '내일 8시 50분까지 와 주세요', 3], [true, '정문에서 만나요', 2], [false, '주차할 수 있나요?', 1]])
    await rest('messages', 'POST', { thread_user_id: W, sender_id: fa ? A : W, from_admin: fa, company_id: C1, body, read_at: null, created_at: new Date(now - ago * 60000).toISOString(), user: { id: W, name: '근무자', phone: '01033334444', photo_at: null } })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: NEW, name: '새회원', phone: '01012120000', attendance: [], ratings: [] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 근무자: 아래 탭 '문의' 숫자 → 열면 바로 사라짐 ──
  const wk = await pg(W)
  await wk.goto(`${D}/me`)
  const tab = wk.locator('nav[data-bottom-nav] a[href="/me/chat"]')
  ok('읽기 전: 아래 탭 문의에 숫자', /\d/.test(await tab.innerText()), await tab.innerText())
  await tab.click()
  await wk.waitForURL(/\/me\/chat/, { timeout: 8000 }).catch(() => {})
  await wk.waitForTimeout(2500) // (자동 새로 고침 5초보다 먼저)
  ok('열고 바로: 아래 탭 숫자 사라짐', !/\d/.test(await tab.innerText()), await tab.innerText())
  ok('저장: 읽음', (await rest('messages')).filter((m) => m.thread_user_id === W && m.from_admin).every((m) => m.read_at))
  await wk.locator('nav[data-bottom-nav] a[href="/me"]').click()
  await wk.waitForURL((u) => new URL(u).pathname === '/me', { timeout: 8000 }).catch(() => {})
  ok('다른 화면으로 가도 숫자 없음', !/\d/.test(await tab.innerText()))

  // ── 2. 관리자: 메뉴 '문의' 숫자 → 대화 열면 바로 사라짐 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin`)
  const menu = ad.locator('header a[href="/admin/chat"]')
  ok('읽기 전: 관리자 메뉴 문의에 숫자', /\d/.test(await menu.innerText()), await menu.innerText())
  await ad.goto(`${D}/admin/chat`)
  await ad.locator(`a[href="/admin/chat/${W}"]`).click()
  await ad.waitForURL(new RegExp(`/admin/chat/${W}`), { timeout: 8000 }).catch(() => {})
  await ad.waitForTimeout(2500)
  ok('열고 바로: 관리자 메뉴 숫자 사라짐', !/\d/.test(await menu.innerText()), await menu.innerText())

  // ── 3. 지원한 적 없는 회원: 해피워크 고객센터 ──
  const nw = await pg(NEW)
  await nw.goto(`${D}/me/chat`)
  ok('고객센터 안내', await see(nw, '해피워크 고객센터에서 확인하고 답장해 드려요'))
  ok('입력칸: 고객센터에 보낼 내용', (await nw.locator('textarea[name=body]').getAttribute('placeholder')) === '고객센터에 보낼 내용')
  await wk.goto(`${D}/me/chat`)
  ok('그 회사 공고에 지원한 회원은 회사 이름', (await see(wk, '주식회사 테스트에서 확인하고 답장해 드려요')) && !(await see(wk, '해피워크 고객센터에서', 800)))
  const anon = await pg(null)
  await anon.goto(`${D}/login`)
  ok('로그인 화면 문의처: 해피워크 고객센터', await see(anon, '해피워크 고객센터'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
