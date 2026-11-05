// 묶음 29: 공고 '확인' 인원 — 같은 사람이 손님(카톡 안 브라우저 등)으로 잠깐 보고 곧바로 다른 브라우저·앱에서 로그인해 다시 본 경우 한 번만
// · 잠깐 본 손님 바로 뒤(10분 안) 회원이 처음 봄 → 같은 사람 · 오래 본 손님·멀리 떨어진 손님은 따로 · 손님 하나는 회원 한 명에게만
// node scripts/qa/batch29.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const AP = '33333333-0000-4000-8000-000000000011'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const at = (min) => new Date(Date.now() - min * 60_000).toISOString()
const row = (viewer, user_id, first, last) => ({ job_id: J, viewer, user_id, first_seen: at(first), last_seen: at(last), visits: 1 })
const stats = () => fetch(`${D}/api/jobs/${J}/viewers`, { headers: { cookie: `alba_session=${cookie(A)}` } }).then((r) => r.json())

;(async () => {
  await fetch(`${MD}/rest/v1/job_views?job_id=eq.${J}`, { method: 'DELETE' })
  // 1) 근무자: 카톡 안 브라우저에서 20초 보고 → 4분 뒤 크롬에서 로그인해 다시 봄 (지원함) → 한 사람
  // 2) 지원자: 1시간 전에 회원으로만 봄 → 한 사람
  // 3) 손님: 2시간 전에 잠깐 봄, 그 뒤 10분 안에 처음 본 회원 없음 → 따로 한 사람
  // 4) 손님: 하루 넘게 여러 번 본 손님 (회원이 그 사이 처음 봤어도 다른 사람일 가능성) → 따로
  await rest('job_views', 'POST', [
    row('v:kakao-inapp-aaaaaaaa', null, 10, 9.7),
    row(`u:${W}`, W, 6, 2),
    row(`u:${AP}`, AP, 60, 55),
    row('v:someone-else-bbbbbbbb', null, 120, 119),
    row('v:long-guest-cccccccccc', null, 2000, 3),
  ])
  let s = await stats()
  ok('확인 인원: 손님→회원으로 다시 본 사람은 한 번만 (5줄 → 4명)', s.total === 4, JSON.stringify(s))
  ok('가입자 인원은 그대로 2명', s.members === 2)

  // 손님 하나가 두 회원에게 겹쳐 짝지어지지 않음: 같은 손님 바로 뒤에 회원 둘이 처음 봄 → 손님 하나만 빠짐
  await fetch(`${MD}/rest/v1/job_views?job_id=eq.${J}`, { method: 'DELETE' })
  await rest('job_views', 'POST', [row('v:one-guest-dddddddd', null, 30, 29.8), row(`u:${W}`, W, 28, 20), row(`u:${AP}`, AP, 27, 20)])
  s = await stats()
  ok('손님 하나는 회원 한 명에게만 (3줄 → 2명)', s.total === 2 && s.members === 2, JSON.stringify(s))

  // 10분이 넘게 지나 로그인해 본 사람은 따로 (다른 사람일 수 있어서)
  await fetch(`${MD}/rest/v1/job_views?job_id=eq.${J}`, { method: 'DELETE' })
  await rest('job_views', 'POST', [row('v:late-guest-eeeeeeee', null, 60, 59.5), row(`u:${W}`, W, 40, 30)])
  s = await stats()
  ok('10분 넘게 떨어지면 따로 (2명)', s.total === 2, JSON.stringify(s))

  // 화면: 관리자 공고 화면 '확인 N명' · 공고 목록 👀 N
  await fetch(`${MD}/rest/v1/job_views?job_id=eq.${J}`, { method: 'DELETE' })
  await rest('job_views', 'POST', [row('v:kakao-inapp-aaaaaaaa', null, 10, 9.7), row(`u:${W}`, W, 6, 2), row(`u:${AP}`, AP, 60, 55)])
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/admin/jobs/${J}`)
  const line = await p.getByText(/확인\s*\d+\s*명/).first().innerText().catch(() => '')
  ok("관리자 공고 화면: '확인 2명 (가입자 2명)'", /확인\s*2\s*명/.test(line) && line.includes('가입자 2명'), line)
  await p.goto(`${D}/admin/jobs`)
  const card = await p.locator(`a[href="/admin/jobs/${J}"]`).first().innerText().catch(() => '')
  ok('공고 목록: 확인 2 (눈 아이콘)', /^\s*2\b/.test(await p.locator(`a[href="/admin/jobs/${J}"] [data-views]`).first().innerText().catch(() => '')), card.replace(/\n/g, ' | '))

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
