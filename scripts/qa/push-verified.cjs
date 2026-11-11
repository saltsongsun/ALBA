// 새 회사 확인이 끝나면 그 회사 관리자에게 휴대폰 알림 ('✅ 회사 확인이 끝났어요' → 근무자 명단으로)
// · 다른 회사 관리자에게는 가지 않음 · 확인 전 관리자 홈 안내는 한 줄 + 눌러서 자세히, 확인 뒤에는 사라짐
// 실제 웹 푸시를 받아서 확인 (push-admin-company.cjs와 같은 방법): HTTPS 받는 곳 + 그 인증서를 믿는 앱을 따로 띄움
// node scripts/qa/push-verified.cjs <default 가짜> <작업 폴더>
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
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const C1 = '99999999-0000-4000-8000-000000000099', C2 = '99999999-0000-4000-8000-000000019901'
const M = 'aaaaaaaa-0000-4000-8000-000000019901', N = 'aaaaaaaa-0000-4000-8000-000000019902'
const PORT = 3021
const D = `http://127.0.0.1:${PORT}`
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const one = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

;(async () => {
  fs.mkdirSync(DIR, { recursive: true })
  const key = path.join(DIR, 'push-key.pem'), cert = path.join(DIR, 'push-cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' })

  // 1. 알림 받는 곳 (새 회사 관리자 M · 다른 회사 관리자 N)
  const got = { m: [], n: [] }
  const recv = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { got[req.url.endsWith('/m') ? 'm' : 'n'].push(Buffer.concat(chunks)); res.writeHead(201).end() })
  })
  await new Promise((r) => recv.listen(0, '127.0.0.1', r))
  const dev = (who) => { const ecdh = createECDH('prime256v1'); ecdh.generateKeys(); return { who, ecdh, auth: randomBytes(16).toString('base64url') } }
  const dm = dev('m'), dn = dev('n')
  const open = (d, buf) => { try { return JSON.parse(ece.decrypt(buf, { version: 'aes128gcm', privateKey: d.ecdh, authSecret: d.auth }).toString('utf8')) } catch (e) { console.log('풀기 실패', e.message); return null } }

  // 2. 직접 가입해 확인 전인 새 회사(새봄기획)와 그 관리자 M · 첫 회사만 맡은 관리자 N
  const nowIso = new Date().toISOString()
  const [c1] = await rest(`companies?id=eq.${C1}`)
  const [a] = await rest(`users?id=eq.${A}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '새봄기획', seal_image: null, verified: false, created_at: nowIso })
  await rest('users', 'POST', { ...a, id: M, name: '새봄담당', phone: '01019900001', is_super: false })
  await rest('users', 'POST', { ...a, id: N, name: '첫회사담당', phone: '01019900002', is_super: false })
  for (const [company_id, user_id] of [[C2, M], [C1, N]]) await rest('company_members', 'POST', { company_id, user_id, role: 'admin', created_at: nowIso })
  for (const [d, user_id, id] of [[dm, M, 'eeeeeeee-0000-4000-8000-000000019901'], [dn, N, 'eeeeeeee-0000-4000-8000-000000019902']]) {
    await rest('push_subscriptions', 'POST', { id, user_id, endpoint: `https://127.0.0.1:${recv.address().port}/push/${d.who}`, p256dh: d.ecdh.getPublicKey().toString('base64url'), auth: d.auth, created_at: nowIso })
  }

  // 3. 그 인증서를 믿는 앱
  const app = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, SUPABASE_URL: MD, SUPABASE_SERVICE_ROLE_KEY: 'dummy', SESSION_SECRET: SECRET, ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', ADMIN_SETUP_CODE: 'x', CRON_SECRET: 'test-cron', OPS_OWNER_IDS: A, NODE_EXTRA_CA_CERTS: cert },
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
    const b = await chromium.launch()
    const pg = async (uid) => {
      const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
      await ctx.addInitScript(() => { try { localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
      await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
      return ctx.newPage()
    }

    // 4. 확인 전: 새 회사 관리자 홈의 안내 (한 줄 + 눌러서 자세히)
    const m = await pg(M)
    await m.goto(`${D}/admin`); await m.waitForLoadState('networkidle').catch(() => {})
    const note = m.locator('[data-unverified]')
    const head = one(await note.locator('summary').innerText().catch(() => ''))
    ok("확인 전 안내 한 줄: '🔒 회사 확인 중이에요 · 공고·확정·서류·출퇴근·정산은 지금 바로 돼요'", head === '🔒 회사 확인 중이에요 공고·확정·서류·출퇴근·정산은 지금 바로 돼요', head)
    ok('접혀 있을 때 높이가 낮음 (두 줄) · 360px 옆으로 안 밀림', (await note.evaluate((el) => !el.open && el.getBoundingClientRect().height < 76).catch(() => false)) && (await m.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
    await note.locator('summary').click()
    await m.waitForFunction(() => document.querySelector('[data-unverified]')?.open === true, null, { timeout: 5000 }).catch(() => {})
    await m.waitForTimeout(500) // 펼쳐지는 움직임이 끝난 뒤에 글을 읽음 (움직이는 동안은 안쪽 글이 아직 안 잡힘)
    const body = one(await note.innerText().catch(() => ''))
    ok("누르면 자세히: 확인 뒤에 열리는 것 + '확인이 끝나면 휴대폰 알림으로 알려 드려요'", body.includes('해피워크 전체 회원 명단') && body.includes('번호로 직접 추가') && body.includes('확인이 끝나면 휴대폰 알림으로 알려 드려요'), body.slice(0, 120))
    await m.screenshot({ path: path.join(DIR, 'unverified-open.png') }).catch(() => {})

    // 5. 운영자가 회사 관리에서 '확인 완료' (두 번 눌러야)
    const s = await pg(A)
    await s.goto(`${D}/admin/companies`); await s.waitForLoadState('networkidle').catch(() => {})
    const row = s.locator('section.card', { hasText: '새봄기획' })
    const btn = row.getByRole('button', { name: /확인/ }).first()
    await btn.click()
    await s.waitForTimeout(200)
    await row.getByRole('button', { name: /확인/ }).first().click()
    for (let i = 0; i < 60 && !got.m.length; i++) await new Promise((r) => setTimeout(r, 250))
    await new Promise((r) => setTimeout(r, 800)) // 다른 회사 관리자에게 (잘못) 가는 알림이 있다면 올 시간
    const [c2] = await rest(`companies?id=eq.${C2}`)
    ok('회사가 확인됨', c2.verified === true, JSON.stringify(c2.verified))
    const pm = got.m[0] ? open(dm, got.m[0]) : null
    ok("그 회사 관리자에게 알림: '✅ 회사 확인이 끝났어요' → 근무자 명단", got.m.length === 1 && pm?.title === '✅ 회사 확인이 끝났어요' && pm?.url === '/admin/workers' && (pm?.body ?? '').includes('전체 회원 명단'), JSON.stringify([got.m.length, pm?.title, pm?.url]))
    ok('다른 회사 관리자에게는 안 감', got.n.length === 0, `${got.n.length}건`)

    // 6. 확인 뒤: 안내가 사라짐
    await m.goto(`${D}/admin`); await m.waitForLoadState('networkidle').catch(() => {})
    ok('확인 뒤에는 관리자 홈의 확인 중 안내가 없음', (await m.locator('[data-unverified]').count()) === 0 && (await m.locator('main').innerText()).includes('현황'))
    await b.close()
  } finally {
    stop()
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
