// 묶음 369 (정기 개선 2026-11-24 03:35 KST)
// · 회사 간 자료 분리 점검 — 외주·전문가 쪽 (batch366은 근무자·서류 쪽):
//   다른 회사(격리상사369)의 외주 업체 · 대금 · 견적 요청 · 전문가 의뢰 공고가
//   우리 회사만 맡은 관리자(N)의 화면(외주 3개 탭 · 업체 상세 · 견적 요청 · 공고 · 대시보드 · 신고)과
//   내려받기(사업소득 · 기타소득 · 정산 CSV)에 새지 않는지
//   · 외주 업체 계정: 나를 등록한 회사의 대금만 '견적·대금'에 (나와 상관없는 업체 계정에는 안 보임)
//   · 대조: 그 회사를 보는 최고 관리자 / 그 업체 계정에는 같은 자료가 보임 (검사가 헛돌지 않게)
// node scripts/qa/batch369.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000369'
const N = 'aaaaaaaa-0000-4000-8000-000000036901' // 우리 회사(C1)만 맡은 관리자
const VU = '55555555-0000-4000-8000-000000036901' // 격리업체369와 이어진 외주 업체 계정
const OU = '55555555-0000-4000-8000-000000036902' // 아무 회사와도 안 이어진 외주 업체 계정
const V2 = '77777777-0000-4000-8000-000000036901'
const P2 = 'dddddddd-0000-4000-8000-0000000369e1'
const Q2 = 'dddddddd-0000-4000-8000-0000000369f1'
const JE2 = 'cccccccc-0000-4000-8000-0000000369e1'
const MARK = ['격리업체369', '격리대금369', '격리견적369', '격리의뢰369']
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json().catch(() => null))
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
const kday = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10)
const leaks = (t, extra = []) => [...MARK, ...extra].filter((m) => (t ?? '').includes(m))

