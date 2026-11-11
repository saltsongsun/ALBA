// 관리자 휴대폰 알림 제목: 여러 회사를 맡은 관리자에게는 회사 이름을 붙임 ('💬 근무자 문의 · 주식회사 테스트') — 잠금 화면에서도 어느 회사 일인지 구분
// 한 회사만 맡은 관리자에게는 예전 그대로 짧게 ('💬 근무자 문의') · 단체방 알림('👥 공고 이름 · 회사 이름')도 같게 (방에 참여한 관리자에게만)
// 실제 웹 푸시를 받아서 확인 (push-company.cjs와 같은 방법): 이 컴퓨터에 HTTPS 받는 곳을 띄우고, 그 인증서를 믿는 앱을 따로 띄워
// 근무자가 문의를 보냄 → 두 관리자 기기로 간 암호화된 알림을 각자 키로 풀어 제목을 확인
// node scripts/qa/push-admin-company.cjs <default 가짜> <작업 폴더>
const { chromium, devices } = require('playwright')
const { createHmac, createECDH, randomBytes } = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')
const ece = require('http_ece')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [MD, DIR] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000000187'
const M = 'aaaaaaaa-0000-4000-8000-000000018701', N = 'aaaaaaaa-0000-4000-8000-000000018702'
const PORT = 3020
const D = `http://127.0.0.1:${PORT}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  fs.mkdirSync(DIR, { recursive: true })
  const key = path.join(DIR, 'push-key.pem'), cert = path.join(DIR, 'push-cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' })

  // 1. 알림 받는 곳 (두 관리자 휴대폰 대신 — 주소 끝으로 누구 것인지 구분)
  const got = { m: [], n: [] }
  const recv = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { const who = req.url.endsWith('/m') ? 'm' : 'n'; got[who].push(Buffer.concat(chunks)); res.writeHead(201).end() })
  })
  await new Promise((r) => recv.listen(0, '127.0.0.1', r))
  const dev = (who) => { const ecdh = createECDH('prime256v1'); ecdh.generateKeys(); return { who, ecdh, auth: randomBytes(16).toString('base64url') } }
  const dm = dev('m'), dn = dev('n')
  const open = (d, buf) => { try { return JSON.parse(ece.decrypt(buf, { version: 'aes128gcm', privateKey: d.ecdh, authSecret: d.auth }).toString('utf8')) } catch (e) { console.log('풀기 실패', e.message); return null } }

  // 2. 두 번째 회사 · 관리자 M(두 회사) · 관리자 N(첫 회사만) + 각자 알림 받을 기기
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째기획', seal_image: null, created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '두회사관리자', phone: '01018700001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '한회사관리자', phone: '01018700002', is_super: false })
  for (const [company_id, user_id] of [[C1, M], [C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })
  for (const [d, user_id, id] of [[dm, M, 'eeeeeeee-0000-4000-8000-000000018701'], [dn, N, 'eeeeeeee-0000-4000-8000-000000018702']]) {
    await rest('push_subscriptions', 'POST', { id, user_id, endpoint: `https://127.0.0.1:${recv.address().port}/push/${d.who}`, p256dh: d.ecdh.getPublicKey().toString('base64url'), auth: d.auth, created_at: nowIso })
  }

  // 3. 그 인증서를 믿는 앱 (나머지 설정은 다른 테스트와 같은 가짜 값)
  const app = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, SUPABASE_URL: MD, SUPABASE_SERVICE_ROLE_KEY: 'dummy', SESSION_SECRET: SECRET, ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', ADMIN_SETUP_CODE: 'x', CRON_SECRET: 'test-cron', NODE_EXTRA_CA_CERTS: cert },
    stdio: 'ignore',
    detached: true,
  })
  const stop = () => { try { process.kill(-app.pid) } catch {} recv.close() }
  try {
    for (let i = 0; i < 60; i++) {
      const s = await fetch(`${D}/login`).then((r) => r.status, () => 0)
      if (s === 200) break
      await new Promise((r) => setTimeout(r, 500))
    }

    // 4. 근무자가 첫 회사 공고로 문의를 보냄
    const b = await chromium.launch()
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); sessionStorage.setItem('clockout-prompt-later', String(Date.now())); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(W), url: D }])
    const p = await ctx.newPage()
    await p.goto(`${D}/me/chat?job=${J}`)
    const box = p.locator('textarea[name=body]')
    await box.waitFor({ timeout: 15000 }).catch(() => {})
    await p.waitForLoadState('networkidle').catch(() => {})
    await box.fill('알림 제목 확인용 문의예요')
    await p.locator('button[type=submit][aria-label="보내기"]').click()
    for (let i = 0; i < 60 && !(got.m.length && got.n.length); i++) await new Promise((r) => setTimeout(r, 250))
    const afterAsk = { m: got.m.length, n: got.n.length } // 문의 알림까지의 개수 (아래 단체방 알림과 따로 셈)

    // 5. 단체방: 방에 참여한 관리자(두회사관리자)에게만 · 제목 끝에 회사 이름 (한회사관리자는 참여 안 함 → 알림 없음)
    await rest('job_chat_reads', 'POST', { job_id: J, user_id: M, read_at: new Date().toISOString() })
    await rest(`jobs?id=eq.${J}`, 'PATCH', { end_date: new Date(Date.now() + 9 * 3600e3 + 864e5).toISOString().slice(0, 10) }) // 저녁에 돌려도 방이 열려 있게
    await p.goto(`${D}/me/chat/room/${J}`)
    await box.waitFor({ timeout: 15000 }).catch(() => {})
    await p.waitForLoadState('networkidle').catch(() => {})
    await box.fill('단체방 알림 확인용 글이에요')
    await p.locator('button[type=submit][aria-label="보내기"]').click()
    for (let i = 0; i < 60 && got.m.length < 2; i++) await new Promise((r) => setTimeout(r, 250))
    await new Promise((r) => setTimeout(r, 800)) // 한회사관리자에게 (잘못) 가는 알림이 있다면 올 시간
    await b.close()

    const sent = (await rest('messages')).find((x) => x.body === '알림 제목 확인용 문의예요')
    ok('문의가 첫 회사로 저장됨', !!sent && sent.company_id === C1, JSON.stringify(sent?.company_id))
    ok('두 관리자 기기로 알림이 감', afterAsk.m === 1 && afterAsk.n === 1, `두회사 ${afterAsk.m}건 · 한회사 ${afterAsk.n}건`)
    const mm = got.m[0] ? open(dm, got.m[0]) : null
    const nm = got.n[0] ? open(dn, got.n[0]) : null
    ok('여러 회사를 맡은 관리자: 제목 끝에 회사 이름', mm?.title === '💬 근무자 문의 · 주식회사 테스트', JSON.stringify(mm?.title))
    ok('한 회사만 맡은 관리자: 예전 그대로 짧게', nm?.title === '💬 근무자 문의', JSON.stringify(nm?.title))
    const rm = got.m[1] ? open(dm, got.m[1]) : null
    ok('단체방 글: 참여한 관리자에게만 (참여 안 한 관리자에게는 안 감)', got.m.length === 2 && got.n.length === 1, `두회사 ${got.m.length}건 · 한회사 ${got.n.length}건`)
    ok('단체방 알림 제목에도 회사 이름 (여러 회사를 맡은 관리자)', rm?.title === '👥 경상남도 생활체육대축전 행사장 안내 스태프 · 주식회사 테스트' && rm?.url === `/admin/chat/room/${J}` && (rm?.body ?? '').includes('단체방 알림 확인용 글이에요'), JSON.stringify([rm?.title, rm?.url]))
    ok('내용·여는 주소는 둘 다 같음', !!mm && !!nm && mm.body === nm.body && mm.body.includes('알림 제목 확인용 문의예요') && mm.url === `/admin/chat/${W}` && nm.url === mm.url && mm.tag === nm.tag, JSON.stringify([mm?.body, mm?.url, nm?.url]))
  } finally {
    stop()
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
