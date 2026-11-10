// 묶음 187 (정기 개선 2026-11-11 03:35 KST)
// · 회색 보조 버튼(btn-gray)은 화면 바탕과 같은 색이라, 카드 밖(회색 바탕 위)에 놓이면 글자처럼만 보였음
//   → 그런 자리는 흰 버튼(btn-white: 흰 바탕 + 옅은 테두리)으로: 공고 화면 '이 공고 문의하기' · 내 근무 '내 정보' (없는 화면은 묶음 188에서 흰 카드로)
//     · 지원자 탭 '번호 복사'·'＋ 번호로 추가' · 서류 탭 'PDF'·'필요 서류 바꾸기' · 커뮤니티 관리 '커뮤니티 보기'
//   주요 화면을 돌며 '바탕과 같은 색 버튼'이 하나도 없는지 확인 (새로 생기면 여기서 걸림) · 어두운 화면에서도 흰색으로 뜨지 않음
// (관리자 알림 제목의 회사 이름은 push-admin-company.cjs에서 확인)
// node scripts/qa/batch187.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)
const WHITE = 'rgb(255, 255, 255)'
// 바탕과 같은 색이라 모양이 안 보이는 회색 버튼 (접힌 칸 안의 것도 포함)
const blended = (p) => p.evaluate(() => {
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return 'rgb(255, 255, 255)' }
  return [...document.querySelectorAll('[class*="btn-gray"]')].filter((el) => el.parentElement && getComputedStyle(el).backgroundColor === bgOf(el.parentElement)).map((el) => (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 20))
})
// 흰 버튼: 흰 바탕 + 테두리(ring)가 있고, 바로 뒤 바탕과 색이 다름
const look = (loc) => loc.first().evaluate((el) => {
  const bgOf = (e0) => { for (let e = e0; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c } return 'rgb(255, 255, 255)' }
  const cs = getComputedStyle(el)
  return { bg: cs.backgroundColor, behind: bgOf(el.parentElement), ring: cs.boxShadow !== 'none', h: Math.round(el.getBoundingClientRect().height), cls: el.className }
}).catch(() => null)
const isWhiteBtn = (s) => !!s && s.bg === WHITE && s.behind !== WHITE && s.ring && s.cls.includes('btn-white')