;(async () => {
  const today = kday(Date.now()), tmr = kday(Date.now() + 864e5), yday = kday(Date.now() - 864e5)
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  const [job] = await rest(`jobs?id=eq.${J}`)
  const { applications: _a, attendance: _t, ...jl } = job
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '격리상사369', join_code: 'ISO369', seal_image: null, created_at: ago(5) })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자369', phone: '01036900001', is_super: false })
  await rest('company_members', 'POST', { company_id: C1, user_id: N, role: 'admin', created_at: ago(5) })
  const vendorUser = (id, name, phone) => rest('users', 'POST', { id, name, phone, role: 'worker', member_type: 'vendor', active: true, careers: [], photo_at: null, created_at: ago(50) })
  await vendorUser(VU, '격리업체대표369', '01036900002')
  await vendorUser(OU, '다른업체대표369', '01036900003')
  // 다른 회사의 외주 업체(그 업체 계정과 이어짐) · 지급 대기 대금 · 진행 중 견적 요청 · 전문가 의뢰 공고
  await rest('vendors', 'POST', { id: V2, company_id: C2, user_id: VU, name: '격리업체369', category: '음향', contact_name: '담당', phone: '01036900002', email: null, business_no: null, bank_name: null, bank_account_enc: null, account_holder: null, memo: null, active: true, created_at: ago(40) })
  await rest('vendor_payments', 'POST', { id: P2, company_id: C2, vendor_id: V2, job_id: null, quote_id: null, title: '격리대금369', amount: 1234000, vat_included: true, due_date: yday, invoice_at: null, paid_at: null, memo: null, created_at: ago(30) })
  await rest('quote_requests', 'POST', { id: Q2, company_id: C2, job_id: null, title: '격리견적369', details: null, due_date: tmr, status: 'open', created_by: A, created_at: ago(20) })
  await rest('jobs', 'POST', { ...jl, id: JE2, company_id: C2, company: { company_name: '격리상사369' }, audience: 'expert', title: '격리의뢰369', start_date: tmr, end_date: tmr, status: 'open', applications: [], attendance: [], created_at: ago(10) })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, company) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }, ...(company ? [{ name: 'hw_company', value: company, url: D }] : [])])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const body = async (p, path) => {
    await p.goto(`${D}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
    await p.waitForTimeout(150)
    return p.locator('body').innerText().catch(() => '')
  }
  const fetchText = async (p, path) => {
    const r = await p.request.get(`${D}${path}`).catch(() => null)
    if (!r) return { status: 0, text: '' }
    return { status: r.status(), text: (await r.body().catch(() => Buffer.from(''))).toString('utf8') }
  }

  // ── 0. 대조: 그 회사를 보는 최고 관리자에게는 보임
  const s = await pg(A, C2)
  const sQuotes = await body(s, '/admin/vendors')
  const sPay = await body(s, '/admin/vendors?tab=pay')
  const sList = await body(s, '/admin/vendors?tab=list')
  const sJobs = await body(s, '/admin/jobs')
  ok('대조: 그 회사 외주 화면엔 견적 요청 · 대금 · 업체가 보임', sQuotes.includes('격리견적369') && sPay.includes('격리대금369') && sList.includes('격리업체369'), `${sQuotes.includes('격리견적369')} ${sPay.includes('격리대금369')} ${sList.includes('격리업체369')}`)
  ok('대조: 그 회사 공고 목록엔 전문가 의뢰가 보임', sJobs.includes('격리의뢰369'))

  // ── 1. 우리 회사만 맡은 관리자: 화면 어디에도 없음
  const n = await pg(N, C1)
  const pages = ['/admin', '/admin/vendors', '/admin/vendors?tab=pay', '/admin/vendors?tab=list', `/admin/vendors/${V2}`, `/admin/vendors/requests/${Q2}`, '/admin/jobs', '/admin/jobs?tab=past', `/admin/jobs/${JE2}`, `/admin/jobs/${JE2}?tab=pay`, '/admin/reports', '/admin/weekly', '/admin/chat']
  for (const path of pages) {
    const t = await body(n, path)
    const found = leaks(t, ['격리상사369'])
    ok(`한 회사 관리자 새지 않음: ${path}`, found.length === 0, found.join(','))
  }
  // 맡지 않은 회사를 쿠키로 골라도 그 회사 외주 자료 없음
  const nForce = await pg(N, C2)
  for (const path of ['/admin/vendors', '/admin/vendors?tab=pay', '/admin/vendors?tab=list']) {
    const t = await body(nForce, path)
    ok(`맡지 않은 회사 쿠키로도 새지 않음: ${path}`, leaks(t).length === 0, leaks(t).join(','))
  }

  // ── 2. 내려받기
  const month = today.slice(0, 7)
  for (const path of [`/admin/export/business-income?month=${month}`, `/admin/export/other-income?month=${month}`, `/admin/export/settlement?job=${JE2}`, '/admin/export/workers']) {
    const r = await fetchText(n, path)
    const found = leaks(r.text, ['격리상사369'])
    ok(`내려받기 새지 않음: ${path}`, found.length === 0, `${r.status} ${found.join(',')}`)
  }

  // ── 3. 외주 업체 계정: 나를 등록한 회사 대금만 (상관없는 업체 계정엔 안 보임)
  const vu = await pg(VU)
  const vMoney = await body(vu, '/pro/money')
  ok("대조: 이어진 업체 계정 '견적·대금'엔 그 회사 대금이 보임", vMoney.includes('격리대금369') && vMoney.includes('격리상사369'), vMoney.slice(0, 120).replace(/\n/g, ' '))
  const ou = await pg(OU)
  const oMoney = await body(ou, '/pro/money')
  ok('상관없는 업체 계정엔 다른 회사 대금·업체 없음', leaks(oMoney, ['격리상사369']).length === 0, leaks(oMoney, ['격리상사369']).join(','))
  const oPro = await body(ou, '/pro')
  // 열린 전문가 의뢰 공고는 누구나 보는 공개 공고라 홈에 보여도 됨 → 비공개 자료(대금·견적·업체)만 봄
  const priv = ['격리대금369', '격리견적369', '격리업체369'].filter((m) => oPro.includes(m))
  ok('상관없는 업체 계정 홈에도 대금·견적·업체 없음 (공개 의뢰 공고는 괜찮음)', priv.length === 0, priv.join(','))

  ok('화면 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAIL` : 'ALL PASS')
  process.exit(fails ? 1 : 0)
})()
