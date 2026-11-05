// 묶음 57: 대화 메시지 복사·삭제 + Enter로 보내기
// · 입력칸: Enter = 보내기 · Shift+Enter = 줄바꿈 · 한글 조합 중 Enter는 보내지 않음 · 휴대폰 자판에 '보내기'
// · 말풍선 꾹 누르기(휴대폰)·오른쪽 클릭(PC) → 복사 · 삭제(내가 쓴 것만, 한 번 더 눌러야) → '삭제된 메시지예요'
// · 상대 메시지·앱이 보낸 현장 알림은 복사만 · 서버에서도 남의 메시지는 거절 · '::deleted::'를 직접 보내도 거절
// · 상대 화면도 몇 초 안에 '삭제된 메시지예요' (pulse 값이 바뀜) · 대화 저장(txt)에도 '(삭제된 메시지예요)'
// · 단체방: 내 글 삭제 · 담당자는 남의 글도 삭제('담당자가 삭제한 메시지예요') · 다른 회사 관리자는 못 지움 · 360px
// node scripts/qa/batch57.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const CO = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000098'
const W2 = 'bbbbbbbb-0000-4000-8000-0000000000b2', A2 = 'aaaaaaaa-0000-4000-8000-0000000000a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
// 화면 안에서 서버 함수를 직접 부름 (조작된 요청 흉내)
const call = (p, file, name, args, form = {}) =>
  p.evaluate(
    async ({ id, args, form }) => {
      const body = new FormData()
      for (const [k, v] of Object.entries(form)) body.append(`_1_${k}`, v)
      body.append('0', JSON.stringify([...args, '$K1']))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return r.text()
    },
    { id: idOf(file, name), args, form },
  )
const pulse = (uid, q) => fetch(`${D}/api/pulse?${q}`, { headers: { cookie: `alba_session=${cookie(uid)}`, 'user-agent': 'Mozilla/5.0' } }).then((r) => r.json()).then((j) => j.v)
// 휴대폰처럼 꾹 누르기 (손가락 포인터를 누른 채 0.6초)
const hold = (loc) =>
  loc.evaluate(async (el) => {
    const r = el.getBoundingClientRect()
    const o = { pointerType: 'touch', isPrimary: true, bubbles: true, clientX: r.left + 10, clientY: r.top + 10, pointerId: 7 }
    el.dispatchEvent(new PointerEvent('pointerdown', o))
    await new Promise((res) => setTimeout(res, 650))
    el.dispatchEvent(new PointerEvent('pointerup', o))
  })

