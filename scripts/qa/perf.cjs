// 화면별 서버 응답 시간 · 가짜 DB 조회 수 (느려졌는지 확인용)
// 가짜 DB가 조회 1번마다 LAT ms 기다리게 해서, '차례로 기다리는 조회'가 몇 단계인지 시간으로 드러나게 함 (화면마다 3번 재서 가운데 값)
// node scripts/qa/perf.cjs <default 앱> <default 가짜> [LAT=80] [주소 앞부분…]
//   예) node scripts/qa/perf.cjs http://127.0.0.1:3002 http://127.0.0.1:54321 80 /admin
// 조회 순서까지 보려면 가짜 DB를 TRACE=1로 띄우면 조회마다 'T <시각> <주소>'가 찍힘
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD, LAT = '80', ...only] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const pages = [
  [A, '/admin'], [A, '/admin/jobs'], [A, `/admin/jobs/${J}?tab=apps`], [A, `/admin/jobs/${J}?tab=att`], [A, `/admin/jobs/${J}?tab=pay`], [A, `/admin/jobs/${J}?tab=docs`],
  [A, '/admin/chat'], [A, `/admin/chat/${W}`], [A, '/admin/workers'], [A, `/admin/workers/${W}`], [A, '/admin/docs'], [A, '/admin/vendors'], [A, '/admin/settings'],
  [W, '/'], [W, '/me'], [W, '/me/chat'], [W, `/jobs/${J}`], [W, '/me/history'], [W, '/me/profile'], [W, '/community'],
  [W, '/api/pulse?s=me-chat'], [A, '/api/pulse?s=admin-chat'],
].filter(([, p]) => !only.length || only.some((o) => p.startsWith(o)))
;(async () => {
  await fetch(`${MD}/__latency?ms=${LAT}`)
  const rows = []
  for (const [u, path] of pages) {
    const h = { cookie: `alba_session=${cookie(u)}; alba_roster=${roster(u)}` }
    await fetch(D + path, { headers: h, redirect: 'manual' }).then((r) => r.text()).catch(() => {}) // 데우기
    const runs = []
    let status = 0, st = null
    for (let k = 0; k < 3; k++) {
      await fetch(`${MD}/__stats`)
      const t = Date.now()
      const r = await fetch(D + path, { headers: h, redirect: 'manual' })
      await r.text()
      runs.push(Date.now() - t)
      status = r.status
      st = await (await fetch(`${MD}/__stats`)).json()
    }
    const ms = runs.sort((a, b) => a - b)[1]
    rows.push({ path, status, ms, reqs: st.reqs, kb: Math.round(st.bytes / 1024) })
  }
  await fetch(`${MD}/__latency?ms=5`)
  console.table(rows)
})()
