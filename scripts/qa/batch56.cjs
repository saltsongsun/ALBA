// 묶음 56: 카카오톡 공유 미리보기 그림 — 공고 링크·회사 공고 모음 링크·그 밖의 링크에 og:image (1200×630 PNG)
//          · 카카오톡 미리보기 로봇(kakaotalk-scrap)은 막지 않음 · 공고: 제목·설명 그대로 · 회사 링크: '회사 이름 모집 공고' + 모집 수
//          · 없는 공고·없는 회사도 기본 그림 (오류 없이)
// node scripts/qa/batch56.cjs <default 앱> <default 가짜>
const [D] = process.argv.slice(2)
const J = 'cccccccc-0000-4000-8000-000000000003', CO = '99999999-0000-4000-8000-000000000099'
const UA = 'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984'
let fails = 0
const ok = (l, c, x = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`) }
const html = (path) => fetch(`${D}${path}`, { headers: { 'user-agent': UA } }).then(async (r) => ({ status: r.status, text: await r.text() }))
const meta = (text, prop) => (text.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`)) ?? [])[1] ?? null
const png = async (url) => {
  const r = await fetch(url.startsWith('http') ? `${D}${new URL(url).pathname}${new URL(url).search}` : `${D}${url}`, { headers: { 'user-agent': UA } })
  const b = Buffer.from(await r.arrayBuffer())
  return { status: r.status, type: r.headers.get('content-type'), size: b.length, w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

;(async () => {
  // ── 1. 공고 링크 ──
  const job = await html(`/jobs/${J}`)
  ok('카카오톡 미리보기 로봇도 공고를 읽음 (막지 않음)', job.status === 200)
  const img = meta(job.text, 'og:image')
  ok('공고: og:image (공고마다 그림) + 크기 1200×630', !!img && img.includes(`/jobs/${J}/opengraph-image`) && meta(job.text, 'og:image:width') === '1200' && meta(job.text, 'og:image:height') === '630', img)
  ok('공고: og:title·og:description 그대로', meta(job.text, 'og:title') === '경상남도 생활체육대축전 행사장 안내 스태프' && (meta(job.text, 'og:description') ?? '').includes('시급 10,320원'))
  const p1 = img ? await png(img) : {}
  ok('공고 그림: PNG 1200×630', p1.status === 200 && p1.type === 'image/png' && p1.w === 1200 && p1.h === 630 && p1.size > 20000, JSON.stringify(p1))

  // ── 2. 회사 공고 모음 링크 ──
  const co = await html(`/?co=${CO}`)
  const cimg = meta(co.text, 'og:image')
  ok("회사 링크: '주식회사 테스트 모집 공고' + 모집 수", meta(co.text, 'og:title') === '주식회사 테스트 모집 공고' && /모집 중 \d+개/.test(meta(co.text, 'og:description') ?? ''), `${meta(co.text, 'og:title')} / ${meta(co.text, 'og:description')}`)
  ok('회사 링크: 회사 그림 주소', !!cimg && cimg.includes(`/og/company/${CO}`), cimg)
  const p2 = cimg ? await png(cimg) : {}
  ok('회사 그림: PNG 1200×630', p2.status === 200 && p2.type === 'image/png' && p2.w === 1200 && p2.h === 630, JSON.stringify(p2))

  // ── 3. 그 밖의 링크 · 없는 것 ──
  const home = await html('/')
  const dimg = meta(home.text, 'og:image')
  ok('첫 화면: 기본 그림', !!dimg && dimg.includes('/opengraph-image') && meta(home.text, 'og:site_name') === '해피워크', dimg)
  const p3 = dimg ? await png(dimg) : {}
  ok('기본 그림: PNG 1200×630', p3.status === 200 && p3.w === 1200 && p3.h === 630)
  const p4 = await png('/og/company/00000000-0000-4000-8000-000000000000')
  ok('없는 회사: 오류 없이 기본 그림', p4.status === 200 && p4.type === 'image/png')
  const p5 = await png('/jobs/00000000-0000-4000-8000-000000000000/opengraph-image')
  ok('없는 공고: 오류 없이 기본 그림 (또는 없음)', [200, 404].includes(p5.status))

  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
