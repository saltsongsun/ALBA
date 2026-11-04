// 공고 조회: 로그인 전에 본 사람이 로그인 뒤 다시 봐도 한 번만 셈 (같은 휴대폰의 비로그인 기록을 그 사람 기록으로 합침)
// + 관리자 '본 가입자 N명 · 그중 지원 안 함 M명' (따로 더하는 숫자로 오해하지 않게)
// node scripts/qa/view-merge.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003', J2 = 'cccccccc-0000-4000-8000-0000000000f2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const views = async (job) => (await rest('job_views')).filter((v) => v.job_id === job)

;(async () => {
  const [j1] = await rest(`jobs?id=eq.${J}`)
  await rest('jobs', 'POST', { ...j1, id: J2, title: '두 번째 공고 주차 안내', applications: [], required_docs: [] })
  await fetch(`${MD}/rest/v1/job_views`, { method: 'DELETE' })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const waitViews = async (job, pred) => {
    for (let i = 0; i < 40; i++) {
      const v = await views(job)
      if (pred(v)) return v
      await new Promise((r) => setTimeout(r, 250))
    }
    return views(job)
  }

  // ── 1. 로그인 없이 두 공고를 봄 (카톡 링크로 들어온 것처럼) ──
  await p.goto(`${D}/jobs/${J}`)
  let v = await waitViews(J, (x) => x.length === 1)
  ok('로그인 전: 비로그인 1명으로 기록', v.length === 1 && v[0].viewer.startsWith('v:') && !v[0].user_id)
  await p.goto(`${D}/jobs/${J2}`)
  await waitViews(J2, (x) => x.length === 1)

  // ── 2. 같은 휴대폰에서 로그인 뒤 다시 봄 → 한 사람으로 합쳐짐 ──
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  await p.goto(`${D}/jobs/${J}`)
  v = await waitViews(J, (x) => x.length === 1 && x[0].viewer === `u:${W}`)
  ok('로그인 뒤: 같은 사람은 한 번만 (비로그인 기록이 그 사람 기록으로)', v.length === 1 && v[0].viewer === `u:${W}` && v[0].user_id === W, JSON.stringify(v.map((x) => x.viewer)))
  ok('30분 안에 다시 본 것은 같은 방문 (1번)', v[0]?.visits === 1, String(v[0]?.visits))
  const v2 = await views(J2)
  ok('로그인 전에 본 다른 공고도 그 사람 기록으로', v2.length === 1 && v2[0].viewer === `u:${W}`, JSON.stringify(v2.map((x) => x.viewer)))
  // (DB가 먼저 합쳐지고, 쿠키를 지우라는 응답은 그 뒤에 휴대폰에 닿으므로 잠깐 기다림)
  let vidGone = false
  for (let i = 0; i < 30 && !vidGone; i++) {
    vidGone = !(await ctx.cookies()).some((c) => c.name === 'hw_vid')
    if (!vidGone) await p.waitForTimeout(100)
  }
  ok('비로그인 표시 쿠키는 지움', vidGone)

  // ── 3. 다른 사람(지원자) 1명 더: 로그인해서 봄 ──
  const ctx2 = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx2.addCookies([{ name: 'alba_session', value: cookie(AP), url: D }])
  const p2 = await ctx2.newPage()
  await p2.goto(`${D}/jobs/${J}`)
  await waitViews(J, (x) => x.length === 2)

  // ── 4. 관리자 화면: 숫자가 겹치지 않게 ──
  const actx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await actx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const ad = await actx.newPage()
  ad.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await ad.goto(`${D}/admin/jobs/${J}`)
  await ad.getByText(/본 가입자/).first().waitFor({ timeout: 10000 }).catch(() => {})
  const head = await ad.locator('body').innerText()
  ok('확인 2명 (가입자 2명): 로그인 전·후 한 사람을 두 번 세지 않음', /확인\s*2\s*명\s*\(가입자 2명\)/.test(head), (head.match(/확인[^\n]*/) || [''])[0])
  ok('본 가입자 2명 · 그중 지원 안 함 N명', /본 가입자 2명 · 그중 지원 안 함 \d+명/.test(head), (head.match(/본 가입자[^\n]*/) || [''])[0])
  const sum = await ad.locator('details summary', { hasText: '본 가입자' }).boundingBox()
  ok('360px: 요약 한 줄', !!sum && sum.height < 30, JSON.stringify(sum))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
