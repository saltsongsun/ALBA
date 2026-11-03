// 오류가 나면 '오류 내용 복사'로 시각·화면·오류 번호·기기를 한 번에 복사 + 뒤에서 난 오류 알림
// node scripts/qa/error-copy.cjs <default 앱> <default 가짜 포트>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const { execSync } = require('node:child_process')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [D, MOCK_PORT] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const see = (p, t, ms = 8000) => p.getByText(t).first().waitFor({ timeout: ms }).then(() => true, () => false)
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR', permissions: ['clipboard-read', 'clipboard-write'] })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
  await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: D }, { name: 'alba_roster', value: roster(A), url: D }])
  const p = await ctx.newPage()
  const clip = () => p.evaluate(() => navigator.clipboard.readText()).catch(() => '')

  // ── 뒤에서 난 오류: 아래 알림에서 바로 복사 ──
  await p.goto(`${D}/admin`)
  await p.waitForLoadState('networkidle')
  await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'boom from ad script', filename: 'https://ads.example.com/x.js', error: new Error('boom') })))
  ok('다른 사이트 스크립트 오류는 무시', !(await see(p, '문제가 생겼어요', 1200)))
  await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'TypeError: x is undefined', filename: location.origin + '/_next/static/chunks/app.js', error: new TypeError('x is undefined') })))
  ok('우리 앱 오류는 알림', await see(p, '문제가 생겼어요'))
  await p.getByRole('button', { name: '오류 복사' }).click()
  let text = await clip()
  ok('알림에서 오류 복사', text.includes('[해피워크 오류 보고]') && text.includes('종류: 화면 처리 오류') && text.includes('x is undefined') && text.includes(`화면: ${D}/admin`), text.split('\n').slice(0, 4).join(' / '))

  // ── 화면이 깨졌을 때: 오류 화면에서 복사 (가짜 DB를 멈춰서 일부러 오류) ──
  execSync(`fuser -k ${MOCK_PORT}/tcp || true`)
  await new Promise((r) => setTimeout(r, 500))
  await p.goto(`${D}/admin/vendors`)
  ok('오류 화면', await see(p, '잠시 문제가 생겼어요', 15000))
  ok('오류 번호 표시', await see(p, /오류 번호 \w+/))
  await p.getByRole('button', { name: '📋 오류 내용 복사' }).click()
  ok('복사됐다는 안내', await see(p, '복사됐어요'))
  text = await clip()
  ok('복사 내용: 시각·화면·오류 번호·기기', /시각: .+\(한국\)/.test(text) && text.includes(`화면: ${D}/`) && /오류 번호: \w+/.test(text) && text.includes('기기: Mozilla'), text.split('\n').slice(0, 5).join(' / '))
  await p.getByText('오류 내용 보기').click()
  ok('펼쳐서 직접 볼 수도 있음', await see(p, '[해피워크 오류 보고]'))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
