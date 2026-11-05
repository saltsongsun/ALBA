// 묶음 65: 단체방 관리자 = 공고 올린 사람 + 들어온 사람만
// · 공고를 올린 관리자는 자동 참여 (나가기 없음) · 다른 관리자는 '참여하기'를 눌러야 참여 (보기만 해서는 참여로 치지 않음)
// · 참여한 관리자만: 참여자 목록 · @부르기 대상 · 안 읽은 수 (알림도 같은 목록으로 보냄)
// · 관리자 문의 목록: 참여 안 한 진행 중 방은 '참여 안 한 단체방 N'으로 접어 둠 · 나가기 → 다시 접힌 칸으로
// · 글을 보내도 참여 · 다른 회사 관리자는 참여할 수 없음
// node scripts/qa/batch65.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const CO = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const A2 = 'aaaaaaaa-0000-4000-8000-0000000000b2', A3 = 'aaaaaaaa-0000-4000-8000-0000000000b3'
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
const call = (p, file, name, args) =>
  p.evaluate(
    async ({ id, args }) => {
      const body = new FormData()
      body.append('0', JSON.stringify(args))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.text()
    },
    { id: idOf(file, name), args },
  )
const reads = async (uid) => (await rest('job_chat_reads')).filter((r) => r.job_id === J && r.user_id === uid)

