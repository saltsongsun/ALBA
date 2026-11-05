// 묶음 69: '서류' 메뉴 — 서명 받은 서류 모아 보기 + PDF로 내려받기 (인쇄용)
// · 관리자 '서류' 메뉴 기본 화면 = 서명 받은 서류 (공고별로 묶음 · 상태 칩 · 이름/공고 찾기) · '서식' 탭은 예전 서식 목록
// · 서류 하나 PDF · 보이는 서류 전체를 한 PDF (서류마다 새 쪽) · 공고 화면 '서명 완료 N건 PDF' · 서류 화면 'PDF 받기'(관리자만)
// · PDF 안 글자(한글)가 그대로 들어감 · 서명 전 서류는 '서명 전' 표시 · 내려받으면 기록 남김
// · 근무자·다른 회사 관리자는 못 받음
// node scripts/qa/batch69.cjs <default 앱> <default 가짜>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', W = 'bbbbbbbb-0000-4000-8000-000000000002', J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const C2 = '99999999-0000-4000-8000-000000000098', A2 = 'aaaaaaaa-0000-4000-8000-0000000000f9'
const DOC = 'dddddddd-0000-4000-8000-000000000004', DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const rest = (p, method = 'GET', body) => fetch(`${MD}/rest/v1/${p}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b69-'))
const pdfText = (buf) => {
  const f = path.join(tmp, `d${Math.random().toString(36).slice(2)}.pdf`)
  fs.writeFileSync(f, buf)
  const text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' })
  const pages = Number((execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/) || [])[1] || 0)
  return { text: text.replace(/[ \t]+/g, ' '), pages }
}

;(async () => {
  // 준비: 다른 회사 관리자 A2
  const [c1] = await rest(`companies?id=eq.${CO}`)
  await rest('companies', 'POST', { ...c1, id: C2, company_name: '두번째컴퍼니', seal_image: null, created_at: '2026-10-15T00:00:00Z' })
  const [a1] = await rest(`users?id=eq.${A}`)
  await rest('users', 'POST', { ...a1, id: A2, name: '남의관리자', phone: '01022223399', is_super: false })
  await rest('company_members', 'POST', { company_id: C2, user_id: A2, role: 'owner' })

  const b = await chromium.launch()
  const errs = []
  const pg = async (uid) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, locale: 'ko-KR' })
    await ctx.addInitScript(() => { try { sessionStorage.setItem('photo-prompt-later', '1'); localStorage.setItem('push-nudge-later', String(Date.now())); localStorage.setItem('alba_install_hide_until', String(Date.now() + 864e5)) } catch {} })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(uid), url: D }])
    const p = await ctx.newPage()
    p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)))
    return p
  }
  const ad = await pg(A)

  // ── 1. '서류' 메뉴: 서명 받은 서류가 기본 ──
  await ad.goto(`${D}/admin/docs`)
  await ad.locator('[data-docs-tabs]').waitFor({ timeout: 10000 }).catch(() => {})
  ok("'서류' 화면: 탭 '서명 받은 서류 | 서식' · 기본은 서명 받은 서류", (await ad.locator('[data-docs-tabs] a[aria-current=page]').innerText()) === '서명 받은 서류')
  const rows = () => ad.locator('[data-doc-row]')
  ok('서류 2건 (서명 완료 1 · 서명 대기 1), 공고별로 묶음', (await rows().count()) === 2 && (await ad.locator(`[data-docs-job="${J}"]`).count()) === 1)
  const chips = (await ad.locator('[data-docs-status] a').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())
  ok('상태 칩: 전체 2 · 서명 완료 1 · 서명 대기 1', ['전체 2', '서명 완료 1', '서명 대기 1'].every((c) => chips.includes(c)), chips.join(','))
  ok('360px: 옆으로 안 밀림', await ad.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1))

  // 거르기
  await ad.goto(`${D}/admin/docs?status=signed`)
  ok('서명 완료만: 1건 (서약서)', (await rows().count()) === 1 && (await rows().first().innerText()).includes('서약서'))
  await ad.goto(`${D}/admin/docs?q=${encodeURIComponent('없는이름쿵')}`)
  ok("찾는 게 없으면 '맞는 서류가 없어요'", (await ad.getByText('맞는 서류가 없어요').count()) === 1)
  await ad.goto(`${D}/admin/docs?q=3333-4444`)
  ok('전화번호로 찾기 (근무자 010-3333-4444)', (await rows().count()) === 2)

  // 서식 탭
  await ad.goto(`${D}/admin/docs?tab=tpl`)
  ok("'서식' 탭: 예전 서식 목록 + 새 서식 버튼", (await ad.locator('a[href^="/admin/docs/"]:not([href="/admin/docs/new"]):not([href*="pdf"])').count()) >= 1 && (await ad.getByRole('link', { name: '+ 새 서식' }).count()) === 1)

  // ── 2. PDF 하나 ──
  const one = await ad.request.get(`${D}/admin/docs/pdf?id=${DOC_SIGNED}`)
  const disp = decodeURIComponent(one.headers()['content-disposition'] || '')
  ok('서류 하나 PDF: application/pdf · 파일 이름 서약서_근무자_….pdf', one.status() === 200 && one.headers()['content-type'] === 'application/pdf' && /filename\*=UTF-8''서약서_근무자_\d{4}-\d{2}-\d{2}\.pdf/.test(disp), `${one.status()} ${disp}`)
  const t1 = pdfText(await one.body())
  ok('PDF 안 한글: 제목·이름·전자서명 기록', t1.text.includes('서약서') && t1.text.includes('근무자') && t1.text.includes('전자서명 일시') && t1.text.includes('(근로자)'), t1.text.slice(0, 200).replace(/\n/g, ' | '))

  // ── 3. 보이는 서류 전체를 한 PDF ──
  await ad.goto(`${D}/admin/docs`)
  const bulkHref = await ad.locator('[data-docs-bulk-pdf]').getAttribute('href')
  const all = await ad.request.get(`${D}${bulkHref}`)
  const t2 = pdfText(await all.body())
  ok('전체 PDF: 2건이 각각 새 쪽 (2쪽 이상) · 서명 전 서류는 표시', all.status() === 200 && t2.pages >= 2 && t2.text.includes('서약서') && t2.text.includes('근로계약서') && t2.text.includes('서명 전'), `pages=${t2.pages}`)
  const allDisp = decodeURIComponent(all.headers()['content-disposition'] || '')
  ok("전체 PDF 이름: 서류_모음_2건_….pdf", /서류_모음_2건_\d{4}-\d{2}-\d{2}\.pdf/.test(allDisp), allDisp)

  // ── 4. 공고 화면 · 서류 화면의 PDF 버튼 ──
  await ad.goto(`${D}/admin/jobs/${J}?tab=docs`)
  ok("공고 서류 탭: '서명 완료 1건 PDF'", (await ad.locator('[data-job-docs-pdf]').innerText().catch(() => '')).includes('서명 완료 1건 PDF') && (await ad.locator('[data-job-docs-pdf]').getAttribute('href')) === `/admin/docs/pdf?job=${J}&status=signed`)
  await ad.goto(`${D}/docs/${DOC_SIGNED}`)
  ok("서류 화면(관리자): 'PDF 받기'", (await ad.locator('[data-doc-pdf]').count()) === 1)

  // ── 5. 막기: 근무자 · 다른 회사 관리자 ──
  const wk = await pg(W)
  await wk.goto(`${D}/docs/${DOC_SIGNED}`)
  ok("서류 화면(근무자): 'PDF 받기' 없음", (await wk.locator('[data-doc-pdf]').count()) === 0)
  const wr = await wk.request.get(`${D}/admin/docs/pdf?id=${DOC_SIGNED}`, { maxRedirects: 0 })
  ok('근무자: PDF 주소를 직접 열어도 못 받음', wr.status() !== 200 || !(wr.headers()['content-type'] || '').includes('pdf'), String(wr.status()))
  const other = await pg(A2)
  const or = await other.request.get(`${D}/admin/docs/pdf?id=${DOC_SIGNED}`, { maxRedirects: 0 })
  ok('다른 회사 관리자: 이 회사 서류는 못 받음', or.status() !== 200 || !(or.headers()['content-type'] || '').includes('pdf'), String(or.status()))
  const oa = await other.request.get(`${D}/admin/docs/pdf`, { maxRedirects: 0 })
  ok('다른 회사 관리자: 전체 받기에도 이 회사 서류 없음', oa.status() === 404, String(oa.status()))

  // ── 6. 내려받기 기록 ──
  const logs = (await rest('audit_logs')).filter((l) => l.action === 'doc.pdf' && l.company_id === CO)
  ok('내려받기 기록 (doc.pdf) 남김', logs.length >= 2, String(logs.length))

  // ── 7. 메뉴 이름 '서류' ──
  ok("관리자 메뉴 이름 '서류'", (await ad.locator('a[href="/admin/docs"]', { hasText: /^서류$/ }).count()) >= 1)

  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
