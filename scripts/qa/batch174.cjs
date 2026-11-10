// 묶음 174 (정기 개선 2026-11-10 11:35 KST)
// · 관리자 문의 대화: 근무자 이름 아래 한 줄 — 이 회사 오늘 근무 상태(근무 중·퇴근·출근 전·출근 기록 없음) 또는 다음 근무
//   ('● 오늘 근무 중 · 08:39 시작 · 공고 제목' · 누르면 그 공고) — 답장할 때 상황을 바로 알게
// · 공고 화면 아래 '지원하기' 바: 지원 칸이 보이면 툭 사라지지 않고 아래로 스르륵 숨음 · 다시 위로 가면 올라옴
// node scripts/qa/batch174.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const TITLE = '경상남도 생활체육대축전 행사장 안내 스태프'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kstHm = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(11, 16)
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    if (uid) await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const a = await pg(A)
  const line = a.locator('[data-chat-work]')
  const lineText = async () => ((await line.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim()
  const open = async () => { await a.goto(`${D}/admin/chat/${W}`); await a.locator('[data-vv="end"]').waitFor({ timeout: 15000 }).catch(() => {}) }

  // ── 1. 근무 중 (가짜 DB 기본: 오늘 출근 · 아직 퇴근 전)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_time: '09:00:00', end_time: '23:59:00' })
  const [att] = await rest(`attendance?user_id=eq.${W}`)
  await open()
  const t1 = await lineText()
  ok(`'오늘 근무 중 · ${kstHm(att.clock_in)} 시작 · 공고'`, t1 === `오늘 근무 중 · ${kstHm(att.clock_in)} 시작 · ${TITLE}`, t1)
  ok('누르면 그 공고의 출퇴근 탭', (await line.getAttribute('href')) === `/admin/jobs/${J}?tab=att`)
  ok('초록 점 · 한 줄 · 360px 옆으로 안 밀림', (await line.evaluate((el) => el.querySelector('span[aria-hidden]').className.includes('bg-emerald-500') && el.getBoundingClientRect().height < 22)) && (await a.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  if (SHOTS) await line.locator('xpath=ancestor::div[contains(@class,"card")][1]').screenshot({ path: `${SHOTS}/chat-work.png` }).catch(() => {})

  // ── 2. 퇴근
  const out = new Date().toISOString()
  await rest(`attendance?id=eq.${att.id}`, 'PATCH', { clock_out: out })
  await open()
  ok(`'오늘 퇴근 ${kstHm(out)}'`, (await lineText()) === `오늘 퇴근 ${kstHm(out)} · ${TITLE}`, await lineText())

  // ── 3. 출근 전 (기록 지움 · 끝나기 전)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await open()
  const t3 = await lineText()
  const before = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16) < '23:59'
  ok(before ? "'오늘 09:00~23:59 · 출근 전'" : "'오늘 근무 · 출근 기록 없음'", t3 === (before ? `오늘 09:00~23:59 · 출근 전 · ${TITLE}` : `오늘 근무 · 출근 기록 없음 · ${TITLE}`), t3)

  // ── 4. 다음 근무 (내일)
  const tmr = kstDay(Date.now() + 864e5)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: tmr, end_date: tmr })
  await open()
  const t4 = await lineText()
  ok("내일 근무: '다음 근무 MM/DD(요일) 09:00'", /^다음 근무 \d{1,2}\/\d{1,2}\(.\) 09:00 · /.test(t4) && t4.endsWith(TITLE), t4)
  await rest(`jobs?id=eq.${J}`, 'PATCH', { start_date: kstDay(Date.now()), end_date: kstDay(Date.now()) })

  // ── 5. 공고 화면 아래 '지원하기' 바: 지원 칸이 보이면 아래로 스르륵 숨음
  const g = await pg(null)
  await g.goto(`${D}/jobs/${J}`)
  const bar = g.locator('[data-sticky-apply]')
  await bar.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {})
  await g.waitForTimeout(600)
  ok('처음: 아래 바 보임', (await bar.getAttribute('data-sticky-apply')) === 'shown' && (await bar.evaluate((el) => getComputedStyle(el).opacity)) === '1')
  await g.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight))
  await g.waitForFunction(() => document.querySelector('[data-sticky-apply]')?.getAttribute('data-sticky-apply') === 'hidden', null, { timeout: 5000 }).catch(() => {})
  const midway = await bar.evaluate((el) => ({ dur: getComputedStyle(el).transitionDuration, prop: getComputedStyle(el).transitionProperty }))
  await g.waitForTimeout(400)
  const hid = await bar.evaluate((el) => ({ op: getComputedStyle(el).opacity, aria: el.getAttribute('aria-hidden'), inert: el.inert, tr: getComputedStyle(el).translate }))
  ok('지원 칸이 보이면: 사라지지 않고 아래로 숨음 (투명 · 아래로 · 눌리지 않음)', hid.op === '0' && hid.aria === 'true' && hid.inert === true && hid.tr !== 'none', JSON.stringify(hid))
  ok('움직임은 짧게 (0.2초 · 위치·투명도만)', midway.dur.startsWith('0.2s') && /translate/.test(midway.prop) && /opacity/.test(midway.prop), JSON.stringify(midway))
  await g.evaluate(() => window.scrollTo(0, 0))
  await g.waitForFunction(() => document.querySelector('[data-sticky-apply]')?.getAttribute('data-sticky-apply') === 'shown', null, { timeout: 5000 }).catch(() => {})
  await g.waitForTimeout(400)
  ok('다시 위로 가면 올라옴', (await bar.evaluate((el) => getComputedStyle(el).opacity)) === '1' && (await g.getByRole('link', { name: '1분 가입하고 지원' }).count()) >= 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
