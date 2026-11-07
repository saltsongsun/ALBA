// 묶음 91: 병아리 레벨 카드 1단계 ("경험치를 모아서 캐릭터를 키우는 게임") + 진짜 '앱 설치' 버튼 ("설치 안내 말고 실제 설치까지 되게")
// · 내 근무 맨 위 'Lv.n'(배지) '새내기 병아리' + 점수 + '근무 n번 더 하면 Lv.n' · 점수 얻는 법 6가지 · 레벨이 오르면 '🎉 레벨 업!' (한 번만)
// · 점수는 기록으로 계산: 근무 마침 10 · 정시 출근 5 · 근무 종료 직접 5 · 서명 3 · 후기 5 · 내 정보 다 채움 20
// · 앱 설치: 휴대폰이 설치를 지원하면 버튼 한 번에 설치 창 → '✓ 설치했어요' · 지원 안 하면 안내창 · 카카오톡은 '브라우저로' · 아이폰은 홈 화면에 추가 안내
// node scripts/qa/batch91.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const kst = (ms = 0) => new Date(Date.now() + 9 * 3600e3 + ms).toISOString().slice(0, 10)

;(async () => {
  const b = await chromium.launch()
  const errs = []
  const pg = async (uid, opts = {}, hideInstall = true) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR', ...opts })
    await ctx.addInitScript((hide) => {
      try {
        sessionStorage.setItem('photo-prompt-later', '1')
        sessionStorage.setItem('clockout-prompt-later', String(Date.now()))
        localStorage.setItem('push-nudge-later', String(Date.now()))
        if (hide) localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5))
      } catch {}
    }, hideInstall)
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }

  // ── 1. 레벨 카드 ──
  const w = await pg(W)
  await w.goto(`${D}/me`)
  const card = w.locator('[data-xp-card]')
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  const t1 = await card.innerText().catch(() => '')
  // 기본 가짜 근무자: 끝난 근무 0 · 서명 1건(3점)
  // (디자인 다듬기 2026-11-07: 레벨은 작은 배지 'Lv.1' · 이름 '새내기 병아리' · 한 줄 안내 '근무 2번 더 하면 Lv.2')
  ok("내 근무 맨 위 'Lv.1 · 새내기 병아리 · 3점 · 근무 2번 더 하면 Lv.2'", (await card.locator('[data-xp-level]').innerText()) === 'Lv.1' && t1.includes('새내기 병아리') && t1.includes('3점') && (await card.locator('[data-xp-next]').innerText()).includes('근무 2번 더 하면 Lv.2'), t1.replace(/\n/g, ' / '))
  ok('병아리는 둥근 바탕 안에 (스티커 글씨는 잘림)', await card.locator('img').first().evaluate((el) => { const p = el.parentElement; const cs = getComputedStyle(p); return cs.overflow === 'hidden' && cs.borderRadius !== '0px' && el.getBoundingClientRect().width > p.getBoundingClientRect().width }))
  ok('제목 줄·안내 줄 각 한 줄', (await card.locator('[data-xp-level]').evaluate((el) => el.parentElement.getBoundingClientRect().height < 26)) && (await card.locator('[data-xp-next]').evaluate((el) => el.getBoundingClientRect().height < 20)))
  await card.locator('[data-xp-rules] summary').click()
  await w.waitForTimeout(400)
  ok('점수 얻는 법 6가지', (await card.locator('[data-xp-rules] li').count()) === 6)
  ok('카드 제목 한 줄 · 360px 옆으로 안 밀림', (await card.locator('b').first().evaluate((el) => el.getClientRects().length === 1)) && (await w.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1)))
  ok('처음 볼 때는 레벨 업 표시 없음', (await w.locator('[data-level-up]').count()) === 0)

  // 지난 근무 2번 (정시 출근 · 직접 종료) → +40점 → Lv.2
  const [wAtt] = await rest(`attendance?job_id=eq.${J}&user_id=eq.${W}`)
  for (const days of [3, 2]) {
    const d = kst(-days * 86_400_000)
    await rest('attendance', 'POST', { ...wAtt, id: undefined, work_date: d, clock_in: new Date(`${d}T08:55:00+09:00`).toISOString(), clock_out: new Date(`${d}T18:00:00+09:00`).toISOString(), note: null })
  }
  await w.reload()
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  const t2 = await card.innerText().catch(() => '')
  ok('근무 2번(정시·직접 종료) 더하면 43점 · Lv.2', t2.includes('Lv.2') && t2.includes('43점'), t2.replace(/\n/g, ' / '))
  ok("레벨이 오른 뒤 처음 열면 '🎉 레벨 업! Lv.2'", (await w.locator('[data-level-up]').innerText().catch(() => '')).includes('레벨 업! Lv.2'))
  await w.reload()
  await card.waitFor({ timeout: 10000 }).catch(() => {})
  await w.waitForTimeout(500)
  ok('레벨 업 표시는 한 번만', (await w.locator('[data-level-up]').count()) === 0)

  // ── 2. 앱 설치: 휴대폰이 바로 설치를 지원 → 한 번에 설치 창 ──
  const i = await pg(W, {}, false)
  await i.goto(`${D}/me`)
  const banner = i.locator('[data-install-banner]')
  await banner.waitFor({ timeout: 10000 }).catch(() => {})
  await i.evaluate(() => {
    const ev = new Event('beforeinstallprompt', { cancelable: true })
    ev.prompt = async () => { window.__prompted = (window.__prompted || 0) + 1 }
    ev.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(ev)
  })
  const btn = banner.getByRole('button', { name: '앱 설치' })
  await i.waitForTimeout(300)
  ok("설치 가능 신호를 받으면 '앱 설치'가 바로 설치 버튼", (await btn.getAttribute('data-install-button')) === 'native')
  await btn.click()
  await i.locator('[data-install-done]').waitFor({ timeout: 5000 }).catch(() => {})
  ok("누르면 휴대폰 설치 창 → '✓ 설치했어요'", (await i.evaluate(() => window.__prompted)) === 1 && (await i.locator('[data-install-done]').count()) === 1)
  ok('설치 버튼 줄 360px: 옆으로 안 밀림', await i.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // 설치 신호가 없으면 → 안내창
  const n = await pg(W, {}, false)
  await n.goto(`${D}/me`)
  await n.locator('[data-install-banner]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("설치 권유 글 '앱으로 설치하면 더 빨라요' 한 줄 (360px)", await n.locator('[data-install-banner] p').evaluate((el) => el.textContent === '앱으로 설치하면 더 빨라요' && el.scrollWidth <= el.clientWidth + 1).catch(() => false))
  await n.locator('[data-install-banner]').getByRole('button', { name: '앱 설치' }).click()
  ok('설치 신호가 없으면 설치 안내창', await n.getByRole('dialog', { name: '앱 설치 안내' }).isVisible().catch(() => false))

  // 아이폰: 홈 화면에 추가 안내
  const ios = await pg(W, { ...devices['iPhone 13'], viewport: { width: 360, height: 740 } }, false)
  await ios.goto(`${D}/me`)
  await ios.locator('[data-install-banner]').waitFor({ timeout: 10000 }).catch(() => {})
  await ios.locator('[data-install-banner]').getByRole('button', { name: '앱 설치' }).click()
  ok("아이폰: '홈 화면에 추가' 순서 안내", (await ios.getByRole('dialog', { name: '앱 설치 안내' }).innerText().catch(() => '')).includes('홈 화면에 추가'))

  // 카카오톡 안: 기본 브라우저로 열기
  const kk = await pg(W, { userAgent: devices['Galaxy S9+'].userAgent + ' KAKAOTALK 10.0.0' }, false)
  await kk.goto(`${D}/me`)
  const kb = kk.locator('[data-install-banner]')
  await kb.waitFor({ timeout: 10000 }).catch(() => {})
  ok("카카오톡 안: '브라우저로 열면 설치돼요' + '브라우저로'", (await kb.innerText().catch(() => '')).includes('브라우저로 열면 설치돼요') && (await kb.getByRole('button', { name: '브라우저로' }).count()) === 1)

  // 관리자 첫 화면에도
  const a = await pg(A, {}, false)
  await a.goto(`${D}/admin`)
  await a.locator('[data-install-banner]').waitFor({ timeout: 10000 }).catch(() => {})
  ok('관리자 첫 화면에도 앱 설치 버튼', (await a.locator('[data-install-banner]').count()) === 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
