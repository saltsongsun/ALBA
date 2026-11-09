// 묶음 108 (정기 개선 2026-11-07 02:36)
// · 운영 센터 '확인 기다리는 회사': 사업자번호·대표·가입 시점 + [확인] (두 번 눌러야) → 운영 센터로 돌아와 '회사를 확인했어요' · 목록에서 빠짐 · 할 일 링크는 이 칸으로
// · 내 근무: 지금 할 일(서명할 서류)이 병아리 레벨 카드보다 위 · '위의 서류 n건에 서명하면…' 두 줄이 고르게 (마지막 줄에 한두 낱말만 남지 않게) · 360px
// node scripts/qa/batch108.cjs <default 앱> <default 가짜> <shots>
const { chromium, devices } = require('playwright')
const fs = require('node:fs')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, SHOTS] = process.argv.slice(2)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true })
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', C = '99999999-0000-4000-8000-000000000099'
const N1 = '99999999-0000-4000-8000-0000000000d1', N2 = '99999999-0000-4000-8000-0000000000d2'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())

;(async () => {
  // 준비: 직접 가입해 확인을 기다리는 회사 2곳
  const [c1] = await rest(`companies?id=eq.${C}`)
  const hourAgo = new Date(Date.now() - 3600e3).toISOString()
  await rest('companies', 'POST', { ...c1, id: N1, company_name: '새봄이벤트', ceo_name: '김새봄', business_no: '220-81-12345', seal_image: null, verified: false, created_at: hourAgo })
  await rest('companies', 'POST', { ...c1, id: N2, company_name: '가을무대', ceo_name: '박가을', business_no: '110-22-33333', seal_image: null, verified: false, created_at: hourAgo })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, scheme = 'light') => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', colorScheme: scheme })
    await ctx.addInitScript((sc) => {
      try {
        if (sc === 'dark') localStorage.setItem('theme', 'dark')
        localStorage.setItem('push-nudge-later', String(Date.now()))
        localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5))
        sessionStorage.setItem('photo-prompt-later', '1')
      } catch {}
    }, scheme)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const wide = (p) => p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)

  // ── 1. 운영 센터에서 바로 회사 확인 ──
  const ap = await pg(A)
  await ap.goto(`${D}/ops`)
  const box = ap.locator('[data-ops-waiting]')
  await box.waitFor({ timeout: 10000 }).catch(() => {})
  const rows = box.locator('[data-ops-waiting-row]')
  ok('확인 기다리는 회사 2곳', (await rows.count()) === 2)
  const r1 = rows.filter({ hasText: '새봄이벤트' })
  const r1t = await r1.innerText().catch(() => '')
  ok("줄: '새봄이벤트' · '220-81-12345 · 대표 김새봄 · 1시간 전 가입'", r1t.includes('220-81-12345 · 대표 김새봄 · 1시간 전 가입'), r1t.replace(/\n/g, ' | '))
  ok("할 일 '확인 기다리는 회사 2곳' → 이 칸으로", (await ap.locator('[data-ops-todo] a', { hasText: '확인 기다리는 회사 2곳' }).getAttribute('href')) === '#ops-waiting')
  ok('360px: 옆으로 안 밀림 · 버튼 한 줄', (await wide(ap)) && (await r1.locator('button').evaluate((el) => el.getBoundingClientRect().height < 40)))
  if (SHOTS) await box.screenshot({ path: `${SHOTS}/ops-waiting.png` })
  await r1.getByRole('button', { name: '확인' }).click()
  ok("첫 누름은 '한 번 더 누르면 확인' (아직 안 바뀜)", (await r1.locator('button').innerText()) === '한 번 더 누르면 확인' && (await rest(`companies?id=eq.${N1}`))[0].verified === false)
  ok('누른 상태도 360px 안에', await wide(ap))
  await r1.locator('button').click()
  const said = await ap.getByText('회사를 확인했어요').first().waitFor({ timeout: 10000 }).then(() => true, () => false)
  ok('운영 센터로 돌아옴', new URL(ap.url()).pathname === '/ops', ap.url())
  ok("'회사를 확인했어요' 안내", said)
  await ap.waitForTimeout(500)
  ok('회사가 확인됨 · 기록 company.verify', (await rest(`companies?id=eq.${N1}`))[0].verified === true && (await rest('audit_logs')).some((x) => x.action === 'company.verify' && x.company_id === N1))
  ok('목록에서 빠지고 1곳 남음', (await ap.locator('[data-ops-waiting-row]').count()) === 1 && (await ap.locator('[data-ops-waiting-row]').innerText()).includes('가을무대'))
  // 회사 관리 화면의 확인은 그대로 회사 관리로 돌아감
  await ap.goto(`${D}/admin/companies`)
  // 첫 누름에 버튼 글자가 바뀌므로 같은 버튼을 붙잡아 두고 두 번 누름
  const btn = await ap.locator('form', { hasText: '확인 완료' }).first().locator('button').elementHandle()
  await btn.click()
  await ap.waitForTimeout(300)
  await btn.click()
  await ap.getByText('회사를 확인했어요').first().waitFor({ timeout: 10000 }).catch(() => {})
  ok('회사 관리에서 확인하면 회사 관리로 돌아감', new URL(ap.url()).pathname === '/admin/companies' && (await rest(`companies?id=eq.${N2}`))[0].verified === true, ap.url())
  await ap.goto(`${D}/ops`)
  await ap.locator('[data-ops]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('다 확인하면 칸이 사라짐', (await ap.locator('[data-ops-waiting]').count()) === 0)

  // ── 2. 내 근무: 할 일이 레벨 카드보다 먼저 ──
  const wk = await pg(W)
  // 출근 전 상태로 (근무 중이면 '근무 종료'가 먼저 나오고 서명 안내는 짧은 한 줄 — batch154)
  await rest(`attendance?user_id=eq.${W}`, 'DELETE')
  await wk.goto(`${D}/me`)
  const sign = wk.locator('section', { hasText: '서명할 서류가' }).first()
  await sign.waitFor({ timeout: 10000 }).catch(() => {})
  const yOf = (l) => l.evaluate((el) => el.getBoundingClientRect().top + scrollY)
  ok('서명할 서류 카드가 병아리 레벨 카드보다 위', (await yOf(sign)) < (await yOf(wk.locator('[data-xp-card]'))))
  // 안내 글자 칸 (2026-11-09부터 안내 전체가 서명 화면으로 가는 링크 · 글자는 그 안의 첫 칸)
  const note = wk.locator('[data-sign-before-start] > span').first()
  const lines = await note.evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    const tops = [...new Set([...r.getClientRects()].map((x) => Math.round(x.top)))]
    // 줄마다 글자 폭 (마지막 줄이 너무 짧지 않게)
    const widths = tops.map((t) => [...r.getClientRects()].filter((x) => Math.round(x.top) === t).reduce((s, x) => s + x.width, 0))
    return { n: tops.length, widths, balance: getComputedStyle(el).textWrap }
  }).catch(() => null)
  ok("'위의 서류…' 줄을 고르게 (text-wrap: balance · 마지막 줄이 첫 줄의 절반 이상)", !!lines && lines.balance.includes('balance') && (lines.n === 1 || lines.widths[lines.widths.length - 1] >= lines.widths[0] * 0.5), JSON.stringify(lines))
  ok('360px: 내 근무 옆으로 안 밀림', await wide(wk))
  if (SHOTS) await wk.screenshot({ path: `${SHOTS}/me-top.png` })

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
