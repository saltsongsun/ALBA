// 보안: 근무자 명단(목록·상세·명부 CSV·주민번호 보기)은 관리자 본인 로그인 비밀번호를 한 번 더 넣어야 10분 동안 열림
// · 틀리면 안 열림 · 8번 틀리면 잠시 막힘 · 다른 관리자 표로는 안 열림 · 지금 잠그기 · 360px
// node scripts/qa/roster-lock.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac, randomBytes, scryptSync } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002'
const PIN = '583014'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.next/server/server-reference-manifest.json'), 'utf8')).node
const idOf = (file, name) => Object.entries(MAN).find(([, v]) => v.filename === `src/app/actions/${file}.ts` && v.exportedName === name)?.[0]

;(async () => {
  // 관리자 비밀번호를 실제 해시로 (앱과 같은 방식)
  const salt = randomBytes(16)
  await rest(`users?id=eq.${A}`, 'PATCH', { pin_hash: `s1:${salt.toString('base64')}:${scryptSync(PIN, salt, 32).toString('base64')}` })

  const b = await chromium.launch()
  const errs = []
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
  const locked = () => p.locator('[data-roster-lock]').isVisible().catch(() => false)

  // ── 1. 잠겨 있음 ──
  await p.goto(`${D}/admin/workers`)
  ok('근무자 목록: 잠금 화면', await locked())
  ok('잠금 화면에는 근무자 이름·번호 없음', !(await p.getByText('010-3333-4444').count()) && !(await p.getByText(/근무자 \d+명/).count()))
  ok('360px: 옆으로 안 밀림', await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))
  await p.goto(`${D}/admin/workers/${W}`)
  ok('근무자 상세: 잠금 화면', await locked())
  await p.goto(`${D}/admin/export/workers`)
  ok('명부 CSV: 잠금 화면으로 보냄', (await locked()) && p.url().includes('/admin/workers'), p.url())
  const r = await p.evaluate(
    async ({ id, args }) => {
      const body = new FormData()
      body.append('0', JSON.stringify(args))
      return fetch('/admin', { method: 'POST', headers: { 'Next-Action': id, Accept: 'text/x-component' }, body }).then((x) => x.text())
    },
    { id: idOf('admin', 'revealRrn'), args: [W, null] },
  )
  ok('주민번호 보기 요청을 직접 보내도 막힘', r.includes('명단 잠금이 풀려 있지 않아요'), r.slice(-120))

  // ── 2. 틀린 비밀번호 ──
  await p.goto(`${D}/admin/workers`)
  await p.locator('#roster-pin').fill('111111')
  await p.getByRole('button', { name: '명단 열기' }).click()
  ok('틀리면: 안내', await p.getByText('비밀번호가 맞지 않아요').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('틀리면: 계속 잠금', await locked())

  // ── 3. 맞는 비밀번호 → 10분 동안 열림 ──
  await p.locator('#roster-pin').fill(PIN)
  await p.getByRole('button', { name: '명단 열기' }).click()
  await p.locator('[data-roster-open]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('맞으면: 근무자 목록이 열림', (await p.getByText(/근무자 \d+명/).count()) > 0 && !(await locked()))
  ok('열려 있는 동안 남은 시간 표시', /명단 열림 · 10분 뒤 잠김/.test(await p.locator('[data-roster-open]').innerText().catch(() => '')))
  const rc = (await ctx.cookies()).find((c) => c.name === 'alba_roster')
  ok('잠금 해제 표: 앱만 읽고(httpOnly) 관리자 화면에서만', !!rc && rc.httpOnly && rc.path === '/admin' && rc.sameSite === 'Strict', JSON.stringify(rc && { path: rc.path, httpOnly: rc.httpOnly, sameSite: rc.sameSite }))
  await p.goto(`${D}/admin/workers/${W}`)
  ok('근무자 상세도 열림', !(await locked()) && (await p.getByText('← 근무자 목록').count()) === 1)
  const csv = await p.evaluate(() => fetch('/admin/export/workers').then((x) => ({ s: x.status, t: x.headers.get('content-type') })))
  ok('명부 CSV 내려받기 됨', csv.s === 200 && (csv.t || '').includes('csv'), JSON.stringify(csv))

  // ── 4. 지금 잠그기 ──
  await p.goto(`${D}/admin/workers`)
  await p.getByRole('button', { name: '지금 잠그기' }).click()
  await p.locator('[data-roster-lock]').waitFor({ timeout: 8000 }).catch(() => {})
  ok('지금 잠그기 → 다시 잠금', await locked())

  // ── 5. 다른 관리자의 표로는 안 열림 ──
  await ctx.addCookies([{ name: 'alba_roster', value: roster(W), url: D }])
  await p.goto(`${D}/admin/workers`)
  ok('다른 사람 표로는 안 열림', await locked())

  // ── 6. 계속 틀리면 잠시 막힘 ──
  for (let i = 0; i < 8; i++) {
    await p.locator('#roster-pin').fill('000000')
    await p.getByRole('button', { name: '명단 열기' }).click()
    await p.waitForTimeout(250)
    await p.locator('button[aria-busy=true]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  }
  await p.locator('#roster-pin').fill(PIN)
  await p.getByRole('button', { name: '명단 열기' }).click()
  ok('8번 틀린 뒤에는 맞아도 잠시 막힘', await p.getByText('너무 여러 번 틀렸어요').first().waitFor({ timeout: 8000 }).then(() => true, () => false))
  ok('막힌 동안 계속 잠금', await locked())

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
