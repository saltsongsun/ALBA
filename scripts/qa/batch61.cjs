// 묶음 61: 종료된 행사 단체방은 따로 (대화 목록 위아래 줄이기)
// · 근무자 문의 목록: 진행 중인 대화(회사 문의·진행 중 단체방)가 위 · 끝난 행사 단체방은 '종료된 행사 단체방 N'으로 접어 둠
//   (안 읽은 수는 접힌 줄에 함께) · 끝난 방만 있으면 펼쳐 둠
// · 관리자 문의: 단체방 칸도 진행 중 / 종료된 행사(접힘)로 나눔
// node scripts/qa/batch61.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const J2 = 'cccccccc-0000-4000-8000-0000000000e2', J3 = 'cccccccc-0000-4000-8000-0000000000e3'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
const yesterday = kstDate(new Date(Date.now() - 86400e3)), lastWeek = kstDate(new Date(Date.now() - 7 * 86400e3))
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 어제 끝난 행사 J2 · 지난주 끝난 행사 J3 (W가 둘 다 확정) · J2에 담당자 새 메시지 1개
  const [j] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j, id: J2, title: '어제 끝난 불꽃축제 안내', start_date: yesterday, end_date: yesterday, status: 'closed', applications: [] })
  await rest('jobs', 'POST', { ...j, id: J3, title: '지난주 마라톤 급수 지원', start_date: lastWeek, end_date: lastWeek, status: 'done', applications: [] })
  for (const [id, jid] of [['11111111-0000-4000-8000-0000000000f2', J2], ['11111111-0000-4000-8000-0000000000f3', J3]])
    await rest('applications', 'POST', { id, job_id: jid, user_id: W, status: 'approved', available_dates: null, created_at: new Date().toISOString() })
  await rest('job_chat', 'POST', { job_id: J2, company_id: CO, sender_id: A, from_admin: true, body: '어제 수고 많으셨어요! 정산은 금요일이에요', pinned_at: null, created_at: new Date(Date.now() - 3600e3).toISOString() })

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

  // ── 1. 근무자 문의 목록 ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/chat`)
  await wk.locator('[data-chat-list]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('진행 중인 단체방은 위 목록에', (await wk.locator(`[data-chat-list] a[href="/me/chat/room/${J}"]`).count()) === 1)
  ok('끝난 행사 방은 위 목록에 없음', (await wk.locator(`[data-chat-list] a[href="/me/chat/room/${J2}"], [data-chat-list] a[href="/me/chat/room/${J3}"]`).count()) === 0)
  const sum = wk.locator('[data-chat-ended] summary')
  const sumText = (await sum.innerText()).replace(/\s+/g, ' ')
  ok("접힌 줄: '종료된 행사 단체방 2' + 안 읽은 1", sumText.includes('종료된 행사 단체방 2') && /\b1\b/.test(sumText), sumText)
  ok('처음엔 접혀 있음', !(await wk.locator('[data-chat-ended]').evaluate((d) => d.open)) && !(await wk.locator(`a[href="/me/chat/room/${J2}"]`).isVisible()))
  await sum.click()
  ok('누르면 끝난 방 2개가 보임 (최근 대화 순)', (await wk.locator('[data-chat-list-ended] a[data-chat-row=room]').count()) === 2 && (await wk.locator('[data-chat-list-ended] a').first().getAttribute('href')) === `/me/chat/room/${J2}`)
  ok('끝난 방도 들어가 읽을 수 있음', await wk.locator(`a[href="/me/chat/room/${J2}"]`).isVisible())
  ok('360px: 옆으로 안 밀림', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 2. 관리자 문의: 단체방도 진행 중 / 종료된 행사 ──
  const ad = await pg(A)
  await ad.goto(`${D}/admin/chat`)
  await ad.locator('section[aria-label="단체방"]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('관리자: 진행 중 방은 바로 보임', await ad.locator(`section[aria-label="단체방"] > a[href="/admin/chat/room/${J}"]`).isVisible())
  ok('관리자: 끝난 방은 접힌 칸 안에', (await ad.locator(`[data-rooms-ended] a[href="/admin/chat/room/${J2}"]`).count()) === 1 && !(await ad.locator(`[data-rooms-ended] a[href="/admin/chat/room/${J2}"]`).isVisible()))
  ok("관리자: '종료된 행사 단체방 2'", (await ad.locator('[data-rooms-ended] summary').innerText()).includes('종료된 행사 단체방 2'))

  // ── 3. 끝난 방만 남으면 펼쳐 둠 ──
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: yesterday, start_date: yesterday })
  await wk.goto(`${D}/me/chat`)
  await wk.locator('[data-chat-ended]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('끝난 방만 있으면 접지 않고 보여 줌', await wk.locator('[data-chat-ended]').evaluate((d) => d.open).catch(() => false))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
