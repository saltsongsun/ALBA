// 묶음 210 (정기 개선 2026-11-12 06:35 KST)
// · 회사 간 자료 분리 점검 (batch39 뒤에 생긴 화면까지): 두 번째 회사 관리자가
//   주간 관리 · 공고 QR · 공고 고치기 · 근무자 1:1 문의 · 문의 저장 · 서류 PDF · 공고 조회 수 · 근무자 상세를 열어도 첫 회사 자료가 안 보임
// · 근무자 문의 목록: 여러 회사 일을 하면 단체방 줄에 어느 회사 방인지 ('회사 이름 · 마지막 말') · 한 회사면 전처럼
// node scripts/qa/batch210.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000210'
const A2 = 'aaaaaaaa-0000-4000-8000-00000000a210', J2 = 'cccccccc-0000-4000-8000-00000000c210', APP2 = '11111111-0000-4000-8000-00000000a210'
const C2_NAME = '주식회사 아주아주 이름이 긴 행사 기획 운영 대행사', J2_TITLE = '두번째 회사 무대 스태프'
const SECRETS = ['경상남도 생활체육대축전 행사장 안내 스태프', '일번회사 1:1 비밀 문의', '주식회사 테스트']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (days = 0) => new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10)
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  const nowIso = new Date().toISOString()
  // 두 번째 회사 · 그 회사 대표 관리자 · 그 회사 공고 (내일모레)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: C2_NAME, seal_image: null, contact_phone: '01099990210', created_at: nowIso })
  const [admin1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...admin1, id: A2, name: '이회사관리', phone: '01022220210', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })
  const [j1] = await rest(`jobs?id=eq.${J}`)
  const j2 = { ...j1, id: J2, company_id: C2, company: { company_name: C2_NAME }, title: J2_TITLE, start_date: kst(2), end_date: kst(2), applications: [], required_docs: [] }
  await rest('jobs', 'POST', j2)
  // 첫 회사에만 있는 1:1 문의
  await rest('messages', 'POST', { company_id: C1, thread_user_id: W, sender_id: W, from_admin: false, body: '일번회사 1:1 비밀 문의', read_at: null, created_at: nowIso })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return { ctx, p }
  }

  // ════ 1. 회사 간 자료 분리 (두 번째 회사 관리자) ════
  const { ctx, p } = await mk(A2)
  const leaks = (text) => SECRETS.filter((s) => text.includes(s))
  const look = async (path) => {
    await p.goto(`${D}${path}`)
    await p.waitForLoadState('networkidle').catch(() => {})
    await p.waitForTimeout(300)
    return await p.locator('body').innerText().catch(() => '')
  }
  const dl = async (path) => {
    const r = await ctx.request.get(`${D}${path}`, { maxRedirects: 0 })
    return { status: r.status(), text: await r.text().catch(() => '') }
  }
  const own = await look('/admin/weekly')
  ok('주간 관리: 첫 회사 자료 없음', leaks(own).length === 0, leaks(own).join(', '))
  for (const [path, label] of [[`/admin/jobs/${J}/qr`, '공고 QR'], [`/admin/jobs/${J}/edit`, '공고 고치기']]) {
    const t = await look(path)
    ok(`첫 회사 ${label} 주소: 막힘 (자료 안 보임)`, leaks(t).length === 0 && t.includes('찾는 화면이 없어요'), leaks(t).join(', ') || t.slice(0, 60).replace(/\s+/g, ' '))
  }
  const th = await look(`/admin/chat/${W}`)
  ok('근무자 1:1 문의 화면: 첫 회사 문의 내용 안 보임', leaks(th).length === 0, leaks(th).join(', '))
  const wk = await look(`/admin/workers/${W}`)
  ok('근무자 상세: 첫 회사 공고·문의 안 보임', leaks(wk).length === 0, leaks(wk).join(', '))
  const ex = await dl(`/admin/chat/${W}/export`)
  ok('근무자 문의 저장: 첫 회사 문의는 못 받음', ex.status >= 400 && leaks(ex.text).length === 0, `${ex.status} ${leaks(ex.text).join(', ')}`)
  const pdf1 = await dl(`/admin/docs/pdf?id=${DOC}`)
  ok('첫 회사 서류 PDF (주소에 서류 번호를 넣어도): 첫 회사 자료 없음', leaks(pdf1.text).length === 0 && !pdf1.text.includes('근로계약서'), `${pdf1.status} ${leaks(pdf1.text).join(', ')}`)
  const pdf2 = await dl('/admin/docs/pdf')
  ok('자기 회사 서류 PDF 전체: 첫 회사 자료 없음', leaks(pdf2.text).length === 0, `${pdf2.status} ${leaks(pdf2.text).join(', ')}`)
  const vw = await dl(`/api/jobs/${J}/viewers`)
  ok('첫 회사 공고 조회 수: 막힘 (404)', vw.status === 404 && leaks(vw.text).length === 0, String(vw.status))
  await ctx.close()

  // ════ 2. 근무자 문의 목록: 단체방 줄에 회사 이름 (여러 회사일 때만) ════
  const { p: w } = await mk(W)
  const rows = () => w.locator('[data-chat-row=room]')
  await w.goto(`${D}/me/chat`, { waitUntil: 'networkidle' })
  await rows().first().waitFor({ timeout: 15000 }).catch(() => {})
  ok('한 회사만: 단체방 줄에 회사 이름 없음 (전처럼)', (await rows().count()) >= 1 && (await w.locator('[data-room-co]').count()) === 0)

  const [app1] = await rest(`applications?job_id=eq.${J}&user_id=eq.${W}`)
  await rest('applications', 'POST', { ...app1, id: APP2, job_id: J2, company_id: C2, status: 'approved', position: null, available_dates: null, job: j2, created_at: nowIso })
  await w.goto(`${D}/me/chat`, { waitUntil: 'networkidle' })
  await w.locator('[data-room-co]').first().waitFor({ timeout: 15000 }).catch(() => {})
  const info = await rows().evaluateAll((l) => l.map((a) => ({ title: a.querySelector('b')?.textContent, co: a.querySelector('[data-room-co]')?.textContent?.trim() ?? null, dot: a.querySelector('[data-room-co]')?.nextElementSibling?.textContent?.trim() ?? null })))
  const r1 = info.find((x) => x.title?.includes('경상남도')), r2 = info.find((x) => x.title === J2_TITLE)
  ok("두 회사: 단체방마다 회사 이름 ('주식회사 테스트 · …' · 두 번째 회사 · …)", r1?.co === '주식회사 테스트' && r2?.co === C2_NAME && r1?.dot === '·' && r2?.dot === '·', JSON.stringify(info))
  const fit = await rows().evaluateAll((l) => l.map((a) => {
    const co = a.querySelector('[data-room-co]'), body = co?.parentElement?.lastElementChild
    if (!co || !body) return null
    const r = co.getBoundingClientRect(), bb = body.getBoundingClientRect(), line = co.parentElement.getBoundingClientRect()
    return { coW: r.width, bodyW: bb.width, h: line.height, cut: co.scrollWidth > co.clientWidth, right: bb.right }
  }).filter(Boolean))
  ok('긴 회사 이름은 줄임 (줄의 45%까지 · 사이 점은 그대로) · 마지막 말도 보임 · 한 줄 · 화면 안', fit.length === 2 && fit.every((x) => x.h < 24 && x.bodyW > 60 && x.right <= 352) && fit.some((x) => x.cut), JSON.stringify(fit))
  ok('360px 옆으로 안 밀림', await noSide(w))
  if (SHOTS) await w.screenshot({ path: `${SHOTS}/inbox-room-company.png`, clip: { x: 0, y: 0, width: 360, height: 420 } }).catch(() => {})

  // 정리
  await rest(`applications?id=eq.${APP2}`, 'DELETE')
  await rest(`jobs?id=eq.${J2}`, 'DELETE')

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