;(async () => {
  const now = Date.now()
  // 준비: 어제~내일 근무 (자정·저녁에 돌려도 같은 화면) · 근무자는 확정(근무 기록 있음 → '담당자에게 알리기' 칸)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kstDay(now - 864e5), end_date: kstDay(now + 864e5), start_time: '00:00:00', end_time: '23:59:00' })
  const b = await chromium.launch()
  const errs = []
  const mk = async (u, init) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (init) await ctx.addInitScript(init)
    if (u) await ctx.addCookies([{ name: 'alba_session', value: cookie(u), url: D }, { name: 'alba_roster', value: roster(u), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const w = await mk(W), a = await mk(A), g = await mk('')

  // ── 1. 근무자 화면
  await w.goto(`${D}/jobs/${J}`)
  const ask = w.getByRole('link', { name: '이 공고 문의하기' })
  await ask.waitFor({ timeout: 15000 }).catch(() => {})
  const sAsk = await look(ask)
  const hShare = await w.getByRole('button', { name: /공유/ }).first().evaluate((el) => Math.round(el.getBoundingClientRect().height)).catch(() => 0)
  ok("공고 화면 '이 공고 문의하기': 흰 버튼 (옆 '공유하기'와 같은 높이)", isWhiteBtn(sAsk) && Math.abs(sAsk.h - hShare) <= 1, JSON.stringify({ ...sAsk, hShare }))
  ok("취소 칸(회색 칸) 안 '담당자에게 알리기'도 흰 버튼", isWhiteBtn(await look(w.locator('[data-cancel-worked] a'))), JSON.stringify(await look(w.locator('[data-cancel-worked] a'))))
  ok('카드 안 회색 버튼은 그대로 (단체방)', (await look(w.getByRole('link', { name: '단체방' })))?.cls.includes('btn-gray'))
  ok('공고 화면: 바탕과 같은 색 버튼 없음 · 옆으로 안 밀림', (await blended(w)).length === 0 && (await noSide(w)), JSON.stringify(await blended(w)))
  if (SHOTS) { await ask.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await w.waitForTimeout(500); await w.screenshot({ path: `${SHOTS}/job-ask.png` }).catch(() => {}) }
  await w.goto(`${D}/me`)
  const mine = w.getByRole('link', { name: '내 정보', exact: true }).first()
  await mine.waitFor({ timeout: 15000 }).catch(() => {})
  ok("내 근무 '내 정보': 흰 버튼", isWhiteBtn(await look(mine)), JSON.stringify(await look(mine)))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/me-top.png`, clip: { x: 0, y: 0, width: 360, height: 220 } }).catch(() => {})
  await w.goto(`${D}/jobs/cccccccc-0000-4000-8000-000000018799`)
  const myWork = w.getByRole('link', { name: '내 근무', exact: true })
  await myWork.waitFor({ timeout: 15000 }).catch(() => {})
  // 없는 화면은 흰 카드 안으로 옮김 (묶음 188) → 카드 안 회색 버튼이 바탕(흰색)과 달라 버튼으로 보임
  const sWork = await look(myWork)
  ok("없는 화면 '내 근무': 흰 카드 안 버튼 (바탕과 다른 색)", !!sWork && sWork.behind === WHITE && sWork.bg !== sWork.behind, JSON.stringify(sWork))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/404.png` }).catch(() => {})

  // ── 2. 관리자 화면
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  const add = a.locator('summary', { hasText: '번호로 추가' })
  await add.waitFor({ timeout: 15000 }).catch(() => {})
  ok("지원자 탭 '＋ 번호로 추가' · '번호 n개 복사': 흰 버튼", isWhiteBtn(await look(add)) && isWhiteBtn(await look(a.getByRole('button', { name: /번호 \d+개 복사/ }))), JSON.stringify([await look(add), await look(a.getByRole('button', { name: /번호 \d+개 복사/ }))]))
  if (SHOTS) { await add.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await a.waitForTimeout(500); await a.screenshot({ path: `${SHOTS}/apps-tools.png` }).catch(() => {}) }
  await a.goto(`${D}/admin/jobs/${J}?tab=docs`)
  const change = a.getByRole('link', { name: '필요 서류 바꾸기' })
  await change.waitFor({ timeout: 15000 }).catch(() => {})
  ok("서류 탭 '필요 서류 바꾸기' · '서명 완료 n건 PDF': 흰 버튼", isWhiteBtn(await look(change)) && isWhiteBtn(await look(a.locator('[data-job-docs-pdf]'))), JSON.stringify([await look(change), await look(a.locator('[data-job-docs-pdf]'))]))
  await a.goto(`${D}/admin/community`)
  const comm = a.getByRole('link', { name: '커뮤니티 보기' })
  await comm.waitFor({ timeout: 15000 }).catch(() => {})
  ok("커뮤니티 관리 '커뮤니티 보기': 흰 버튼", isWhiteBtn(await look(comm)), JSON.stringify(await look(comm)))

  // ── 3. 주요 화면을 돌며: 바탕과 같은 색 버튼이 하나도 없음 (새로 생기면 여기서 걸림)
  const sweep = async (p, who, paths) => {
    const bad = []
    for (const path of paths) {
      await p.goto(D + path).catch(() => {})
      await p.waitForLoadState('domcontentloaded').catch(() => {})
      await p.waitForTimeout(500)
      const l = await blended(p).catch(() => [])
      if (l.length) bad.push(`${path.replace(J, ':J').replace(W, ':W')} → ${l.join(', ')}`)
    }
    ok(`${who} 화면 ${paths.length}곳: 바탕과 같은 색 버튼 없음`, bad.length === 0, bad.join(' | '))
  }
  await sweep(w, '근무자', ['/', `/jobs/${J}`, '/me', '/me/history', '/me/profile', '/me/chat', `/me/chat?job=${J}`, `/me/chat/room/${J}`, '/community', '/pro'])
  await sweep(a, '관리자', ['/admin', '/admin/jobs', `/admin/jobs/${J}?tab=apps`, `/admin/jobs/${J}?tab=att`, `/admin/jobs/${J}?tab=pay`, `/admin/jobs/${J}?tab=docs`, `/admin/jobs/${J}/edit`, '/admin/jobs/new', '/admin/workers', `/admin/workers/${W}`, '/admin/chat', `/admin/chat/${W}`, `/admin/chat/room/${J}`, '/admin/docs', '/admin/vendors', '/admin/reports', '/admin/settings', '/admin/weekly', '/admin/companies', '/admin/community'])
  await sweep(g, '비회원', ['/', `/jobs/${J}`, '/login', '/signup', '/signup?type=worker', '/start', '/start?tab=join'])

  // ── 4. 어두운 화면: 흰 버튼이 하얗게 뜨지 않음 (카드와 같은 어두운 바탕)
  const dk = await mk(W, () => { try { localStorage.setItem('theme', 'dark') } catch {} })
  await dk.goto(`${D}/jobs/${J}`)
  const dAsk = dk.getByRole('link', { name: '이 공고 문의하기' })
  await dAsk.waitFor({ timeout: 15000 }).catch(() => {})
  const sDk = await look(dAsk)
  const cardBg = await dk.locator('.card').first().evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => '')
  ok('어두운 화면: 켜짐 · 흰 버튼은 카드와 같은 어두운 바탕 (바탕과는 다른 색)', (await dk.evaluate(() => document.documentElement.dataset.theme)) === 'dark' && !!sDk && sDk.bg !== WHITE && sDk.bg === cardBg && sDk.bg !== sDk.behind, JSON.stringify({ ...sDk, cardBg }))
  if (SHOTS) { await dAsk.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await dk.waitForTimeout(500); await dk.screenshot({ path: `${SHOTS}/job-ask-dark.png` }).catch(() => {}) }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
