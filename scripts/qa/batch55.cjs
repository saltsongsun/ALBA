// 묶음 55: 서버 부담 줄이기 — 문의·단체방은 '바뀐 게 있나요?'(/api/pulse)만 몇 초마다 묻고, 바뀌었을 때만 화면을 다시 그림
//          · pulse 권한: 로그인 필요 · 근무자는 남의 단체방·관리자 문의를 못 봄 · 내용 없이 값만
//          · 아무 일 없으면 화면 다시 그리기(RSC) 요청이 없음 · 관리자가 보낸 새 메시지는 몇 초 안에 보임
//          · 얼굴 사진: 버전 주소는 하루 캐시(immutable) + ETag → 다시 물으면 304 · 권한 없는 사람은 404
// node scripts/qa/batch55.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', AP = '33333333-0000-4000-8000-000000000011'
const J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const get = (path, uid, headers = {}) => fetch(`${D}${path}`, { headers: { ...(uid ? { cookie: `alba_session=${cookie(uid)}` } : {}), 'user-agent': 'Mozilla/5.0', ...headers }, redirect: 'manual' })

;(async () => {
  // ── 1. pulse 권한 ──
  ok('로그인 안 하면 401', (await get('/api/pulse?s=me-chat')).status === 401)
  ok('모르는 종류는 404', (await get('/api/pulse?s=nope', W)).status === 404)
  ok('근무자는 관리자 문의 값을 못 봄', (await get('/api/pulse?s=admin-chat', W)).status === 404)
  ok('확정 안 된 사람은 단체방 값을 못 봄', (await get(`/api/pulse?s=room&id=${J}`, AP)).status === 404)
  const r1 = await get('/api/pulse?s=me-chat', W)
  const v1 = (await r1.json()).v
  ok('근무자 문의 값 (내용 없이) + 저장 안 함', typeof v1 === 'string' && !v1.includes('body') && (r1.headers.get('cache-control') ?? '').includes('no-store'), v1)
  ok('관리자 문의 값', (await get('/api/pulse?s=admin-chat', A)).status === 200)
  ok('단체방 값 (확정자·관리자)', (await get(`/api/pulse?s=room&id=${J}`, W)).status === 200 && (await get(`/api/pulse?s=room&id=${J}`, A)).status === 200)
  await rest('messages', 'POST', { thread_user_id: W, sender_id: A, from_admin: true, company_id: CO, job_id: null, body: '집결은 광장 분수대 앞이에요', created_at: new Date().toISOString() })
  const v2 = (await (await get('/api/pulse?s=me-chat', W)).json()).v
  ok('새 메시지가 오면 값이 바뀜', v2 !== v1, `${v1} → ${v2}`)

  // ── 2. 문의 화면: 아무 일 없으면 다시 그리지 않음 · 새 메시지는 몇 초 안에 ──
  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  await p.goto(`${D}/me/chat?co=${CO}`)
  await p.waitForLoadState('networkidle').catch(() => {})
  let rsc = 0, pulses = 0
  p.on('request', (r) => {
    const u = r.url()
    if (u.includes('/api/pulse')) pulses++
    else if (r.headers()['rsc'] === '1' || u.includes('_rsc=')) rsc++
  })
  await p.waitForTimeout(12000)
  ok('12초 동안: 가볍게 2번쯤 묻기만 하고 화면은 다시 그리지 않음', pulses >= 2 && rsc === 0, `pulse=${pulses} rsc=${rsc}`)
  await rest('messages', 'POST', { thread_user_id: W, sender_id: A, from_admin: true, company_id: CO, job_id: null, body: '내일은 우비를 꼭 챙겨 주세요', created_at: new Date().toISOString() })
  await p.getByText('내일은 우비를 꼭 챙겨 주세요').first().waitFor({ timeout: 12000 }).catch(() => {})
  ok('관리자가 보낸 새 메시지가 몇 초 안에 보임', (await p.getByText('내일은 우비를 꼭 챙겨 주세요').count()) > 0 && rsc >= 1, `rsc=${rsc}`)
  // 읽음 표시 때문에 한 번 더 그릴 수는 있어도, 그 뒤엔 조용해야 함 (끝없이 되풀이 X)
  await p.waitForTimeout(6000)
  const settled = rsc
  await p.waitForTimeout(12000)
  ok('그 뒤로는 다시 조용 (되풀이 없음)', rsc === settled, `rsc ${settled} → ${rsc}`)

  // ── 3. 얼굴 사진 캐시 ──
  const tiny = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
  const at = new Date().toISOString()
  if (!(await rest(`user_photos?user_id=eq.${W}`)).length) await rest('user_photos', 'POST', { user_id: W, data: tiny, updated_at: at })
  await rest(`users?id=eq.${W}`, 'PATCH', { photo_at: at })
  const v = Date.parse(at)
  const ph1 = await get(`/photo/${W}?v=${v}`, A)
  const etag = ph1.headers.get('etag')
  ok('관리자: 사진 + 하루 캐시(immutable) + ETag', ph1.status === 200 && /max-age=86400/.test(ph1.headers.get('cache-control') ?? '') && /immutable/.test(ph1.headers.get('cache-control') ?? '') && !!etag, `${ph1.status} ${ph1.headers.get('cache-control')}`)
  const ph2 = await get(`/photo/${W}?v=${v}`, A, { 'if-none-match': etag })
  ok('다시 물으면 304 (그대로예요)', ph2.status === 304)
  const ph3 = await get(`/photo/${W}?v=${v}`, A)
  ok('두 번째도 같은 사진 (서버에서 기억)', ph3.status === 200 && (await ph3.arrayBuffer()).byteLength > 50)
  ok('본인: 내 사진', (await get(`/photo/${W}?v=${v}`, W)).status === 200)
  ok('다른 근무자: 404', (await get(`/photo/${W}?v=${v}`, AP)).status === 404)
  ok('로그인 안 하면 401', (await get(`/photo/${W}?v=${v}`)).status === 401)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