;(async () => {
  // 준비: 같은 회사 두 번째 관리자 A2(부관리자) · 다른 회사 관리자 A3 · 공고 J(A가 올림)는 내일까지 · 근무자 새 글 1개
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '부관리자', phone: '01077778888', is_super: false })
  await rest('company_members', 'POST', { company_id: CO, user_id: A2, role: 'admin' })
  const [c1] = await rest(`companies?id=eq.${CO}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  await rest('users', 'POST', { ...a1, id: A3, name: '남의관리자', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A3, role: 'owner' })
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: kstDate(new Date(Date.now() + 86400e3)) })
  await rest('job_chat', 'POST', { job_id: J, company_id: CO, sender_id: W, from_admin: false, body: '내일 몇 시까지 가면 되나요?', pinned_at: null, created_at: new Date(Date.now() - 60e3).toISOString() })
  const [j] = await rest(`jobs?id=eq.${J}`)
  ok('준비: 공고 J는 관리자(A)가 올림', j?.created_by === A, j?.created_by)

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
  const rooms = (p) => p.locator('section[aria-label="단체방"]')
  const liveRow = (p) => rooms(p).locator(`:scope > a[href="/admin/chat/room/${J}"]`)
  const otherRow = (p) => p.locator(`[data-rooms-others] a[href="/admin/chat/room/${J}"]`)
  const list = async (p) => {
    await p.goto(`${D}/admin/chat`)
    await rooms(p).waitFor({ timeout: 10000 }).catch(() => {})
  }
  const openRoom = async (p) => {
    await p.goto(`${D}/admin/chat/room/${J}`)
    await p.locator('[data-room-members]').waitFor({ timeout: 10000 }).catch(() => {})
  }
  const staff = async (p) => (await p.locator('[data-room-members] summary').innerText()).replace(/\s+/g, ' ')
  const chips = async (p) => {
    const box = p.locator('textarea[name=body]')
    await box.click()
    await box.fill('')
    await box.pressSequentially('@')
    await p.locator('[data-mention-list]').waitFor({ timeout: 3000 }).catch(() => {})
    const l = (await p.locator('[data-mention-list] button').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())
    await box.press('Escape')
    await box.fill('')
    return l
  }

  // ── 1. 공고를 올린 관리자: 자동 참여 · 나가기 없음 · 안 읽은 수 ──
  const ad = await pg(A)
  await list(ad)
  ok('올린 관리자: 방이 위 목록에 + 안 읽은 1', (await liveRow(ad).count()) === 1 && (await liveRow(ad).locator('.bg-rose-500').innerText().catch(() => '')) === '1')
  ok("올린 관리자: '참여 안 한 단체방' 없음", (await ad.locator('[data-rooms-others]').count()) === 0)
  await openRoom(ad)
  ok('올린 관리자: 참여 안내·나가기 없음', (await ad.locator('[data-room-join]').count()) === 0 && (await ad.locator('[data-room-leave]').count()) === 0)
  ok('올린 관리자: 방을 열면 읽음으로 남음', (await reads(A)).length === 1)

  // ── 2. 다른 관리자: 참여 전에는 접힌 칸 · 안 읽은 수 안 셈 · 보기만 해서는 참여 아님 ──
  const a2 = await pg(A2)
  await list(a2)
  const others = (await a2.locator('[data-rooms-others] summary').innerText().catch(() => '')).replace(/\s+/g, ' ')
  ok("부관리자: '참여 안 한 단체방 1'로 접힘 (위 목록엔 없음)", others.includes('참여 안 한 단체방 1') && (await liveRow(a2).count()) === 0 && (await otherRow(a2).count()) === 1 && !(await otherRow(a2).isVisible()), others)
  ok('부관리자: 참여 안 한 방의 안 읽은 수는 안 셈', (await a2.locator('[data-rooms-others] .bg-rose-500').count()) === 0)
  ok('360px: 옆으로 안 밀림 (문의 목록)', await a2.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await a2.locator('[data-rooms-others] summary').click()
  await otherRow(a2).click()
  await a2.locator('[data-room-join]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("부관리자: 방에 '참여하기' 안내 · 나가기 없음", (await a2.locator('[data-room-join]').isVisible()) && (await a2.locator('[data-room-leave]').count()) === 0)
  ok('부관리자: 보기만 해서는 읽음·참여 기록 없음', (await reads(A2)).length === 0)
  ok('참여자: 담당자는 올린 관리자 1명만', (await staff(a2)).includes('담당자 1'), await staff(a2))
  ok('360px: 옆으로 안 밀림 (참여 안내)', await a2.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // ── 3. 근무자: 참여 안 한 관리자는 @부르기에 없음 ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/chat/room/${J}`)
  await wk.locator('textarea[name=body]').waitFor({ timeout: 10000 })
  const before = await chips(wk)
  ok('근무자 @: 올린 관리자만 (부관리자 없음)', before.some((c) => c.startsWith('@관리자')) && !before.some((c) => c.startsWith('@부관리자')), before.join(','))

  // ── 4. 참여하기 ──
  await a2.locator('[data-room-join] button').click()
  await a2.locator('[data-room-leave]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("참여하기 → 안내 사라짐 + '나가기' 생김", (await a2.locator('[data-room-join]').count()) === 0 && (await a2.locator('[data-room-leave]').isVisible()))
  ok("참여 알림: '단체방에 참여했어요'", await a2.getByText('단체방에 참여했어요').first().isVisible().catch(() => false))
  ok('참여 기록이 남음', (await reads(A2)).length === 1)
  ok('참여자: 담당자 2명', (await staff(a2)).includes('담당자 2'), await staff(a2))
  await wk.reload()
  await wk.locator('textarea[name=body]').waitFor({ timeout: 10000 })
  const after = await chips(wk)
  ok('근무자 @: 이제 부관리자도 부를 수 있음', after.some((c) => c.startsWith('@부관리자')), after.join(','))
  await list(a2)
  ok('부관리자 목록: 이제 위 목록에 (접힌 칸 없음)', (await liveRow(a2).count()) === 1 && (await a2.locator('[data-rooms-others]').count()) === 0)

  // ── 5. 나가기 (두 번 눌러야) ──
  await openRoom(a2)
  const leave = a2.locator('[data-room-leave] button')
  await leave.click()
  ok("나가기: 한 번 누르면 '한 번 더 누르면 나가요'", (await leave.innerText()).includes('한 번 더'))
  await leave.click()
  await a2.waitForURL((u) => u.pathname === '/admin/chat', { timeout: 10000 }).catch(() => {})
  await rooms(a2).waitFor({ timeout: 10000 }).catch(() => {})
  ok("나가기 → 문의 목록 + '단체방에서 나왔어요'", new URL(a2.url()).pathname === '/admin/chat' && (await a2.getByText('단체방에서 나왔어요').first().isVisible().catch(() => false)))
  ok('나가면 참여 기록 지움 + 다시 접힌 칸으로', (await reads(A2)).length === 0 && (await otherRow(a2).count()) === 1)

  // ── 6. 글을 보내도 참여 ──
  await openRoom(a2)
  const box = a2.locator('textarea[name=body]')
  await box.fill('저도 내일 현장에 가요')
  await box.press('Enter')
  await a2.getByText('저도 내일 현장에 가요').first().waitFor({ timeout: 8000 }).catch(() => {})
  await a2.waitForTimeout(500)
  ok('참여 전 글을 보내면 참여됨', (await reads(A2)).length === 1)
  await openRoom(a2)
  ok("글 보낸 뒤: 참여 안내 없음 · '나가기' 있음", (await a2.locator('[data-room-join]').count()) === 0 && (await a2.locator('[data-room-leave]').count()) === 1)

  // ── 7. 막기: 올린 관리자는 나갈 수 없음 · 다른 회사 관리자는 참여할 수 없음 ──
  await openRoom(ad)
  await call(ad, 'room', 'leaveRoom', [J])
  ok('올린 관리자: 나가기 요청을 보내도 그대로 참여', (await reads(A)).length === 1)
  const a3 = await pg(A3)
  await a3.goto(`${D}/admin/chat`)
  await call(a3, 'room', 'joinRoom', [J])
  ok('다른 회사 관리자: 참여 요청이 막힘', (await reads(A3)).length === 0)
  await a3.goto(`${D}/admin/chat/room/${J}`)
  ok('다른 회사 관리자: 방을 볼 수 없음', (await a3.locator('[data-room-members]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
