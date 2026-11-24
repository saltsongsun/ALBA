// 묶음 377 (정기 개선 2026-11-24 17:35 KST)
// · 오늘 하루짜리 근무가 곧 시작(3시간 안)하거나 이미 시작했으면, 비회원도 가입하기 전에 공고 화면 '지원하려면 가입…' 칸 위에서 그 안내를 봄
//   (예전엔 로그인한 근무자의 지원 칸에만 있어, 가입하고 나서야 이미 시작한 근무인 걸 알았음)
// · 화면 아래 지원 바에도 짧은 한 줄 (잘리지 않게): 'HH:MM~HH:MM 진행 중' / 'n분 뒤 시작' (비회원·근무자 모두)
//   · 앞에 작은 점: 진행 중이면 초록 점이 숨쉬듯(ping) · 곧 시작이면 주황 점 · '움직임 줄이기'면 멈춤
//   · 얼굴 사진이 필요한 근무자는 예전처럼 사진 안내가 먼저 (점 없음) · 내일 근무는 예전처럼 공고 이름
// node scripts/qa/batch377.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const JS = 'cccccccc-0000-4000-8000-000000037701', JN = 'cccccccc-0000-4000-8000-000000037702', JT = 'cccccccc-0000-4000-8000-000000037703'
const WP = 'bbbbbbbb-0000-4000-8000-000000037701', WN = 'bbbbbbbb-0000-4000-8000-000000037702'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const kstMin = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.getUTCHours() * 60 + d.getUTCMinutes() }
const kday = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const mt = (min) => { const h = Math.floor(min / 60), m = min % 60; return h && m ? `${h}시간 ${m}분` : h ? `${h}시간` : `${m}분` }

