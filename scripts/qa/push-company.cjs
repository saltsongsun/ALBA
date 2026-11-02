// 근무자 휴대폰 알림 제목에 회사 이름 ('✅ 근무가 확정됐어요 · 주식회사 테스트') — 여러 회사 일을 하는 근무자가 잠금 화면에서도 구분
// 실제 웹 푸시를 받아서 확인: 이 컴퓨터에 HTTPS 받는 곳을 띄우고(자체 인증서), 그 인증서를 믿는 앱을 따로 하나 띄워
// 관리자가 지원자를 확정 → 앱이 보낸 암호화된 알림을 근무자 기기 키로 풀어 제목을 확인. 문의함 글(회사별)은 그대로
// node scripts/qa/push-company.cjs <default 가짜> <작업 폴더>
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
const A = 'aaaaaaaa-0000-4000-8000-000000000001', AP = '33333333-0000-4000-8000-000000000011'
const APP_ID = '11111111-0000-4000-8000-000000000012' // 김지원의 '지원' (확정 전)
const PORT = 3019
const D = `http://127.0.0.1:${PORT}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]

;(async () => {
  fs.mkdirSync(DIR, { recursive: true })
  const key = path.join(DIR, 'push-key.pem'), cert = path.join(DIR, 'push-cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' })

  // 1. 알림 받는 곳 (근무자 휴대폰 대신)
  const got = []
  const recv = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { got.push(Buffer.concat(chunks)); res.writeHead(201).end() })
  })
  await new Promise((r) => recv.listen(0, '127.0.0.1', r))
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = randomBytes(16).toString('base64url')
  const [w] = await rest(`applications?id=eq.${APP_ID}`)
  await rest('push_subscriptions', 'POST', { id: 'eeeeeeee-0000-4000-8000-0000000000f1', user_id: w?.user_id ?? AP, endpoint: `https://127.0.0.1:${recv.address().port}/push/1`, p256dh: ecdh.getPublicKey().toString('base64url'), auth, created_at: new Date().toISOString() })

  // 2. 그 인증서를 믿는 앱 (나머지 설정은 다른 테스트와 같은 가짜 값)
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

    // 3. 관리자가 김지원을 확정
    const b = await chromium.launch()
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
    const p = await ctx.newPage()
    await p.goto(`${D}/admin`)
    await p.evaluate(
      async ({ id, args }) => {
        const body = new FormData()
        body.append('0', JSON.stringify(args))
        await fetch(location.pathname, { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body }).then((r) => r.text())
      },
      { id: idOf('admin', 'decideApplication'), args: [APP_ID, 'approved'] },
    )
    for (let i = 0; i < 40 && !got.length; i++) await new Promise((r) => setTimeout(r, 250))
    await b.close()

    ok('근무자 기기로 알림이 감', got.length >= 1, `${got.length}건`)
    let msg = null
    try { msg = JSON.parse(ece.decrypt(got[0], { version: 'aes128gcm', privateKey: ecdh, authSecret: auth }).toString('utf8')) } catch (e) { console.log('풀기 실패', e.message) }
    ok('알림 제목: 무슨 일 · 회사 이름', msg?.title === '✅ 근무가 확정됐어요 · 주식회사 테스트', JSON.stringify(msg?.title))
    ok('알림 내용: 공고 이름', (msg?.body ?? '').includes('경상남도 생활체육대축전 행사장 안내 스태프'))
    const inbox = (await rest('messages')).find((m) => m.thread_user_id === (w?.user_id ?? AP) && (m.body ?? '').startsWith('✅ 근무가 확정됐어요'))
    ok('문의함 글은 그대로 (회사별 문의함이라 회사 이름 안 붙임)', !!inbox && inbox.body.split('\n')[0] === '✅ 근무가 확정됐어요' && inbox.company_id === '99999999-0000-4000-8000-000000000099')
  } finally {
    stop()
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
