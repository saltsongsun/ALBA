// 묶음 32: '일하는 쥐돌이' 이모티콘 21종 (기본 팩) — 대화(근무자·관리자, 1:1·단체방) · 커뮤니티 글·댓글
// · 고르기 창: 쥐돌이 탭이 먼저 열림(21종, 21번 '오늘 회식하실 분?' 포함) · 작은 그림은 128px(thumbs) · 문구가 보임 · 병아리 탭도 그대로
// · 보내면 '::s:working-mouse-NN::'로 저장, 화면엔 512px 그림 + 대체 글자 · 쓰던 글은 입력칸에 그대로 · 없는 아이디는 거절
// · 예전 병아리·옛 이모티콘 메시지도 그대로 보임 · 알림·목록 미리보기·내려받기는 '[이모티콘] 문구'
// · 커뮤니티: 글에 이모티콘 하나(목록엔 작은 그림, 고치기에서 빼기) · 이모티콘 댓글 · 직접 써 넣은 이모티콘 줄은 빠짐
// · 키보드: ←→ 탭 · Esc 닫기 · 어두운 화면 · 360px
// node scripts/qa/batch32.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const noScroll = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]
// 화면 안에서 서버 함수를 직접 부름 (조작된 요청 흉내)
const call = (p, file, name, args, form) =>
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
// 그림이 실제로 불러와졌는지 + 원래 크기
const natural = (loc) => loc.evaluate((i) => (i.complete && i.naturalWidth > 0 ? i.naturalWidth : new Promise((r) => { i.onload = () => r(i.naturalWidth); i.onerror = () => r(0) })))

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const picker = (p) => p.locator('[data-sticker-picker]')
  // 이모티콘 고르기 창 열기 (화면이 막 그려져 아직 누르기가 연결되기 전이면 다시 누름)
  const openPicker = async (p, scope = '') => {
    for (let i = 0; i < 4; i++) {
      await p.locator(`${scope} [data-sticker-toggle]`.trim()).first().click()
      if (await picker(p).waitFor({ timeout: 2500 }).then(() => true, () => false)) return true
      await p.waitForLoadState('networkidle').catch(() => {})
    }
    return false
  }

  // ── 1. 근무자 1:1 문의: 고르기 창 ──
  // (가짜 DB는 정렬을 안 해서, 미리 들어 있던 예시 문의를 지워 방금 보낸 것이 '마지막'이 되게 — chat-room.cjs와 같음)
  await fetch(`${MD}/rest/v1/messages?thread_user_id=eq.${W}`, { method: 'DELETE' })
  const w = await pg(W)
  await w.goto(`${D}/me/chat?co=${C1}`)
  await w.locator('textarea[name=body]').fill('쓰던 글 그대로')
  await openPicker(w)
  const tabs = picker(w).getByRole('tab')
  ok('팩 탭 2개: 일하는 쥐돌이(먼저·선택됨) · 병아리', (await tabs.count()) === 2 && (await tabs.nth(0).innerText()).includes('일하는 쥐돌이') && (await tabs.nth(0).getAttribute('aria-selected')) === 'true' && (await tabs.nth(1).innerText()).includes('병아리'))
  const grid = picker(w).locator('[data-sticker-grid=working-mouse-21] button')
  ok('쥐돌이 21종', (await grid.count()) === 21, String(await grid.count()))
  const labels = await grid.allInnerTexts()
  ok("21번 '오늘 회식하실 분?' · 1번 '출근했쥐!' 문구가 보임", labels.at(-1)?.includes('오늘 회식하실 분?') && labels[0]?.includes('출근했쥐!'), JSON.stringify([labels[0], labels.at(-1)]))
  const thumbs = await picker(w).locator('[data-sticker-grid] img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')))
  ok('고르기 창은 작은 그림(128px thumbs)', thumbs.length === 21 && thumbs.every((s) => s.startsWith('/stickers/working-mouse-21/thumbs/')), thumbs[0])
  ok('작은 그림이 실제로 불러와짐 (128px)', (await natural(picker(w).locator('[data-sticker-grid] img').last())) === 128)
  ok('문구 글자가 칸 밖으로 안 넘침 · 360px', (await grid.last().evaluate((el) => el.scrollWidth <= el.clientWidth + 1)) && (await noScroll(w)))
  // 키보드: 처음엔 쥐돌이 탭에 초점 → → 병아리 → ← 쥐돌이 · Esc 닫기 → 이모티콘 버튼으로
  ok('열면 지금 팩 탭에 초점', await w.evaluate(() => document.activeElement?.getAttribute('data-pack') === 'working-mouse-21'))
  await w.keyboard.press('ArrowRight')
  await picker(w).locator('[data-sticker-grid=chick] button').nth(21).waitFor({ timeout: 5000 }).catch(() => {})
  ok('→ 병아리 탭 (22종)', (await picker(w).locator('[data-sticker-grid=chick] button').count()) === 22 && (await w.evaluate(() => document.activeElement?.getAttribute('data-pack'))) === 'chick')
  await w.keyboard.press('ArrowLeft')
  await picker(w).locator('[data-sticker-grid=working-mouse-21]').waitFor({ timeout: 5000 }).catch(() => {})
  ok('← 다시 쥐돌이', (await picker(w).locator('[data-sticker-grid=working-mouse-21]').count()) === 1)
  await w.keyboard.press('Escape')
  ok('Esc: 닫히고 이모티콘 버튼으로', (await picker(w).count()) === 0 && (await w.evaluate(() => document.activeElement?.hasAttribute('data-sticker-toggle'))))

  // 보내기: '오늘 회식하실 분?'
  await openPicker(w)
  await picker(w).getByRole('button', { name: '오늘 회식하실 분?' }).click()
  const sent = w.locator('main ol img[alt="이모티콘: 오늘 회식하실 분?"]')
  await sent.first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('보내면 대화에 그림 (대체 글자: 이모티콘: 문구)', (await sent.count()) >= 1)
  ok('대화의 그림은 512px PNG', (await sent.first().getAttribute('src')) === '/stickers/working-mouse-21/21-team-dinner.png' && (await natural(sent.first())) === 512)
  ok('쓰던 글은 입력칸에 그대로', (await w.locator('textarea[name=body]').inputValue()) === '쓰던 글 그대로')
  ok('저장: ::s:working-mouse-21::', (await rest(`messages?thread_user_id=eq.${W}`)).some((m) => m.body === '::s:working-mouse-21::' && m.from_admin === false && m.company_id === C1))
  let r = await call(w, 'chat', 'sendInquiry', [C1, null, null], { body: '::s:working-mouse-99::' })
  ok('없는 쥐돌이 번호는 거절', r.includes('보낼 수 없는 이모티콘이에요'), r.slice(0, 120))

  // ── 2. 관리자: 받은 쥐돌이 보기 · 쥐돌이로 답장 · 목록 미리보기 ──
  // (가짜 DB는 새 메시지에 보낸 사람을 붙이지 않아서 직접 붙임 — 실제 DB는 자동)
  const dm = (await rest(`messages?thread_user_id=eq.${W}`)).find((m) => m.body === '::s:working-mouse-21::')
  if (dm) await rest(`messages?id=eq.${dm.id}`, 'PATCH', { user: { id: W, name: '근무자', phone: '01033334444', photo_at: null } })
  const ad = await pg(A)
  await ad.goto(`${D}/admin/chat`)
  ok('관리자 목록 미리보기: [이모티콘] 오늘 회식하실 분?', await see(ad, '[이모티콘] 오늘 회식하실 분?'))
  await ad.goto(`${D}/admin/chat/${W}`)
  ok('관리자 대화: 쥐돌이 그림', await ad.locator('main ol img[alt="이모티콘: 오늘 회식하실 분?"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  await openPicker(ad)
  ok('관리자 고르기 창도 쥐돌이가 기본', (await picker(ad).locator('[data-sticker-grid=working-mouse-21] button').count()) === 21)
  await picker(ad).getByRole('button', { name: '넵! 확인!' }).click()
  await ad.locator('main ol img[alt="이모티콘: 넵! 확인!"]').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('관리자: 쥐돌이로 답장', (await rest(`messages?thread_user_id=eq.${W}`)).some((m) => m.body === '::s:working-mouse-04::' && m.from_admin === true))
  ok('관리자 360px: 고르기 창 열어도 옆으로 안 밀림', await (async () => { await openPicker(ad); return noScroll(ad) })())
  await w.reload()
  ok('근무자: 관리자 답장 쥐돌이 그림', await w.locator('main ol img[alt="이모티콘: 넵! 확인!"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false))

  // ── 3. 단체방 (근무자·관리자) ──
  await w.goto(`${D}/me/chat/room/${J}`)
  await openPicker(w)
  await picker(w).getByRole('button', { name: '출근했쥐!' }).click()
  await w.locator('main img[alt="이모티콘: 출근했쥐!"]').first().waitFor({ timeout: 8000 }).catch(() => {})
  ok('단체방: 쥐돌이 보내기 · 저장', (await w.locator('main img[alt="이모티콘: 출근했쥐!"]').count()) >= 1 && (await rest(`job_chat?job_id=eq.${J}`)).some((m) => m.body === '::s:working-mouse-01::'))
  await ad.goto(`${D}/admin/chat/room/${J}`)
  ok('관리자 단체방: 쥐돌이 그림', await ad.locator('main img[alt="이모티콘: 출근했쥐!"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  const ex = await w.evaluate(async (u) => (await fetch(u, { cache: 'no-store' })).text(), `/me/chat/room/${J}/export`).catch(() => '')
  ok('대화 내려받기: [이모티콘] 출근했쥐!', ex.includes('[이모티콘] 출근했쥐!'), ex.slice(0, 80))

  // ── 4. 이미 보낸 병아리·옛 이모티콘도 그대로 ──
  for (const body of ['::s:hi::', '::s:late::']) await rest('messages', 'POST', { thread_user_id: W, sender_id: W, from_admin: false, job_id: null, company_id: C1, body, read_at: null, created_at: new Date().toISOString() })
  await w.goto(`${D}/me/chat?co=${C1}`)
  const chick = w.locator('main ol img[alt="이모티콘: 안녕하세요"]')
  // (스트리밍으로 그려진 내용은 페이지 'load' 직후 잠깐 뒤에 드러날 수 있어 기다림)
  await chick.first().waitFor({ timeout: 8000 }).catch(() => {})
  const why = async () => JSON.stringify({ alts: await w.locator('main ol img').evaluateAll((l) => l.map((i) => i.alt)), db: (await rest(`messages?thread_user_id=eq.${W}`)).map((m) => m.body), url: w.url(), text: (await w.locator('main').innerText()).slice(0, 300).replace(/\n/g, ' / ') })
  ok('예전 병아리 메시지: 그림 그대로', (await chick.count()) >= 1 && (await chick.first().getAttribute('src')) === '/stickers/hi.webp' && (await natural(chick.first())) > 0, (await chick.count()) ? '' : await why())
  ok('옛 이모티콘(그림 없음): 글자로', (await w.locator('main ol [role=img][aria-label="이모티콘: 조금 늦어요"]').count()) === 1)
  // 병아리도 여전히 보낼 수 있음
  await openPicker(w)
  await picker(w).getByRole('tab', { name: /병아리/ }).click()
  await picker(w).getByRole('button', { name: '오늘도 파이팅!' }).click()
  ok('병아리 탭에서 보내기도 됨', await w.locator('main ol img[alt="이모티콘: 오늘도 파이팅!"]').first().waitFor({ timeout: 8000 }).then(() => true, () => false))

  // ── 5. 커뮤니티: 글에 쥐돌이 하나 ──
  await w.goto(`${D}/community/new`)
  await w.locator('[data-post-form] label', { hasText: '자유' }).click()
  await w.fill('#post-title', '오늘 행사 끝나고 회식')
  await w.fill('#post-body', '광장 앞 고깃집 7시 어때요?\n::s:working-mouse-08::')
  await openPicker(w, '[data-post-sticker]')
  await picker(w).getByRole('button', { name: '오늘 회식하실 분?' }).click()
  ok('글쓰기: 넣은 이모티콘 미리보기', (await w.locator('[data-post-sticker] img[alt="이모티콘: 오늘 회식하실 분?"]').count()) === 1)
  await w.getByRole('button', { name: '올리기' }).click()
  await w.waitForURL(/\/community\/[0-9a-f-]{36}(\?|$)/, { timeout: 10000 }).catch(() => {})
  const postId = w.url().split('?')[0].split('/').pop()
  const view = w.locator('[data-post-sticker-view] img')
  ok('글 화면: 내용 + 맨 아래 쥐돌이 그림(512px)', (await see(w, '광장 앞 고깃집 7시 어때요?')) && (await view.getAttribute('alt')) === '이모티콘: 오늘 회식하실 분?' && (await natural(view)) === 512)
  const [saved] = await rest(`community_posts?id=eq.${postId}`)
  ok('저장: 내용 끝에 ::s:working-mouse-21:: 한 줄 · 직접 쓴 이모티콘 줄은 빠짐', saved?.body === '광장 앞 고깃집 7시 어때요?\n\n::s:working-mouse-21::', JSON.stringify(saved?.body))
  ok('글 화면에 이모티콘 글자(::s:)가 안 보임', !(await w.locator('main').innerText()).includes('::s:'))
  await w.goto(`${D}/community`)
  const thumb = w.locator(`a[href="/community/${postId}"] [data-post-sticker-thumb]`)
  ok('목록: 작은 그림(thumbs) · 글자 미리보기엔 ::s: 없음', (await thumb.getAttribute('src')) === '/stickers/working-mouse-21/thumbs/21-team-dinner.png' && !(await w.locator(`a[href="/community/${postId}"]`).innerText()).includes('::s:'))

  // 고치기: 넣은 이모티콘이 보이고, 빼고 저장하면 없어짐
  await w.goto(`${D}/community/${postId}/edit`)
  ok('고치기: 넣은 이모티콘 그대로 · 내용 칸엔 글자만', (await w.locator('[data-post-sticker] img[alt="이모티콘: 오늘 회식하실 분?"]').count()) === 1 && (await w.locator('#post-body').inputValue()) === '광장 앞 고깃집 7시 어때요?')
  await w.locator('[data-post-sticker]').getByRole('button', { name: '빼기' }).click()
  await w.getByRole('button', { name: '고친 내용 저장' }).click()
  await w.waitForURL(new RegExp(`/community/${postId}(\\?|$)`), { timeout: 10000 }).catch(() => {})
  await w.waitForTimeout(500)
  const [edited] = await rest(`community_posts?id=eq.${postId}`)
  ok('빼고 저장: 이모티콘 줄 없어짐', edited?.body === '광장 앞 고깃집 7시 어때요?', JSON.stringify(edited?.body))

  // ── 6. 커뮤니티 이모티콘 댓글 ──
  await w.goto(`${D}/community/${postId}`)
  await w.locator('[data-comment-form] textarea').fill('저도 갈래요')
  await openPicker(w, '[data-comment-form]')
  await picker(w).getByRole('button', { name: '완전 공감!' }).click()
  const cs = w.locator('[data-comment-sticker] img[alt="이모티콘: 완전 공감!"]')
  ok('이모티콘 댓글: 그림으로', await cs.first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('댓글 저장: ::s:working-mouse-11:: · 쓰던 댓글은 칸에 그대로', (await rest(`community_comments?post_id=eq.${postId}`)).some((c) => c.body === '::s:working-mouse-11::') && (await w.locator('[data-comment-form] textarea').inputValue()) === '저도 갈래요')
  r = await call(w, 'community', 'addComment', [postId, null], { body: '::s:working-mouse-77::', website: '' })
  ok('없는 이모티콘 댓글은 거절', r.includes('보낼 수 없는 이모티콘이에요'), r.slice(0, 120))
  ok('360px: 글 화면 옆으로 안 밀림', await noScroll(w))

  // ── 7. 어두운 화면: 그림·고르기 창 ──
  const dk = await pg(W)
  await dk.addInitScript(() => { try { localStorage.setItem('theme', 'dark') } catch {} })
  await dk.goto(`${D}/me/chat?co=${C1}`)
  await openPicker(dk)
  const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255]; return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] }
  const pickBg = await picker(dk).evaluate((el) => getComputedStyle(el).backgroundColor)
  const labelColor = await picker(dk).locator('[data-sticker-grid] button span').first().evaluate((el) => getComputedStyle(el).color)
  ok('어두운 화면: 고르기 창은 어둡고 문구는 밝게', (await dk.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && lum(pickBg) < 80 && lum(labelColor) > 120, `${pickBg} / ${labelColor}`)
  ok('어두운 화면: 대화의 쥐돌이 그림도 보임', (await natural(dk.locator('main ol img[alt="이모티콘: 오늘 회식하실 분?"]').first())) === 512)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