;(async () => {
  // 준비: 회사가 붙은 문의 몇 개 (근무자 글 · 담당자 답장 · 앱이 보낸 지각 알림) + 단체방 동료 W2 · 다른 회사 관리자 A2
  const t = (min) => new Date(Date.now() - min * 60e3).toISOString()
  const msg = (id, from_admin, body, min) => ({ id, thread_user_id: W, sender_id: from_admin ? A : W, from_admin, company_id: CO, job_id: null, body, read_at: null, created_at: t(min), job: null, sender: { name: from_admin ? '관리자' : '근무자' } })
  await rest('messages', 'POST', msg('dddddddd-0000-4000-8000-000000000101', false, '우비 챙겨 가야 하나요?', 20))
  await rest('messages', 'POST', msg('dddddddd-0000-4000-8000-000000000102', true, '네, 비 소식이 있어요. 우비 꼭 챙겨 주세요.', 19))
  await rest('messages', 'POST', msg('dddddddd-0000-4000-8000-000000000103', false, '🕒 지각 알림\n약 10분 늦어요 (도착 예정 09:10)', 18))
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: W2, name: '이동료', phone: '01056565656', attendance: [], ratings: [] })
  await rest('applications', 'POST', { id: '11111111-0000-4000-8000-0000000000e2', job_id: J, user_id: W2, status: 'approved', created_at: new Date().toISOString(), user: { id: W2, name: '이동료', phone: '01056565656', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '이동료', photo_at: null } })
  const [c1] = await rest(`companies?id=eq.${CO}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01022223333', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  await rest('job_chat', 'POST', { id: 'eeeeeeee-0000-4000-8000-000000000201', job_id: J, company_id: CO, sender_id: W2, from_admin: false, body: '저 오늘 처음이에요 잘 부탁드려요', pinned_at: null, created_at: t(15) })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, desktop = false) => {
    const ctx = await b.newContext(desktop ? { viewport: { width: 1280, height: 800 }, locale: 'ko-KR' } : { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: D })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const bubble = (p, text) => p.locator('main ol [data-msg-menu]', { hasText: text }).first()
  const menu = (p) => p.locator('[data-msg-actions]')

  // ── 1. 입력칸: Enter 보내기 · Shift+Enter 줄바꿈 · 한글 조합 중 Enter ──
  const wk = await pg(W)
  await wk.goto(`${D}/me/chat?co=${CO}`)
  const box = wk.locator('textarea[name=body]')
  ok('휴대폰 자판의 Enter가 보내기', (await box.getAttribute('enterkeyhint')) === 'send')
  await box.click()
  await box.pressSequentially('첫 줄')
  await box.press('Shift+Enter')
  await box.pressSequentially('둘째 줄')
  ok('Shift+Enter: 줄바꿈 (안 보냄)', (await box.inputValue()) === '첫 줄\n둘째 줄')
  // 한글 조합 중에 누른 Enter(isComposing)는 글자 확정용 → 보내지 않음
  await box.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })))
  await wk.waitForTimeout(800)
  ok('한글 조합 중 Enter는 보내지 않음', (await box.inputValue()).includes('둘째 줄') && !(await rest('messages')).some((m) => m.body.includes('둘째 줄')))
  await box.press('Enter')
  await wk.getByText('둘째 줄').first().waitFor({ timeout: 8000 }).catch(() => {})
  // (폼으로 보내면 줄바꿈은 \r\n — 보내기 버튼으로 보낼 때와 같음)
  const sent = (await rest('messages')).find((m) => m.body.replace(/\r\n/g, '\n') === '첫 줄\n둘째 줄')
  ok('Enter: 보내기 (두 줄 그대로) + 입력칸 비움', !!sent && (await box.inputValue()) === '', sent ? '' : '안 보내짐')
  await box.press('Enter')
  await wk.waitForTimeout(600)
  ok('빈 칸에서 Enter는 아무 일 없음', (await rest('messages')).filter((m) => m.thread_user_id === W).length === 6)

  // ── 2. 꾹 누르기 메뉴: 내 글 = 복사·삭제 · 담당자 글·현장 알림 = 복사만 ──
  await hold(bubble(wk, '우비 챙겨 가야 하나요?'))
  await menu(wk).waitFor({ timeout: 3000 }).catch(() => {})
  const items = await menu(wk).getByRole('menuitem').allInnerTexts()
  ok('꾹 누르면 메뉴: 복사 · 삭제', items.map((s) => s.trim()).join(',') === '복사,삭제', items.join(','))
  const mb = await menu(wk).boundingBox()
  const composerTop = await wk.locator('[data-vv="end"]').evaluate((el) => el.getBoundingClientRect().top)
  ok('메뉴가 화면 안 · 입력칸에 안 가림 (360px)', !!mb && mb.x >= 0 && mb.x + mb.width <= 360 && mb.y + mb.height <= composerTop + 1, JSON.stringify(mb))
  await menu(wk).getByRole('menuitem', { name: '복사' }).click()
  ok('복사: 클립보드에 글 + 알림', (await wk.evaluate(() => navigator.clipboard.readText())) === '우비 챙겨 가야 하나요?' && (await see(wk, '복사했어요', 3000)))
  ok('복사하면 메뉴 닫힘', (await menu(wk).count()) === 0)

  await hold(bubble(wk, '비 소식이 있어요'))
  await menu(wk).waitFor({ timeout: 3000 }).catch(() => {})
  ok('담당자 답장: 복사만', (await menu(wk).getByRole('menuitem').allInnerTexts()).map((s) => s.trim()).join(',') === '복사')
  await wk.keyboard.press('Escape')
  ok('Esc로 메뉴 닫힘', (await menu(wk).count()) === 0)
  await hold(bubble(wk, '지각 알림'))
  await menu(wk).waitFor({ timeout: 3000 }).catch(() => {})
  ok('앱이 보낸 현장 알림: 복사만 (기록이라 삭제 없음)', (await menu(wk).getByRole('menuitem').allInnerTexts()).map((s) => s.trim()).join(',') === '복사')
  await wk.locator('main h1').first().click() // 바깥(제목)을 누름 — 링크가 아닌 곳
  ok('바깥을 누르면 메뉴 닫힘', (await menu(wk).count()) === 0)

  // ── 3. 삭제: 한 번 더 눌러야 · 자리에 '삭제된 메시지예요' · 상대도 곧 ──
  const ad = await pg(A, true)
  await ad.goto(`${D}/admin/chat/${W}`)
  ok('관리자 화면: 지우기 전 글이 보임', await see(ad, '우비 챙겨 가야 하나요?'))
  const before = await pulse(A, 's=admin-chat')
  await hold(bubble(wk, '우비 챙겨 가야 하나요?'))
  await menu(wk).waitFor({ timeout: 3000 }).catch(() => {})
  await menu(wk).getByRole('menuitem', { name: '삭제' }).click()
  ok('삭제 한 번: 아직 안 지우고 확인 문구', (await see(wk, '한 번 더 누르면 삭제', 2000)) && (await rest('messages')).some((m) => m.body === '우비 챙겨 가야 하나요?'))
  await menu(wk).getByRole('menuitem', { name: '한 번 더 누르면 삭제' }).click()
  await wk.locator('[data-deleted-msg]').first().waitFor({ timeout: 8000 }).catch(() => {})
  const row = (await rest('messages')).find((m) => m.id === 'dddddddd-0000-4000-8000-000000000101')
  ok('삭제: 자리에 \'삭제된 메시지예요\' · 글은 남기지 않음', (await wk.locator('[data-deleted-msg]', { hasText: '삭제된 메시지예요' }).count()) === 1 && (await wk.getByText('우비 챙겨 가야 하나요?').count()) === 0 && row?.body === '::deleted::')
  ok('지운 메시지는 메뉴 없음', (await wk.locator('main ol [data-msg-menu]', { has: wk.locator('[data-deleted-msg]') }).count()) === 0)
  ok('상대(관리자) 쪽 값이 바뀜 → 몇 초 안에 다시 그림', (await pulse(A, 's=admin-chat')) !== before)
  await ad.locator('[data-deleted-msg]').first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('관리자 화면도 곧 \'삭제된 메시지예요\'', (await ad.locator('[data-deleted-msg]').count()) === 1 && (await ad.getByText('우비 챙겨 가야 하나요?').count()) === 0)
  const audit = (await rest('audit_logs')).filter((l) => l.action === 'chat.delete')
  ok('기록: 누가 언제 지웠는지 (글 내용 없이)', audit.length === 1 && audit[0].actor_id === W && !audit[0].detail)
  const txt = await wk.evaluate(async (u) => (await fetch(u)).text(), `/me/chat/export?co=${CO}`)
  ok('대화 저장(txt): \'(삭제된 메시지예요)\'', txt.includes('(삭제된 메시지예요)') && !txt.includes('::deleted::') && !txt.includes('우비 챙겨 가야 하나요?'))

  // ── 4. PC: 오른쪽 클릭 · 관리자는 내 답장만 지움 ──
  await bubble(ad, '비 소식이 있어요').click({ button: 'right' })
  await menu(ad).waitFor({ timeout: 3000 }).catch(() => {})
  ok('PC 오른쪽 클릭: 내 답장 = 복사·삭제', (await menu(ad).getByRole('menuitem').allInnerTexts()).map((s) => s.trim()).join(',') === '복사,삭제')
  await ad.keyboard.press('Escape')
  await bubble(ad, '첫 줄').click({ button: 'right' })
  await menu(ad).waitFor({ timeout: 3000 }).catch(() => {})
  ok('PC: 근무자 글 = 복사만', (await menu(ad).getByRole('menuitem').allInnerTexts()).map((s) => s.trim()).join(',') === '복사')
  await ad.keyboard.press('Escape')
  // 키보드로도: 말풍선에 초점 → Enter
  await bubble(ad, '비 소식이 있어요').focus()
  await ad.keyboard.press('Enter')
  ok('키보드(Enter)로도 메뉴', await menu(ad).waitFor({ timeout: 3000 }).then(() => true, () => false))
  await ad.keyboard.press('Escape')

  // ── 5. 서버에서도 막음 (조작된 요청) ──
  let r = await call(wk, 'chat', 'deleteMessage', ['dddddddd-0000-4000-8000-000000000102'])
  ok('근무자가 담당자 답장을 지우려 하면 거절', r.includes('내가 보낸 메시지만') && (await rest('messages')).some((m) => m.body.startsWith('네, 비 소식이 있어요')))
  r = await call(wk, 'chat', 'deleteMessage', ['dddddddd-0000-4000-8000-000000000103'])
  ok('현장 알림은 서버에서도 안 지워짐', r.includes('처리 기록') && (await rest('messages')).some((m) => m.body.startsWith('🕒 지각 알림')))
  const a2 = await pg(A2, true)
  await a2.goto(`${D}/admin`)
  r = await call(a2, 'chat', 'deleteMessage', ['dddddddd-0000-4000-8000-000000000102'])
  ok('다른 관리자가 남의 답장을 지우려 하면 거절', r.includes('내가 보낸 메시지만'))
  r = await call(wk, 'chat', 'sendInquiry', [CO, null, null], { body: '::deleted::' })
  ok("'삭제된 메시지' 표시를 직접 보내면 거절", r.includes('보낼 수 없는 내용') && !(await rest('messages')).some((m) => m.body === '::deleted::' && m.id !== 'dddddddd-0000-4000-8000-000000000101'))
  r = await call(wk, 'chat', 'deleteMessage', ['nope'])
  ok('이상한 번호는 거절', r.includes('잘못된 요청'))

  // ── 6. 단체방: 내 글 삭제 · 담당자는 남의 글도 · 다른 회사 관리자는 못 지움 ──
  const roomPath = `/me/chat/room/${J}`
  await wk.goto(`${D}${roomPath}`)
  await wk.locator('textarea[name=body]').fill('오늘 몇 시에 모이나요?')
  await wk.locator('textarea[name=body]').press('Enter')
  ok('단체방: Enter로 보내기', await see(wk, '오늘 몇 시에 모이나요?'))
  await hold(bubble(wk, '처음이에요'))
  await menu(wk).waitFor({ timeout: 3000 }).catch(() => {})
  ok('단체방: 동료 글 = 복사만', (await menu(wk).getByRole('menuitem').allInnerTexts()).map((s) => s.trim()).join(',') === '복사')
  await wk.keyboard.press('Escape')
  const mineId = (await rest('job_chat')).find((m) => m.body === '오늘 몇 시에 모이나요?')?.id
  const roomBefore = await pulse(W2, `s=room&id=${J}`)
  await hold(bubble(wk, '오늘 몇 시에 모이나요?'))
  await menu(wk).waitFor({ timeout: 3000 }).catch(() => {})
  await menu(wk).getByRole('menuitem', { name: '삭제' }).click()
  await menu(wk).getByRole('menuitem', { name: '한 번 더 누르면 삭제' }).click()
  await wk.locator('[data-deleted-msg]').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('단체방: 내 글 삭제 → \'삭제된 메시지예요\'', (await wk.locator('[data-deleted-msg]', { hasText: '삭제된 메시지예요' }).count()) === 1 && (await rest('job_chat')).find((m) => m.id === mineId)?.body === '::deleted::')
  ok('단체방: 다른 사람 쪽 값도 바뀜', (await pulse(W2, `s=room&id=${J}`)) !== roomBefore)
  r = await call(wk, 'room', 'deleteRoomMessage', [J, 'eeeeeeee-0000-4000-8000-000000000201'])
  ok('단체방: 근무자가 동료 글을 지우려 하면 거절', r.includes('내가 보낸 메시지만') && (await rest('job_chat')).some((m) => m.body === '저 오늘 처음이에요 잘 부탁드려요'))
  await a2.goto(`${D}/admin`)
  r = await call(a2, 'room', 'deleteRoomMessage', [J, 'eeeeeeee-0000-4000-8000-000000000201'])
  ok('단체방: 다른 회사 관리자는 거절', r.includes('들어갈 수 없어요') && (await rest('job_chat')).some((m) => m.body === '저 오늘 처음이에요 잘 부탁드려요'))
  await ad.goto(`${D}/admin/chat/room/${J}`)
  await bubble(ad, '처음이에요').click({ button: 'right' })
  await menu(ad).waitFor({ timeout: 3000 }).catch(() => {})
  const adminItems = (await menu(ad).getByRole('menuitem').allInnerTexts()).map((s) => s.trim())
  ok('단체방 담당자: 근무자 글도 복사·삭제 (방 정리) + 안 읽은 사람', adminItems[0] === '복사' && adminItems.at(-1) === '삭제' && /안 읽은 사람|모두 읽었어요/.test(adminItems[1] ?? ''), adminItems.join(','))
  await menu(ad).getByRole('menuitem', { name: '삭제' }).click()
  await menu(ad).getByRole('menuitem', { name: '한 번 더 누르면 삭제' }).click()
  await ad.locator('[data-deleted-msg]', { hasText: '담당자가 삭제한 메시지예요' }).first().waitFor({ timeout: 8000 }).catch(() => {})
  ok("담당자가 지운 글: '담당자가 삭제한 메시지예요'", (await ad.locator('[data-deleted-msg]', { hasText: '담당자가 삭제한 메시지예요' }).count()) === 1 && (await rest('job_chat')).find((m) => m.id === 'eeeeeeee-0000-4000-8000-000000000201')?.body === '::deleted-admin::')
  ok('기록: 담당자가 남의 글을 지움', (await rest('audit_logs')).some((l) => l.action === 'room.delete_other' && l.actor_id === A && l.target_user_id === W2))
  await wk.goto(`${D}${roomPath}`)
  ok('근무자 화면: 두 자리 모두 지운 표시 · 360px 옆으로 안 밀림', (await wk.locator('[data-deleted-msg]').count()) === 2 && (await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
