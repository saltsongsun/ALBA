// 얼굴 사진이 없으면 지원 전에 올리게 + 알림 켜기 권유
// · 사진 없는 근무자: 공고에서 지원 칸 대신 사진 올리기 → 올리면 바로 지원 칸 · 서버도 사진 없으면 지원 거절
// · 지원 직후: 알림 켜기 권유 창(공고마다 한 번) + 상태 카드에 '알림 켜기' → 누르면 알림 등록
// · 내 근무: 권유 창 ('나중에'면 하루 쉼) · 사진 등록 창이 먼저, 닫으면 그다음 알림 권유
// · 막힘이면 허용 방법, 카카오톡 안이면 크롬으로 여는 안내 · 전문가 화면도 · 자동 점검 브라우저엔 안 뜸 · 360px
// node scripts/qa/photo-push-nudge.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MD] = process.argv.slice(2)
const W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const J2 = 'cccccccc-0000-4000-8000-0000000000d2', EX = '44444444-0000-4000-8000-0000000000f5', EX2 = '44444444-0000-4000-8000-0000000000f6'
const FACE = path.join(__dirname, 'face.jpg')
const tomorrow = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10)
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]

// 브라우저 알림 흉내: 사람이 쓰는 브라우저처럼(webdriver 아님) + 알림 허용·등록은 가짜로 (실제 푸시 서비스 없이)
function fakePush({ permission = 'default', inapp = false } = {}) {
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
  if (inapp) {
    delete window.PushManager
    return
  }
  let perm = permission
  Object.defineProperty(Notification, 'permission', { get: () => perm })
  Notification.requestPermission = async () => (perm = perm === 'denied' ? 'denied' : 'granted')
  const fake = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/nudge-test',
    toJSON() {
      return { endpoint: this.endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } }
    },
    unsubscribe: async () => true,
  }
  let on = false
  PushManager.prototype.getSubscription = async () => (on ? fake : null)
  PushManager.prototype.subscribe = async () => ((on = true), fake)
}

