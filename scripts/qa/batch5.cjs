// 묶음 5: 단체방 공지 '누가 봤나' + 안 본 사람만 다시 알림 · 커뮤니티 도배 봇 막기 · 보안 헤더
// · 관리자: 📌 공지 아래 '👀 확인 0/1명' → 근무자가 방을 열면 1/1 '모두 확인' · 안 본 사람만 알림 (10분에 한 번)
// · 커뮤니티: 봇 함정 칸, 같은 글·같은 댓글 또 올리기, 가입 10분 안에는 글쓰기 막힘
// · 응답에 프레임워크 이름 없음, 다른 사이트가 파일 끌어다 쓰기 금지
// node scripts/qa/batch5.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const NEWBIE = '66666666-0000-4000-8000-000000000066'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, timeout = 6000) => p.getByText(t).first().waitFor({ timeout }).then(() => true, () => false)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]

;(async () => {
  // ── 1. 보안 헤더 ──
  const res = await fetch(`${D}/login`)
  ok('응답에 프레임워크 이름(x-powered-by) 없음', !res.headers.get('x-powered-by'))
  ok('다른 사이트가 파일 끌어다 쓰기 금지 (CORP same-origin)', res.headers.get('cross-origin-resource-policy') === 'same-origin')
  ok('결제·USB 같은 기기 기능 끔', /payment=\(\)/.test(res.headers.get('permissions-policy') || '') && /usb=\(\)/.test(res.headers.get('permissions-policy') || ''))

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 2. 단체방 공지: 누가 봤나 ──
  const pinnedAt = new Date().toISOString()
  await rest('job_chat', 'POST', { job_id: J, sender_id: A, from_admin: true, body: '내일 8시 30분까지 정문 앞으로 모여 주세요', pinned_at: pinnedAt, created_at: pinnedAt })
  const ad = await pg(A)
  await ad.goto(`${D}/admin/chat/room/${J}`)
  const reads = ad.locator('[data-pinned-reads]')
  ok('관리자: 공지 아래 확인 0/1명', (await reads.count()) === 1 && (await ad.locator('[data-pinned-count]').innerText()).trim() === '0/1명')
  await reads.locator('summary').click()
  ok('안 본 사람 이름', await see(ad, '아직 안 봄'))
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await ad.locator('[data-pinned-nudge] button').click()
  ok('안 본 1명에게 알림', await see(ad, '안 본 1명에게 알림을 보냈어요'))
  const logs = await rest('audit_logs')
  ok('알림 보낸 기록 남김', logs.some((l) => l.action === 'room.pin_nudge'))
  // 10분 안에 또 보내면 막힘 (서버 함수 직접)
  const nudgeId = idOf('room', 'nudgePinned')
  ok('서버 함수 찾음', !!nudgeId)
  const again = await ad.evaluate(async ({ id, J }) => {
    const body = new FormData()
    body.append('0', JSON.stringify([J, null, '$K1']))
    const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
    return r.text()
  }, { id: nudgeId, J })
  ok('10분 안에 또 보내기: 막힘', again.includes('10분 뒤에'), again.slice(-120))

  const wk = await pg(W)
  await wk.goto(`${D}/me/chat/room/${J}`)
  ok('근무자: 공지 보임', await see(wk, '정문 앞으로 모여'))
  ok('근무자 화면에는 확인 현황 없음', (await wk.locator('[data-pinned-reads]').count()) === 0)
  await wk.waitForTimeout(500)
  await ad.reload()
  ok('근무자가 연 뒤: 1/1명', (await ad.locator('[data-pinned-count]').innerText()).trim() === '1/1명')
  await ad.locator('[data-pinned-reads] summary').click()
  ok('모두 확인 표시 · 알림 버튼 없음', (await see(ad, '모두 확인했어요')) && (await ad.locator('[data-pinned-nudge]').count()) === 0)

  // ── 3. 커뮤니티 도배 봇 막기 ──
  await wk.goto(`${D}/community/new`)
  await wk.fill('#post-title', '주차 정보 나눠요')
  await wk.fill('#post-body', '정문 쪽 주차장은 9시 전에 차요')
  await wk.evaluate(() => { document.querySelector('[data-post-form] input[name=website]').value = 'http://spam.example' })
  await wk.getByRole('button', { name: '올리기' }).click()
  ok('봇 함정 칸을 채우면 막힘', await see(wk, '잠시 뒤에 다시 시도해 주세요'))
  ok('글이 안 올라감', (await rest('community_posts')).length === 0)
  await wk.evaluate(() => { document.querySelector('[data-post-form] input[name=website]').value = '' })
  await wk.getByRole('button', { name: '올리기' }).click()
  await wk.waitForURL(/\/community\/[0-9a-f-]{36}$/, { timeout: 10000 }).catch(() => {})
  const postUrl = wk.url()
  ok('사람은 그대로 올라감', /\/community\/[0-9a-f-]{36}$/.test(postUrl))
  await wk.goto(`${D}/community/new`)
  await wk.fill('#post-title', '주차 정보 나눠요!!')
  await wk.fill('#post-body', '다른 내용이에요')
  await wk.getByRole('button', { name: '올리기' }).click()
  ok('같은 제목(기호만 다름) 또 올리기 막힘', await see(wk, '같은 글을 이미 올렸어요'))
  await wk.goto(postUrl)
  for (let i = 0; i < 2; i++) {
    await wk.locator('[data-comment-form] textarea').fill('저도 궁금했어요')
    await wk.getByRole('button', { name: '댓글 달기' }).click()
    await wk.waitForTimeout(1200)
  }
  ok('같은 댓글 또 달기 막힘', (await see(wk, '같은 댓글을 이미 달았어요')) && (await rest('community_comments')).length === 1)

  // 갓 가입한 계정
  await rest('users', 'POST', { id: NEWBIE, name: '새내기', phone: '01099990000', pin_hash: 's1:x:y', created_at: new Date().toISOString() })
  const nb = await pg(NEWBIE)
  await nb.goto(`${D}/community/new`)
  await nb.fill('#post-title', '안녕하세요 처음이에요')
  await nb.fill('#post-body', '잘 부탁드려요')
  await nb.getByRole('button', { name: '올리기' }).click()
  ok('가입 10분 안: 글쓰기 막힘 안내', await see(nb, '가입하고 10분 뒤부터'))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
