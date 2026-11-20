// 묶음 327 (정기 개선 2026-11-20 17:35 KST)
// · 새 회사(받은 서류가 하나도 없음): 서류 화면에 빈 찾기 칸·고르기·'전체 0' 칩 대신 다음에 할 일 하나
//   공고가 없으면 '+ 첫 공고 올리기' · 서식이 있으면 '서식 n개 준비돼 있어요 · 보기 →' · 없으면 '기본 서식 불러오기'
//   찾는 중(?q=)이면 예전처럼 찾기 칸 + '맞는 서류가 없어요' · 서류가 있는 회사는 그대로
// · 새 회사(근무 기록이 한 번도 없음): 정산·신고자료에 0원·0명 칸과 빈 신고 파일 대신 한 줄 안내 + '공고 보기 →'
//   개인정보 처리 기록은 기록이 생기면 · 기록이 있는 회사는 지난달로 가도 그대로 (달 고르기·신고 파일)
// node scripts/qa/batch327.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const sign = (p, pre = '') => `${p}.${createHmac('sha256', SECRET).update(pre + p).digest('base64url')}`
const cookie = (u) => sign(Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'))
const roster = (u) => sign(Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'roster:')
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', C1 = '99999999-0000-4000-8000-000000000099', J = 'cccccccc-0000-4000-8000-000000000003'
const C2 = '99999999-0000-4000-8000-0000003270c2', A2 = 'aaaaaaaa-0000-4000-8000-0000003270a2'
const J2 = 'cccccccc-0000-4000-8000-0000003270a2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const kday = (n = 0) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10)
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const noSide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

;(async () => {
  // 방금 만든 회사 (확인됨) · 대표 한 명 · 공고·서류·서식·근무 기록 없음
  const [c1] = await rest(`companies?id=eq.${C1}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새봄행사', seal_image: null, verified: true, created_at: new Date().toISOString() })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '이대표', phone: '01032703270', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner', created_at: new Date().toISOString() })

  const b = await chromium.launch()
  const errs = []
  const mk = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, { name: 'alba_roster', value: roster(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const go = async (p, q) => { await p.goto(D + q, { waitUntil: 'networkidle' }); await p.waitForTimeout(300) }

  // ── 1. 새 회사 서류: 빈 도구 없이 다음에 할 일 하나
  const n = await mk(A2)
  await go(n, '/admin/docs')
  const first = n.locator('[data-docs-first]')
  ok('서류 한 번도 없음: 안내 카드 하나', (await first.count()) === 1 && one(await first.textContent()).includes('아직 받은 서류가 없어요'))
  ok('빈 찾기 칸·고르기·0개 칩 없음', (await n.locator('[data-docs-search]').count()) === 0 && (await n.locator('[data-docs-status]').count()) === 0 && (await n.locator('select').count()) === 0)
  ok("공고가 없으면 '+ 첫 공고 올리기' → 새 공고", (await n.locator('[data-docs-first-job]').getAttribute('href')) === '/admin/jobs/new')
  ok("서식이 없으면 '기본 서식 불러오기'", (await n.locator('[data-docs-first-restore] button').count()) === 1 && (await n.locator('[data-docs-first-tpl]').count()) === 0)
  ok('360px 옆으로 밀림 없음 (서류)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/docs-first.png` })
  // 기본 서식 불러오기 → 이 회사 서식만 생김 · 안내가 '서식 n개 준비돼 있어요'로
  await n.locator('[data-docs-first-restore] button').click()
  await n.waitForLoadState('networkidle')
  await n.waitForTimeout(600)
  await go(n, '/admin/docs')
  const tpls = (await rest(`doc_templates?company_id=eq.${C2}`)) ?? []
  const tl = one(await n.locator('[data-docs-first-tpl]').textContent().catch(() => ''))
  ok('불러온 서식은 이 회사 것으로 저장', tpls.length > 0 && tpls.every((t) => t.company_id === C2), String(tpls.length))
  ok("안내가 '서식 n개 준비돼 있어요 · 보기 →'로", new RegExp(`^서식 ${tpls.filter((t) => t.active !== false).length}개 준비돼 있어요 · 보기 →$`).test(tl) && (await n.locator('[data-docs-first-tpl]').getAttribute('href')) === '/admin/docs?tab=tpl', tl)
  // 찾는 중이면 예전 화면 (찾기 칸 + 맞는 서류 없음)
  await go(n, '/admin/docs?q=없는이름')
  ok("찾는 중이면 찾기 칸 + '맞는 서류가 없어요'", (await n.locator('[data-docs-search]').count()) === 1 && (await n.locator('main').textContent()).includes('맞는 서류가 없어요') && (await n.locator('[data-docs-first]').count()) === 0)

  // ── 2. 새 회사 정산·신고자료: 0원 칸·빈 파일 대신 한 줄
  await go(n, '/admin/reports')
  const rf = n.locator('[data-report-first]')
  ok('근무 기록 한 번도 없음: 안내 한 줄', (await rf.count()) === 1 && one(await rf.textContent()).includes('아직 끝난 근무가 없어요'))
  ok('0원 칸·신고 파일·달 고르기 없음', (await n.locator('[data-report-summary]').count()) === 0 && (await n.locator('[data-report-downloads]').count()) === 0 && (await n.locator('[data-month-nav]').count()) === 0)
  ok("'공고 보기 →' → 공고 화면", (await n.locator('[data-report-first-jobs]').getAttribute('href')) === '/admin/jobs')
  ok('360px 옆으로 밀림 없음 (정산)', await noSide(n))
  if (SHOTS) await n.screenshot({ path: `${SHOTS}/reports-first.png` })

  // ── 3. 새 회사가 공고를 올리면: 서류 안내에서 '첫 공고' 버튼은 빠짐
  const [j0] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j0, id: J2, company_id: C2, company: { company_name: '새봄행사' }, title: '새봄 첫 행사', start_date: kday(5), end_date: kday(5), applications: [], created_at: new Date().toISOString() })
  await go(n, '/admin/docs')
  ok("공고가 있으면 '첫 공고 올리기' 없음 · 서식 안내는 그대로", (await n.locator('[data-docs-first]').count()) === 1 && (await n.locator('[data-docs-first-job]').count()) === 0 && (await n.locator('[data-docs-first-tpl]').count()) === 1)

  // ── 4. 기록이 있는 회사 (테스트 회사): 예전 화면 그대로
  const a = await mk(A)
  await go(a, '/admin/docs')
  ok('서류가 있는 회사: 찾기 칸·칩 그대로 · 안내 카드 없음', (await a.locator('[data-docs-search]').count()) === 1 && (await a.locator('[data-docs-status]').count()) === 1 && (await a.locator('[data-docs-first]').count()) === 0)
  await go(a, '/admin/reports')
  ok('근무 기록이 있는 회사: 달 고르기·합계·신고 파일 그대로', (await a.locator('[data-month-nav]').count()) === 1 && (await a.locator('[data-report-summary]').count()) === 1 && (await a.locator('[data-report-downloads]').count()) === 1 && (await a.locator('[data-report-first]').count()) === 0)
  await go(a, '/admin/reports?month=2025-01')
  // (가짜 DB는 날짜 거르기를 무시해 지난달에도 이번 달 기록이 보임 — 여기선 '처음 안내로 바뀌지 않음'만 봄)
  ok('기록이 있는 회사는 지난달로 가도 처음 안내 없음 (달 고르기 그대로)', (await a.locator('[data-report-first]').count()) === 0 && (await a.locator('[data-month-nav]').count()) === 1)
  await go(n, '/admin/docs')
  ok('테스트 회사 서류는 새 회사에 안 보임', (await a.locator('[data-docs-job]').count()) >= 0 && (await n.locator('[data-docs-job]').count()) === 0 && (await n.locator('[data-docs-first]').count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails === 0 ? 'ALL PASSED' : `${fails} FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch((e) => { console.error(e); process.exit(2) })