;(async () => {
  // 저녁(18시 뒤)에 돌려도 같은 결과: 가짜 공고(오늘 9~18시)를 오늘 23:59까지로 — 18시가 지나면 기다리던 지원이 '행사가 끝나 미확정'으로 바뀌어서
  await rest(`jobs?id=eq.${J}`, 'PATCH', { end_time: '23:59:00' })
  for (const a of (await rest(`applications?job_id=eq.${J}`)) ?? []) if (a.job) await rest(`applications?id=eq.${a.id}`, 'PATCH', { job: { ...a.job, end_time: '23:59:00' } })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, title: '내일 행사 안내 스태프', start_date: tomorrow, end_date: tomorrow, status: 'open', applications: [], required_docs: [] })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: EX, name: '김음향', phone: '01088880001', member_type: 'expert', photo_at: '2026-10-29T00:00:00Z', attendance: [], ratings: [] })
  await rest('users', 'POST', { ...w, id: EX2, name: '이조명', phone: '01088880002', member_type: 'expert', photo_at: null, attendance: [], ratings: [] })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}, fake = undefined) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    if (fake) await ctx.addInitScript(fakePush, fake)
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const nudge = (p) => p.locator('dialog[data-push-nudge]')
  const photoBox = (p) => p.locator('dialog[aria-labelledby=photo-prompt-title]')
  const isOpen = (loc, ms = 4000) => loc.and(loc.page().locator('dialog[open]')).waitFor({ timeout: ms }).then(() => true, () => false)

  // ── 1. 사진 없는 근무자: 지원 칸 대신 사진 올리기 ──
  const wk = await pg(W, {}, {})
  await wk.goto(`${D}/jobs/${J2}`)
  ok('사진 없음: 사진 먼저 올리라는 안내', await see(wk, '📷 얼굴 사진을 먼저 올려 주세요'))
  ok('사진 없음: 지원 칸·지원 버튼 없음', (await wk.locator('#message').count()) === 0 && (await wk.getByRole('button', { name: /으로 지원하기/ }).count()) === 0)
  ok('360px: 옆으로 안 밀림', await wk.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 서버도 거절 (화면을 건너뛰고 요청을 보내도)
  const forged = await wk.evaluate(
    async ({ id }) => {
      const body = new FormData()
      body.append('_1_message', '사진 없이 지원')
      body.append('0', JSON.stringify(['cccccccc-0000-4000-8000-0000000000d2', '$K1']))
      const r = await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body })
      return decodeURIComponent(r.headers.get('x-action-redirect') || '')
    },
    { id: idOf('worker', 'applyJob') },
  )
  ok('서버: 사진 없으면 지원 거절', forged.includes('얼굴 사진을 먼저 올려 주세요'), forged)
  ok('거절된 지원은 저장 안 됨', (await rest('applications')).every((a) => !(a.job_id === J2 && a.user_id === W)))

  // 사진을 올리면 바로 지원 칸
  await wk.locator('input[type=file]').first().setInputFiles(FACE)
  await wk.locator('#message').waitFor({ timeout: 15000 }).catch(() => {})
  ok('사진 올리면 바로 지원 칸이 나옴', (await wk.locator('#message').count()) === 1)
  ok('사진 저장됨', !!(await rest(`users?id=eq.${W}`))[0].photo_at)

  // ── 2. 지원 직후: 알림 켜기 권유 ──
  await wk.getByRole('button', { name: /으로 지원하기/ }).click()
  await wk.getByRole('button', { name: '한 번 더 누르면 지원돼요' }).click()
  ok('지원 접수', await see(wk, '지원이 접수됐어요', 15000))
  ok('지원 직후 알림 권유 창', (await isOpen(nudge(wk), 8000)) && (await nudge(wk).getByText('알림을 켜 주세요').isVisible()) && (await nudge(wk).getByText('확정되면 바로 알려 드릴게요').isVisible()))
  const title = await nudge(wk).locator('h2').boundingBox()
  ok('360px: 권유 창 제목 한 줄', !!title && title.height < 36, JSON.stringify(title))
  await nudge(wk).getByRole('button', { name: '알림 켜기' }).click()
  ok('누르면 알림 켜짐 안내', await see(wk, '알림을 켰어요'))
  ok('알림 등록 저장', (await rest('push_subscriptions')).some((s) => s.user_id === W && s.endpoint.endsWith('/nudge-test')))
  await wk.reload()
  ok('다시 열어도 같은 공고에선 또 안 뜸', !(await isOpen(nudge(wk), 2500)))

  // 상태 카드의 알림 켜기 (권유 창을 닫은 사람도 여기서)
  const ap = await pg(AP, {}, {})
  await ap.goto(`${D}/jobs/${J}`)
  ok('지원한 공고 다시 열면 권유 창 (처음 한 번)', await isOpen(nudge(ap), 8000))
  await nudge(ap).getByRole('button', { name: '나중에 할게요' }).click()
  ok('상태 카드에도 알림 켜기', (await see(ap, '확정되면 바로 알려 드려요')) && (await ap.getByRole('button', { name: '알림 켜기' }).first().isVisible()))

  // ── 3. 내 근무: 하루 한 번 권유 ──
  await ap.goto(`${D}/me`)
  ok('내 근무: 방금 나중에 눌렀으면 안 뜸 (하루 쉼)', !(await isOpen(nudge(ap), 2500)))
  await ap.evaluate(() => localStorage.setItem('alba_push_nudge_until', String(Date.now() - 1000)))
  await ap.reload()
  ok('하루 지나면 내 근무에서 다시 권유', (await isOpen(nudge(ap), 8000)) && (await nudge(ap).getByText('알림을 켜야 확정 소식을 놓치지 않아요').isVisible()))
  ok('권유 창에 받을 소식 (확정·전날 안내·급여)', (await nudge(ap).getByText('✅ 근무 확정').isVisible()) && (await nudge(ap).getByText('💸 급여 지급').isVisible()))

  // 사진 없는 사람: 사진 창 먼저, 닫으면 알림 권유
  await rest(`users?id=eq.${W}`, 'PATCH', { photo_at: null })
  await rest(`push_subscriptions?user_id=eq.${W}`, 'DELETE')
  const w2 = await pg(W, {}, {})
  await w2.goto(`${D}/me`)
  ok('사진 없음: 사진 등록 창 먼저', await isOpen(photoBox(w2), 8000))
  ok('그동안 알림 권유는 안 뜸', !(await isOpen(nudge(w2), 1500)))
  await photoBox(w2).getByRole('button', { name: '나중에 할게요' }).click()
  ok('사진 창 닫으면 알림 권유', await isOpen(nudge(w2), 5000))

  // ── 4. 막힘·카카오톡 안 ──
  const den = await pg(AP, {}, { permission: 'denied' })
  await den.goto(`${D}/me`)
  ok('알림 막힘: 허용 방법 안내', (await isOpen(nudge(den), 8000)) && (await see(den, '알림이 막혀 있어요')) && (await see(den, '권한(사이트 설정) → 알림 → 허용')))
  await nudge(den).getByRole('button', { name: '확인했어요' }).click()
  ok('확인하면 닫힘', !(await isOpen(nudge(den), 1500)))

  const kakao = await pg(AP, { userAgent: devices['Galaxy S9+'].userAgent + ' KAKAOTALK 10.0.0' }, { inapp: true })
  await kakao.goto(`${D}/me`)
  ok('카카오톡 안: 크롬으로 열기 안내', (await isOpen(nudge(kakao), 8000)) && (await see(kakao, '크롬으로 열어 주세요')))
  await nudge(kakao).getByRole('button', { name: '여는 방법 보기' }).click()
  ok('여는 방법 → 브라우저로 열기 안내', await see(kakao, '브라우저로 열기'))

  // ── 5. 전문가 화면 ──
  const ex = await pg(EX, {}, {})
  await ex.goto(`${D}/pro`)
  ok('전문가: 알림 권유 (의뢰·견적 소식)', (await isOpen(nudge(ex), 8000)) && (await nudge(ex).getByText('📄 견적 요청').isVisible()) && (await nudge(ex).getByText('✅ 의뢰 확정').isVisible()))
  const ex2 = await pg(EX2, {}, {})
  await ex2.goto(`${D}/pro`)
  ok('사진 없는 전문가: 사진 등록 창', await isOpen(photoBox(ex2), 8000))

  // ── 6. 자동 점검 브라우저(다른 테스트)엔 안 뜸 ──
  const bot = await pg(AP)
  await bot.goto(`${D}/me`)
  ok('자동 점검 브라우저: 권유 창 안 뜸', !(await isOpen(nudge(bot), 3000)))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
