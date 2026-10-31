// 실수 막기 확인 테스트: 모집 인원 초과 확정 · 정리 안 된 채 지급 완료 · 계좌 없는데 지급 완료
// node scripts/qa/guards.cjs <default 앱> <default 가짜 Supabase> <working 앱> <working 가짜 Supabase>
const { chromium, devices } = require('playwright')
const { createHmac } = require('node:crypto')
const SECRET = '0123456789abcdef0123456789abcdef0123'
const cookie = (u) => { const p = Buffer.from(JSON.stringify({ u, v: 1, e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'); return `${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}` }
const [D, MD, W_, MW] = process.argv.slice(2)
const A = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'cccccccc-0000-4000-8000-000000000003', AP = '11111111-0000-4000-8000-000000000012'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const send = (m, path, method, body) => fetch(`${m}/rest/v1/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) }).then((r) => r.json())
const errs = []
;(async () => {
  const b = await chromium.launch()
  const pg = async (base) => {
    const ctx = await b.newContext({ ...devices['Galaxy S9+'], locale: 'ko-KR' })
    await ctx.addCookies([{ name: 'alba_session', value: cookie(A), url: base }])
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message.slice(0, 120))); return p
  }
  // 모집 1명인데 이미 1명 확정 → 대기자 확정은 한 번 더 물어봄
  await send(MD, `jobs?id=eq.${J}`, 'PATCH', { headcount: 1 })
  const a = await pg(D)
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await a.getByRole('button', { name: '대기 1명 모두 확정' }).click()
  ok('모두 확정: 인원 넘으면 한 번 더 물어봄', await a.getByRole('button', { name: /모집 1명 → 2명 돼요/ }).isVisible().catch(() => false))
  ok('첫 번째 누름으로는 확정 안 됨', (await send(MD, `applications?id=eq.${AP}`, 'GET'))[0].status === 'applied')
  await a.goto(`${D}/admin/jobs/${J}?tab=apps`)
  await a.getByRole('button', { name: '확정', exact: true }).first().click()
  const confirm = a.getByRole('button', { name: '인원 다 찼어요 · 확정?' })
  ok('하나씩 확정도 한 번 더 물어봄', await confirm.isVisible().catch(() => false))
  await confirm.click()
  await a.waitForTimeout(1500)
  ok('두 번째 누름에 확정', (await send(MD, `applications?id=eq.${AP}`, 'GET'))[0].status === 'approved')
  // 인원 여유가 있으면 바로 확정 (대시보드)
  await send(MD, `jobs?id=eq.${J}`, 'PATCH', { headcount: 5 })
  // 지급 완료: 계좌 없는 근무자 → 한 번 더
  await send(MW, `attendance?job_id=eq.${J}`, 'PATCH', { clock_in: new Date(Date.now() - 3 * 3600e3).toISOString(), clock_out: new Date().toISOString() })
  const w = await pg(W_)
  await w.goto(`${W_}/admin/jobs/${J}?tab=pay`)
  await w.getByRole('button', { name: /미지급 1명 모두 지급 완료/ }).click()
  ok('모두 지급 완료: 계좌 없으면 알려 주고 한 번 더', await w.getByRole('button', { name: /정리 안 된 근무·계좌가 있어요/ }).isVisible().catch(() => false))
  await w.goto(`${W_}/admin/jobs/${J}?tab=pay`)
  await w.getByRole('button', { name: '미지급', exact: true }).click()
  ok('한 사람 지급 완료: 계좌 없으면 한 번 더', await w.getByRole('button', { name: '계좌 없음 · 지급완료?' }).isVisible().catch(() => false))
  const att = (await send(MW, `attendance?job_id=eq.${J}`, 'GET'))[0]
  ok('첫 번째 누름으로는 지급 처리 안 됨', att.paid === false)
  ok('자바스크립트 오류 없음', errs.length === 0, errs.join(' | '))
  await b.close()
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
