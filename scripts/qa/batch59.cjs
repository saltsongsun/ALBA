// 묶음 59: 단체방 '안 읽은 사람' 확인
// · 말풍선 옆 노란 숫자 = 아직 안 읽은 사람 수 (보낸 사람·보는 사람 빼고, 확정 근무자 + 방에 들어온 담당자)
// · 담당자: 꾹 누르기/오른쪽 클릭 → '안 읽은 사람 N명' → 이름 목록 + '안 읽은 근무자에게 알림' (메시지마다 10분에 한 번)
// · 근무자는 숫자만 (이름 목록 없음) · 근무자가 알림 보내기를 흉내 내도 안 됨
// · 누가 읽으면 담당자 화면 숫자가 곧 줄어듦 · 방을 열어 두기만 하면 화면을 다시 그리지 않음 (읽음 기록 되풀이 X)
// node scripts/qa/batch59.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000c2', W3 = 'bbbbbbbb-0000-4000-8000-0000000000c3'
const M1 = 'eeeeeeee-0000-4000-8000-000000000301', M2 = 'eeeeeeee-0000-4000-8000-000000000302'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
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
const t = (min) => new Date(Date.now() - min * 60e3).toISOString()

;(async () => {
  // 준비: 확정자 W·W2·W3 + 담당자 A · 메시지 M1(W, 30분 전) · M2(담당자, 20분 전)
  // 읽음: W 29분 전 · W2 25분 전(M1만 읽음) · W3 없음 · A 10분 전(둘 다 읽음)
  const [w] = await rest(`users?id=eq.${W}`)
  for (const [id, name] of [[W2, '이동료'], [W3, '삼동료']]) {
    await rest('users', 'POST', { ...w, id, name, attendance: [], ratings: [] })
    await rest('applications', 'POST', { id: `11111111-0000-4000-8000-0000000${id.slice(-5)}`, job_id: J, user_id: id, status: 'approved', available_dates: null, created_at: new Date().toISOString(), user: { id, name, phone: '01012345678', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: name, photo_at: null } })
  }
  await rest('job_chat', 'POST', { id: M1, job_id: J, company_id: CO, sender_id: W, from_admin: false, body: '저 지금 도착했어요', pinned_at: null, created_at: t(30) })
  await rest('job_chat', 'POST', { id: M2, job_id: J, company_id: CO, sender_id: A, from_admin: true, body: '모두 2시까지 A게이트로 모여 주세요', pinned_at: null, created_at: t(20) })
  for (const [uid, min] of [[W, 29], [W2, 25], [A, 10]]) await rest('job_chat_reads', 'POST', { job_id: J, user_id: uid, read_at: t(min) })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, desktop = false) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 800 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const countOf = (p, text) => p.locator('main ol li', { hasText: text }).locator('[data-unread-count]').innerText().then((s) => Number(s.trim()), () => 0)
  const menu = (p) => p.locator('[data-msg-actions]')

  // ── 1. 근무자 W: 숫자만 ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/chat/room/${J}`)
  await wk.locator('main ol').waitFor({ timeout: 8000 }).catch(() => {})
  ok('내 메시지(M1): 안 읽은 1명 (삼동료)', (await countOf(wk, '저 지금 도착했어요')) === 1)
  ok('담당자 메시지(M2): 안 읽은 2명 (이동료·삼동료, 나는 빼고)', (await countOf(wk, '2시까지 A게이트')) === 2)
  await wk.locator('main ol [data-msg-menu]', { hasText: '저 지금 도착했어요' }).click({ button: 'right' })
  await menu(wk).waitFor({ timeout: 3000 }).catch(() => {})
  ok('근무자 메뉴: 이름 목록 없음 (복사·삭제만)', (await menu(wk).locator('[data-unread-item]').count()) === 0 && (await menu(wk).getByRole('menuitem').count()) === 2)
  await wk.keyboard.press('Escape')
  ok('360px: 옆으로 안 밀림', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 근무자가 '안 읽은 사람 알림'을 흉내 내도 안 됨
  await call(wk, 'room', 'nudgeRoomUnread', [J, M2])
  ok('근무자가 알림 보내기를 흉내 내도 안 됨', !(await rest('audit_logs')).some((l) => l.action === 'room.unread_nudge'))

  // ── 2. 방을 열어 두기만 하면 조용 (읽음 기록을 되풀이해 쓰지 않음) ──
  let rsc = 0
  // (화면을 다시 그리는 요청만 셈 — 링크 미리 받기(prefetch)는 빼고)
  const rscLog = []
  wk.on('request', (r) => { const h = r.headers(); if (!r.url().includes('/api/pulse') && !h['next-router-prefetch'] && (h['rsc'] === '1' || r.url().includes('_rsc='))) { rsc++; rscLog.push(`${r.method()} ${r.url().replace(D, '')} ${Object.keys(h).filter((k) => k.startsWith('next')).join(',')}`) } })
  await wk.waitForTimeout(2000) // 바로 앞의 조작된 요청이 끝나고 화면이 가라앉을 때까지
  const pv = () => wk.evaluate(async (u) => (await (await fetch(u)).json()).v, `/api/pulse?s=room&id=${J}`)
  const pv0 = await pv()
  const readBefore = (await rest('job_chat_reads')).find((r) => r.user_id === W && r.job_id === J)?.read_at
  await wk.waitForTimeout(12000)
  const readAfter = (await rest('job_chat_reads')).find((r) => r.user_id === W && r.job_id === J)?.read_at
  // 되풀이(5초마다)면 12초에 2번 넘게 그림 — 한 번쯤(열 때 숫자 맞추기 등)은 괜찮고, 읽음 시각·바뀐 값은 그대로여야 함
  ok('열어 둔 12초 동안 되풀이해 다시 그리지 않음 · 읽음 시각도 그대로', rsc <= 1 && readBefore === readAfter, `rsc=${rsc} ${rscLog.join(' | ')} read ${readBefore}→${readAfter} pulse ${pv0} → ${await pv()}`)

  // ── 3. 담당자: 안 읽은 사람 이름 + 다시 알림 ──
  const ad = await pg(A, true)
  await ad.goto(`${D}/admin/chat/room/${J}`)
  await ad.locator('main ol').waitFor({ timeout: 8000 }).catch(() => {})
  ok('담당자 화면: M2 안 읽은 2명 (W는 방금 읽음)', (await countOf(ad, '2시까지 A게이트')) === 2)
  ok('담당자 화면: M1은 삼동료만 안 읽음 → 1', (await countOf(ad, '저 지금 도착했어요')) === 1)
  await ad.locator('main ol [data-msg-menu]', { hasText: '2시까지 A게이트' }).click({ button: 'right' })
  await menu(ad).waitFor({ timeout: 3000 }).catch(() => {})
  ok("담당자 메뉴: '안 읽은 사람 2명'", (await menu(ad).locator('[data-unread-item]').innerText()).includes('안 읽은 사람 2명'))
  await menu(ad).locator('[data-unread-item]').click()
  const names = (await menu(ad).locator('[data-unread-list] li').allInnerTexts()).map((s) => s.trim()).sort()
  ok('누르면 이름 목록: 이동료 · 삼동료', names.join(',') === '삼동료,이동료', names.join(','))
  const mb = await menu(ad).boundingBox()
  ok('펼친 메뉴도 화면 안', !!mb && mb.y >= 0 && mb.y + mb.height <= 800)
  await menu(ad).locator('[data-unread-nudge]').click()
  ok("'안 읽은 근무자에게 알림' → 2명에게 보냄", await see(ad, '안 읽은 2명에게 알림을 보냈어요', 5000))
  ok('기록 남김', (await rest('audit_logs')).some((l) => l.action === 'room.unread_nudge' && l.actor_id === A && l.detail.includes('2명')))
  await ad.locator('main ol [data-msg-menu]', { hasText: '2시까지 A게이트' }).click({ button: 'right' })
  await menu(ad).locator('[data-unread-item]').click()
  await menu(ad).locator('[data-unread-nudge]').click()
  ok('같은 메시지는 10분 안에 다시 못 보냄', await see(ad, '방금 알림을 보냈어요', 5000))

  // ── 4. 누가 읽으면 담당자 화면 숫자가 곧 줄어듦 ──
  const w2 = await pg(W2)
  await w2.goto(`${D}/me/chat/room/${J}`)
  await w2.locator('main ol').waitFor({ timeout: 8000 }).catch(() => {})
  let n = 2
  for (let i = 0; i < 20 && n !== 1; i++) {
    await ad.waitForTimeout(1000)
    n = await countOf(ad, '2시까지 A게이트')
  }
  ok('이동료가 읽자 담당자 화면 숫자 2 → 1 (몇 초 안에)', n === 1, String(n))

  // ── 5. 지운 메시지는 숫자 없음 ──
  await rest(`job_chat?id=eq.${M1}`, 'PATCH', { body: '::deleted::' })
  await ad.reload()
  await ad.locator('main ol').waitFor({ timeout: 8000 }).catch(() => {})
  ok('지운 메시지 자리엔 숫자 없음', (await ad.locator('main ol li', { has: ad.locator('[data-deleted-msg]') }).locator('[data-unread-count]').count()) === 0)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
