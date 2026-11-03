// 서명한 서류·임금명세서·근무확인서: 관리자·근무자 모두 열람 일시·열람자 워터마크 (인쇄에도)
// node scripts/qa/watermark.cjs <working 앱>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const roster = (u) => { const p = Buffer.from(JSON.stringify({ u, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update('roster:' + p).digest('base64url')}` } // 근무자 명단 잠금을 푼 상태로 (관리자 화면 테스트용)
const [W_] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', WK = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
const DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1') } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: W_ }, { name: 'alba_roster', value: roster(uid), url: W_ }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p
  }
  // 문서 배경에 찍힌 워터마크 글자 (data:image/svg 안의 글자)
  const mark = async (p) =>
    p.locator('article.print-sheet [data-watermark]').first().evaluate((el) => {
      const bg = getComputedStyle(el).backgroundImage
      const m = bg.match(/data:image\/svg\+xml;charset=utf-8,(.+)"\)/)
      if (!m) return ''
      const t = new DOMParser().parseFromString(decodeURIComponent(m[1]), 'image/svg+xml').querySelector('text')
      return t ? t.textContent.trim() : ''
    }).catch(() => '')
  const a = await pg(A), w = await pg(WK)
  const pages = [
    ['서명한 서류', `/docs/${DOC_SIGNED}`],
    ['임금명세서', `/print/payslip/${J}/${WK}`],
    ['근무확인서', `/print/cert/${J}/${WK}`],
  ]
  for (const [name, path] of pages) {
    await a.goto(W_ + path); await a.waitForLoadState('networkidle')
    const am = await mark(a)
    ok(`관리자: ${name} 워터마크`, am.includes('관리자 열람') && am.includes('관리자'), am)
    await w.goto(W_ + path); await w.waitForLoadState('networkidle')
    const wm = await mark(w)
    ok(`근무자: ${name} 워터마크`, /^열람 .+ · 근무자 4444$/.test(wm), wm)
  }
  await a.goto(`${W_}/print/payslip/${J}`); await a.waitForLoadState('networkidle')
  ok('임금명세서 한 번에 인쇄도 워터마크', (await mark(a)).includes('관리자 열람'))
  // 인쇄할 때도 그대로
  await w.emulateMedia({ media: 'print' })
  await w.goto(`${W_}/docs/${DOC_SIGNED}`); await w.waitForLoadState('networkidle')
  ok('인쇄 화면에도 워터마크', (await mark(w)).startsWith('열람'))
  // 워터마크가 맨 위에 덮여도 아래 버튼·글자는 그대로 눌림
  ok('워터마크는 눌림을 막지 않음', (await w.locator('[data-watermark]').first().evaluate((el) => getComputedStyle(el).pointerEvents)) === 'none')
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
