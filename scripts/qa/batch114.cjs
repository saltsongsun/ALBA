// 묶음 114 (정기 개선 2026-11-07 07:35 · 디자인 원칙 "많은 정보도 심플하게")
// · 근무자 명단: '계좌 없음'·'사진 없음'·'알림 꺼짐'으로 거르면 한 줄 '우리 회사 지원자 n명 [문자로 … 요청]'
//   (받는 사람·문구를 채운 채 문자 앱이 열림) · 해피워크 전체 회원에게 마구 보내지 않게 우리 회사 지원자만
// · 내 근무·지난 근무: 첫날 근무 중이면 '오늘 근무 중 / 끝나면 계산돼요'를 오른쪽에 한 번만 (왼쪽 같은 말 반복 없앰)
// · 간편 가입: '행사 경력 선택' 제목 한 줄 + 안내 한 줄 (360px에서 제목 옆 안내가 두 줄로 꺾이던 것)
// node scripts/qa/batch114.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', O = 'bbbbbbbb-0000-4000-8000-0000000001c4'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 우리 회사에 지원한 적 없는 다른 회원 (계좌·사진 없음) — 문자 받는 사람에 들어가면 안 됨
  const [w1] = await rest(`users?id=eq.${W}`)
  await rest('users', 'POST', { ...w1, id: O, name: '다른회원', phone: '01099990001', bank_account_enc: null, photo_at: null, attendance: [], ratings: [], created_at: '2026-10-02T00:00:00Z' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)); sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 근무자 명단: 거른 목록에 한 번에 요청 ──
  const a = await pg(A)
  const bar = a.locator('[data-bulk-ask]')
  for (const [f, label, word] of [['noaccount', '문자로 계좌 등록 요청', '계좌'], ['nophoto', '문자로 사진 요청', '사진'], ['nopush', '문자로 알림 켜기 요청', '알림']]) {
    await a.goto(`${D}/admin/workers?f=${f}`)
    await a.locator('[data-filter-row]').waitFor({ timeout: 15000 }).catch(() => {})
    const listed = await a.locator('.card', { has: a.getByRole('link', { name: '다른회원', exact: true }) }).count()
    const link = bar.getByRole('link', { name: label })
    const href = decodeURIComponent((await link.getAttribute('href').catch(() => '')) ?? '')
    ok(`'${f}': 한 줄 '우리 회사 지원자 n명 · ${label}'`, (await bar.innerText().catch(() => '')).includes('우리 회사 지원자') && href.startsWith('sms:') && (await bar.evaluate((el) => el.getBoundingClientRect().height < 56).catch(() => false)), href.slice(0, 80))
    ok(`'${f}': 문자 받는 사람은 우리 회사 지원자만 (근무자 O · 다른 회원 X — 다른 회원도 목록엔 ${listed ? '보임' : '안 보임'})`, href.includes('01033334444') && !href.includes('01099990001'))
    ok(`'${f}': 문구에 회사 이름 · '${word}' · 내 정보 주소`, href.includes('[주식회사 테스트]') && href.includes(word) && href.includes('/me/profile'))
  }
  if (SHOTS) await bar.screenshot({ path: `${SHOTS}/bulk-ask.png` }).catch(() => {})
  ok('360px: 옆으로 안 밀림 (명단)', await wide(a))
  for (const f of ['', 'mine', 'new']) {
    await a.goto(`${D}/admin/workers${f ? `?f=${f}` : ''}`)
    await a.locator('[data-filter-row]').waitFor({ timeout: 15000 }).catch(() => {})
    ok(`'${f || '전체'}' 목록엔 요청 줄 없음`, (await bar.count()) === 0)
  }

  // ── 2. 내 근무·지난 근무: 첫날 근무 중은 한 번만 ──
  const w = await pg(W)
  for (const path of ['/me', '/me/history']) {
    await w.goto(`${D}${path}`)
    const card = w.locator('[data-history-job]').first()
    await card.waitFor({ timeout: 15000 }).catch(() => {})
    const t = await card.innerText().catch(() => '')
    const times = (t.match(/근무 중/g) ?? []).length
    ok(`${path}: '오늘 근무 중' 한 번만 + '끝나면 계산돼요'`, times === 1 && t.includes('오늘 근무 중') && t.includes('끝나면 계산돼요') && (await card.locator('[data-live-shift]').count()) === 1, t.replace(/\n/g, ' | '))
    ok(`${path}: 360px 옆으로 안 밀림`, await wide(w))
    if (SHOTS) await card.screenshot({ path: `${SHOTS}/live-${path.replace(/\//g, '_')}.png` }).catch(() => {})
  }

  // ── 3. 간편 가입: 경력 제목 한 줄 ──
  const g = await pg()
  for (const [type, title] of [['worker', '행사 경력'], ['expert', '참여한 행사·공연']]) {
    await g.goto(`${D}/signup?type=${type}`)
    const box = g.locator('[data-signup-careers]')
    await box.waitFor({ timeout: 15000 }).catch(() => {})
    const lines = await box.evaluate((el) => [...el.children].map((c) => c.getClientRects().length)).catch(() => [])
    ok(`${type}: '${title} 선택' 한 줄 + '가입한 뒤 내 정보에서도 적을 수 있어요' 한 줄`, (await box.innerText()).includes(`${title} 선택`) && (await box.innerText()).includes('가입한 뒤 내 정보에서도 적을 수 있어요') && lines.length === 2 && lines.every((n) => n === 1), JSON.stringify(lines))
  }

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
