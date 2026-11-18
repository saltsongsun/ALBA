import { timingSafeEqual } from 'node:crypto'
import { sheetsConfigured } from '@/lib/gsheets'
import { ledgerCompanyId, runLedgerSync } from '@/lib/ledger'
import { kstTime } from '@/lib/time'

export const maxDuration = 60

/**
 * 대금 시트(거래장부) 아침 연동 (Vercel Cron: 매일 07시 KST) — 장부에서 입금확인한 사람은 지급 완료로, 어제까지 끝난 공고는 장부 맨 아래에 새 줄로.
 * CRON_SECRET을 정해 두면 그 값으로만 부를 수 있음 · 정하지 않았으면 Vercel Cron 요청처럼 보이고 아침(6~10시)일 때만
 * (같은 공고·사람은 한 번만 올리므로 여러 번 불려도 줄이 겹치지 않음)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const got = Buffer.from(req.headers.get('authorization') ?? '')
    const want = Buffer.from(`Bearer ${secret}`)
    if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response('unauthorized', { status: 401 })
  } else {
    if (!(req.headers.get('user-agent') ?? '').startsWith('vercel-cron/')) return new Response('forbidden', { status: 403 })
    const h = Number(kstTime(new Date()).slice(0, 2))
    if (h < 6 || h >= 10) return Response.json({ skipped: '아침 6~10시에만 맞춥니다.' })
  }
  if (!sheetsConfigured()) return Response.json({ skipped: '대금 시트가 연결되지 않았어요.' })
  const companyId = await ledgerCompanyId()
  if (!companyId) return Response.json({ skipped: '회사가 없어요.' })
  const r = await runLedgerSync(companyId, null, 'cron')
  return Response.json({ ok: r.ok, text: r.text }, { status: r.ok ? 200 : 500 })
}