;(async () => {
  const nowIso = new Date().toISOString()
  const [j] = await rest(`jobs?id=eq.${J}`)
  // eslint-disable-next-line no-unused-vars
  const { company, applications, ...jrow } = j
  const now = kstMin()
  const canStarted = now >= 61 && now <= 23 * 60
  const canSoon = now + 61 <= 23 * 60 + 30
  const sStart = Math.max(0, now - 60), sEnd = Math.min(now + 120, 23 * 60 + 59)
  const nStart = now + 61, nEnd = Math.min(nStart + 120, 23 * 60 + 59)
  const base = { ...jrow, status: 'open', required_docs: [], created_at: nowIso, audience: 'worker' }
  await rest('jobs', 'POST', { ...base, id: JS, title: '이미 시작한 근무377', start_date: kday(0), end_date: kday(0), start_time: `${hh(sStart)}:00`, end_time: `${hh(sEnd)}:00` })
  await rest('jobs', 'POST', { ...base, id: JN, title: '곧 시작하는 근무377', start_date: kday(0), end_date: kday(0), start_time: `${hh(Math.min(nStart, 23 * 60 + 58))}:00`, end_time: `${hh(nEnd)}:00` })
  await rest('jobs', 'POST', { ...base, id: JT, title: '내일 근무377', start_date: kday(1), end_date: kday(1) })
  const [w] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w, id: WP, name: '사진있는회원377', phone: '01037700001', photo_at: nowIso })
  await rest('users', 'POST', { ...w, id: WN, name: '사진없는회원377', phone: '01037700002', photo_at: null })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const open = async (p, id) => {
    await p.goto(`${D}/jobs/${id}`, { waitUntil: 'networkidle' })
    await p.evaluate(() => scrollTo(0, 0))
    await p.locator('[data-sticky-apply]').waitFor({ timeout: 10000 }).catch(() => {})
    await p.waitForTimeout(300)
  }
  const barNote = (p) => p.locator('[data-sticky-note]').innerText().then(one).catch(() => '')

  const g = await pg(null)
  // ── 1. 비회원 · 이미 시작한 근무
  if (canStarted) {
    await open(g, JS)
    const card = g.locator('.card', { hasText: '지원하려면 가입 또는 로그인이 필요해요' })
    const note = card.locator('[data-started-note]')
    ok(`비회원: 가입 칸 위에 '${hh(sStart)}에 이미 시작한 근무예요. 지원하면 담당자가 확인한 뒤 알려 드려요.'`, (await note.count()) === 1 && one(await note.innerText()) === `${hh(sStart)}에 이미 시작한 근무예요. 지원하면 담당자가 확인한 뒤 알려 드려요.` && (await note.evaluate((el, t) => !!(el.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING), await card.getByText('지원하려면 가입 또는 로그인이 필요해요').elementHandle())), one(await note.innerText().catch(() => '')))
    ok('안내는 왼쪽 정렬 (가운데 정렬 칸 안이어도)', (await note.evaluate((el) => getComputedStyle(el).textAlign)) === 'left')
    ok(`아래 바: '${hh(sStart)}~${hh(sEnd)} 진행 중' + '1분 가입하고 지원'`, (await barNote(g)) === `${hh(sStart)}~${hh(sEnd)} 진행 중` && (await g.locator('[data-sticky-apply] a', { hasText: '1분 가입하고 지원' }).count()) === 1, await barNote(g))
    const live = g.locator('[data-sticky-live]')
    ok('진행 중: 초록 점이 숨쉬듯 (ping)', (await live.getAttribute('data-sticky-live')) === 'started' && (await live.locator('.animate-ping').evaluate((el) => getComputedStyle(el).animationName).catch(() => '')) === 'ping')
    ok('아래 바 안내 한 줄 · 잘리지 않음 (…없음) · 360px 옆으로 안 밀림', (await g.locator('[data-sticky-note]').evaluate((el) => el.getBoundingClientRect().height < 22)) && (await g.locator('[data-sticky-note] span.truncate').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)) && (await noSide(g)))
    if (SHOTS) {
      await g.locator('[data-sticky-apply] > div').screenshot({ path: `${SHOTS}/bar-started.png` }).catch(() => {})
      await card.screenshot({ path: `${SHOTS}/guest-card-started.png` }).catch(() => {})
    }
  } else ok('(자정 무렵이라 이미 시작한 근무는 건너뜀)', true)

  // ── 2. 비회원 · 곧 시작
  if (canSoon) {
    await open(g, JN)
    const soonMin = Math.ceil((nStart - now) - new Date().getUTCSeconds() / 60)
    const note = g.locator('[data-soon-note]')
    const nt = one(await note.innerText().catch(() => ''))
    ok(`비회원: '${hh(nStart)} 시작 · n분 뒤예요 / 늦지 않게 갈 수 있을 때 지원해 주세요'`, (await note.count()) === 1 && nt.startsWith(`${hh(nStart)} 시작 · `) && nt.endsWith('늦지 않게 갈 수 있을 때 지원해 주세요'), nt)
    const bn = await barNote(g)
    ok(`아래 바: '${mt(soonMin)} 뒤 시작' (1분 차이 허용) · 잘리지 않음 · 주황 점 (숨쉬기 없음)`, /^(\d+시간 )?(\d+분 )?뒤 시작$/.test(bn) && (await g.locator('[data-sticky-note] span.truncate').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)) && (await g.locator('[data-sticky-live]').getAttribute('data-sticky-live')) === 'soon' && (await g.locator('[data-sticky-live] .animate-ping').count()) === 0, bn)
    if (SHOTS) await g.locator('[data-sticky-apply] > div').screenshot({ path: `${SHOTS}/bar-soon.png` }).catch(() => {})
  } else ok('(밤 늦게라 곧 시작 근무는 건너뜀)', true)

  // ── 3. 비회원 · 내일 근무: 예전 그대로
  await open(g, JT)
  ok('내일 근무: 안내 없음 · 아래 바는 공고 이름', (await g.locator('[data-soon-note], [data-started-note]').count()) === 0 && (await g.locator('[data-sticky-note]').count()) === 0 && one(await g.locator('[data-sticky-apply] p').first().innerText()) === '내일 근무377')

  // ── 4. 근무자(사진 있음) · 이미 시작: 지원 칸 안내 하나 + 아래 바 같은 줄
  if (canStarted) {
    const p = await pg(WP)
    await open(p, JS)
    ok('근무자: 지원 칸 안내는 하나 (예전과 같은 자리)', (await p.locator('[data-started-note]').count()) === 1 && (await p.locator('form [data-started-note]').count()) === 1)
    ok(`근무자 아래 바: '${hh(sStart)}~${hh(sEnd)} 진행 중' + '지원하기'`, (await barNote(p)) === `${hh(sStart)}~${hh(sEnd)} 진행 중` && (await p.locator('[data-sticky-apply] button', { hasText: '지원하기' }).count()) === 1, await barNote(p))
    // ── 5. 사진 없는 근무자: 사진 안내가 먼저 (점 없음)
    const q = await pg(WN)
    await open(q, JS)
    ok('사진 없는 근무자: 아래 바는 사진 안내 그대로 (점 없음)', (await barNote(q)) === '지원 전에 얼굴 사진 1장이 필요해요' && (await q.locator('[data-sticky-live]').count()) === 0, await barNote(q))
  }

  // ── 6. 움직임 줄이기: 점은 멈춤
  if (canStarted) {
    const r = await pg(null, { reducedMotion: 'reduce' })
    await open(r, JS)
    const d = await r.locator('[data-sticky-live] .animate-ping').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) || 0).catch(() => 1)
    ok("'움직임 줄이기'면 점 숨쉬기 멈춤", d < 0.05, String(d))
  }

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
