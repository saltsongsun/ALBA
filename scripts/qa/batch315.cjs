// 묶음 315 (정기 개선 2026-11-19 16:35 KST)
// · 휴대폰 달력에 넣기(.ics): 설명 맨 앞에 '회사: 회사 이름' (여러 회사에서 일해도 달력에서 어느 회사 근무인지)
//   현장 담당 번호가 없는 공고는 회사 문의 번호 '문의: 이름 번호' (공고 화면과 같은 순서) · 있으면 그대로 '담당: …'
// · 대화 내려받기 파일 이름 앞에 회사 이름 (관리자 단체방·1:1 문의, 근무자 단체방)
// · '달력에 넣기'를 누르면 잠깐 '✓ 달력 여는 중' (2.5초 뒤 원래대로 · 움직임 줄이기면 튀지 않음)
// node scripts/qa/batch315.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', K = '33333333-0000-4000-8000-000000000011', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099'
const J15 = 'cccccccc-0000-4000-8000-000000031501', AP15 = '11111111-0000-4000-8000-000000031501'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const get = async (path, uid) => {
  const r = await fetch(`${D}${path}`, { headers: { cookie: `alba_session=${cookie(uid)}` }, redirect: 'manual' })
  return { status: r.status, name: decodeURIComponent((r.headers.get('content-disposition') || '').replace(/^.*filename\*=UTF-8''/, '')), text: await r.text() }
}
// 달력 파일: 접힌 줄 펴기 · 설명 글자 풀기
const icsDesc = (t) => (t.replace(/\r\n /g, '').match(/^DESCRIPTION:(.*)$/m)?.[1] ?? '').replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\;/g, ';')

;(async () => {
  const [co] = await rest(`companies?id=eq.${C1}`)
  const coName = co.company_name
  const [job] = await rest(`jobs?id=eq.${J}`)
  const [wApp] = await rest(`applications?user_id=eq.${W}&job_id=eq.${J}`)

  // ── 1. 현장 담당 번호가 있는 공고: 회사 이름 + '담당: …' 그대로
  const c1 = await get(`/me/calendar/${wApp.id}`, W)
  const d1 = icsDesc(c1.text)
  ok(`달력 설명 맨 앞에 '회사: ${coName}'`, c1.status === 200 && d1.split('\n')[0] === `회사: ${coName}`, d1.split('\n')[0])
  ok("현장 담당 번호가 있으면 '담당: …' (회사 문의 줄 없음)", job.manager_phone ? d1.includes('담당: ') && !d1.includes('문의: ') : true, d1.replace(/\n/g, ' | '))
  ok("'출퇴근: …/me' 줄은 그대로 맨 끝", d1.split('\n').at(-1).startsWith('출퇴근: ') && d1.split('\n').at(-1).endsWith('/me'))

  // ── 2. 현장 담당 번호가 없는 내일 공고: 회사 문의 번호
  const { applications: _a, attendance: _t, ...jb } = job
  await rest('jobs', 'POST', { ...jb, id: J15, title: '내일 주차 안내', start_date: kday(1), end_date: kday(1), manager_name: null, manager_phone: null, status: 'open', applications: [], attendance: [], created_at: new Date().toISOString() })
  const [j15] = await rest(`jobs?id=eq.${J15}`)
  await rest('applications', 'POST', { ...wApp, id: AP15, job_id: J15, job: j15, status: 'approved', available_dates: null, position: null, created_at: new Date().toISOString() })
  const c2 = await get(`/me/calendar/${AP15}`, W)
  const d2 = icsDesc(c2.text)
  const want = `문의: ${co.contact_phone && co.contact_name ? co.contact_name : coName} ${co.contact_phone || co.company_phone}`.replace(/(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  ok(`현장 담당 번호가 없으면 회사 문의 '${want}'`, c2.status === 200 && d2.split('\n').some((l) => l.replace(/\s+/g, ' ') === want) && !d2.includes('담당: '), d2.replace(/\n/g, ' | '))
  ok('남의 지원은 그대로 못 받음 (404)', (await get(`/me/calendar/${AP15}`, K)).status === 404)

  // ── 3. 대화 내려받기 파일 이름 앞에 회사 이름
  const today = kday()
  const r1 = await get(`/admin/chat/room/${J}/export`, A)
  ok(`관리자 단체방 '${coName}_단체방_…_${today}.txt'`, r1.status === 200 && r1.name.startsWith(`${coName}_단체방_`) && r1.name.endsWith(`_${today}.txt`), `${r1.status} ${r1.name}`)
  const r2 = await get(`/admin/chat/${W}/export`, A)
  ok(`관리자 1:1 문의 '${coName}_문의_근무자_…'`, r2.status === 200 && r2.name.startsWith(`${coName}_문의_`), `${r2.status} ${r2.name}`)
  const r3 = await get(`/me/chat/room/${J}/export`, W)
  ok(`근무자 단체방 '${coName}_단체방_…'`, r3.status === 200 && r3.name.startsWith(`${coName}_단체방_`), `${r3.status} ${r3.name}`)
  ok('단체방 확정 안 된 사람은 그대로 못 받음', (await get(`/me/chat/room/${J15}/export`, K)).status === 403)

  // ── 4. '달력에 넣기' 누르면 '✓ 달력 여는 중'
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', acceptDownloads: true })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/jobs/${J15}`, { waitUntil: 'networkidle' })
  const link = p.locator(`a[href="/me/calendar/${AP15}"]`).first()
  ok("공고 화면 '달력에 넣기' 그대로", one(await link.innerText().catch(() => '')) === '달력에 넣기')
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await link.click()
  const st = link.locator('[role=status]')
  const shown = await st.waitFor({ timeout: 1500 }).then(() => true, () => false)
  ok("누르면 '✓ 달력 여는 중' (초록 · 같은 칸)", shown && one(await link.innerText()) === '달력 여는 중' && (await link.getAttribute('data-calendar-link')) === 'on' && (await link.evaluate((el) => el.getBoundingClientRect().height <= 36)))
  if (SHOTS) await link.evaluate((el) => el.scrollIntoView({ block: 'center' })).then(() => p.screenshot({ path: `${SHOTS}/calendar-opening.png` })).catch(() => {})
  ok('달력 파일이 실제로 열림 (받기)', !!(await dl))
  await p.waitForTimeout(2800)
  ok("2.5초 뒤 원래 '달력에 넣기'로", one(await link.innerText()) === '달력에 넣기' && (await link.getAttribute('data-calendar-link')) === 'off')
  ok('360px 옆으로 안 밀림 (공고 화면)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  // 내 근무 목록 카드의 '달력에 넣기'도 같은 동작
  await p.goto(`${D}/me`, { waitUntil: 'networkidle' })
  const ml = p.locator(`a[href="/me/calendar/${AP15}"]`).first()
  await p.emulateMedia({ reducedMotion: 'reduce' })
  const dl2 = p.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await ml.click()
  await ml.locator('[role=status]').waitFor({ timeout: 1500 }).catch(() => {})
  const anim = await ml.locator('[role=status]').evaluate((el) => getComputedStyle(el).animationName).catch(() => 'x')
  ok("내 근무 카드에서도 '달력 여는 중' · 움직임 줄이기면 튀지 않음", one(await ml.innerText().catch(() => '')) === '달력 여는 중' && anim === 'none', anim)
  await dl2
  ok('360px 옆으로 안 밀림 (내 근무)', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
