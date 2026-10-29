// 화면별 스크린샷 + 넘침·글자 잘림 찾기 (휴대폰 360px·한국어, 컴퓨터 1280px)
// SESSION_SECRET=... node scripts/qa/audit.cjs http://127.0.0.1:3002 <스크린샷 폴더>
// 문제가 있으면 목록을 출력하고 종료 코드 1
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const fs = require('node:fs')
const [base = 'http://127.0.0.1:3002', out = 'shots'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const SECRET = process.env.SESSION_SECRET
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const W = 'bbbbbbbb-0000-4000-8000-000000000002', A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003'
const pages = [
  ['anon', 'home-anon', '/'], ['anon', 'login', '/login'], ['anon', 'signup', '/signup'], ['anon', 'setup', '/setup'],
  ['worker', 'home', '/'], ['worker', 'job', `/jobs/${J}`], ['worker', 'me', '/me'], ['worker', 'profile', '/me/profile'],
  ['worker', 'doc-pending', '/docs/dddddddd-0000-4000-8000-000000000004'], ['worker', 'payslip', `/print/payslip/${J}/${W}`],
  ['worker', 'cert', `/print/cert/${J}/${W}`],
  ['admin', 'a-dash', '/admin'], ['admin', 'a-jobs', '/admin/jobs'], ['admin', 'a-job-apps', `/admin/jobs/${J}?tab=apps`],
  ['admin', 'a-job-att', `/admin/jobs/${J}?tab=att`], ['admin', 'a-job-pay', `/admin/jobs/${J}?tab=pay`],
  ['admin', 'a-job-docs', `/admin/jobs/${J}?tab=docs`], ['admin', 'a-job-edit', `/admin/jobs/${J}/edit`], ['admin', 'a-job-new', '/admin/jobs/new'],
  ['admin', 'a-workers', '/admin/workers'], ['admin', 'a-worker', `/admin/workers/${W}`], ['admin', 'a-docs', '/admin/docs'],
  ['admin', 'a-doc', '/admin/docs/ffffffff-0000-4000-8000-000000000007'], ['admin', 'a-reports', '/admin/reports'], ['admin', 'a-settings', '/admin/settings'],
]
;(async () => {
  const browser = await chromium.launch()
  const report = []
  const MOBILE = { viewport: { width: Number(process.env.VW || 360), height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: process.env.LOCALE || 'ko-KR', userAgent: devices['Galaxy S9+'].userAgent }
  const VPS = process.env.DESKTOP === '0' ? [['m', MOBILE]] : [['m', MOBILE], ['d', { viewport: { width: 1280, height: 900 }, locale: 'ko-KR' }]]
  for (const [vpName, vp] of VPS) {
    for (const who of ['anon', 'worker', 'admin']) {
      const ctx = await browser.newContext({ ...vp })
      if (who !== 'anon') await ctx.addCookies([{ name: 'alba_session', value: cookie(who === 'admin' ? A : W), url: base }])
      const page = await ctx.newPage()
      const errs = []
      page.on('pageerror', (e) => errs.push(e.message))
      for (const [w, name, path] of pages.filter((p) => p[0] === who)) {
        if (vpName === 'd' && !name.startsWith('a-') && name !== 'home') continue
        await page.goto(base + path)
        await page.waitForLoadState('networkidle')
        // 나타나는 애니메이션이 끝난 뒤 위치를 잼
        // (시간에 따라 끝나는 것만, 스크롤에 따라 움직이는 머리글 그림자 등은 제외 · 최대 2초)
        await page.evaluate(() =>
          Promise.race([
            Promise.all(
              document
                .getAnimations()
                .filter((a) => a.timeline instanceof DocumentTimeline && a.effect?.getTiming().iterations !== Infinity)
                .map((a) => a.finished.catch(() => {})),
            ),
            new Promise((r) => setTimeout(r, 2000)),
          ]),
        )
        const issues = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth
          const out = []
          if (document.documentElement.scrollWidth > vw + 1) out.push(`PAGE scrollWidth ${document.documentElement.scrollWidth} > ${vw}`)
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect()
            const st = getComputedStyle(el)
            // 고정 위치·계속 반복되는 애니메이션(깜빡이는 점·떠다니는 그림)은 일부러 상자를 벗어나므로 제외
            if (!r.width || st.position === 'fixed' || st.animationIterationCount === 'infinite') continue
            // 가로 스크롤 영역 안은 의도된 것
            let p = el.parentElement, scroller = false
            while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scroller = true; break } p = p.parentElement }
            if (scroller) continue
            if (r.right > vw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent || el.getAttribute('name') || '').trim().slice(0, 30)}"`)
            // 부모 상자보다 넓게 삐져나온 요소
            const par = el.parentElement
            if (par && par !== document.body) {
              const pr = par.getBoundingClientRect()
              if (r.right > pr.right + 1 && pr.width > 0) out.push(`SPILL ${el.tagName.toLowerCase()}[${el.getAttribute('name') || String(el.className).slice(0, 30)}] right ${Math.round(r.right)} > parent ${Math.round(pr.right)} "${(el.textContent || '').trim().slice(0, 20)}"`)
            }
            // 글자가 잘리는 select
            if (el.tagName === 'SELECT' && el.selectedOptions[0]) {
              const cs = getComputedStyle(el)
              const c = document.createElement('canvas').getContext('2d')
              c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
              const need = c.measureText(el.selectedOptions[0].text).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 18
              if (need > el.clientWidth + 1) out.push(`SELECT text cut: [${el.name}] "${el.selectedOptions[0].text}" needs ${Math.round(need)} > ${el.clientWidth}`)
            }
            // 글자가 잘리는 입력칸 (값이 칸보다 김)
            if (el.tagName === 'INPUT' && el.scrollWidth > el.clientWidth + 1 && !['checkbox', 'radio', 'file', 'hidden'].includes(el.type)) out.push(`INPUT text cut: [${el.name || el.type}] ${el.scrollWidth} > ${el.clientWidth}`)
          }
          return [...new Set(out)].slice(0, 15)
        })
        await page.screenshot({ path: `${out}/${vpName}-${name}.png`, fullPage: true })
        report.push({ shot: `${vpName}-${name}`, issues, errs: [...errs] })
        errs.length = 0
      }
      await ctx.close()
    }
  }
  await browser.close()
  for (const r of report) if (r.issues.length || r.errs.length) console.log(r.shot, JSON.stringify(r.issues), r.errs.length ? 'ERR ' + r.errs.join('|') : '')
  console.log('checked', report.length, 'screens')
  process.exitCode = report.some((r) => r.issues.length || r.errs.length) ? 1 : 0
})()
