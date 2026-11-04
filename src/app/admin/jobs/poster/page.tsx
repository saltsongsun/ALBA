import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { CopyButton, PrintButton } from '@/components/ui'
import { db } from '@/lib/db'
import { requireAdmin, siteOrigin } from '@/lib/session'
import { kstDate } from '@/lib/time'

export const metadata: Metadata = { title: '모집 QR' }

/**
 * 우리 회사 공고 모음 QR (현장·게시판에 붙이는 모집 안내).
 * 휴대폰으로 찍으면 이 회사 공고만 모인 화면(/?co=회사)으로 — 회사마다 자기 링크
 */
export default async function PosterPage() {
  const admin = await requireAdmin()
  const url = `${await siteOrigin()}/?co=${admin.companyId}`
  const [svg, open] = await Promise.all([
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#191f28', light: '#ffffff' } }),
    // 지금 모집 중인 공고 수 (0이면 안내)
    db()
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', admin.companyId)
      .eq('audience', 'worker')
      .eq('status', 'open')
      .gte('end_date', kstDate())
      .then((r) => r.count ?? 0),
  ])
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href="/admin/jobs" className="no-print text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 공고 목록
      </Link>
      <section className="card space-y-4 text-center" data-poster>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-brand-600">함께 일할 분을 찾아요</p>
          <h1 className="text-2xl font-extrabold text-balance">{admin.companyName} 모집 공고</h1>
          <p className="text-sm text-sub">휴대폰 카메라로 찍으면 지금 모집 중인 공고를 보고 바로 지원할 수 있어요</p>
        </div>
        <div className="mx-auto w-full max-w-64 rounded-2xl bg-white p-3 ring-1 ring-line [&_svg]:h-auto [&_svg]:w-full" data-poster-qr dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-xs break-all text-mute">{url}</p>
      </section>
      {open === 0 && (
        <p className="no-print rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200/70" data-poster-empty>
          지금 모집 중인 공고가 없어요. 찍으면 &lsquo;모집 중인 공고가 없어요&rsquo;로 보여요.{' '}
          <Link href="/admin/jobs/new" className="font-bold whitespace-nowrap underline underline-offset-2">
            새 공고 등록 →
          </Link>
        </p>
      )}
      <div className="no-print flex flex-wrap justify-center gap-2">
        <CopyButton text={url} label="링크 복사" />
        <PrintButton label="QR 인쇄" />
      </div>
      <p className="no-print text-center text-xs text-mute">새 공고를 올려도 같은 QR이에요 · 한 번 붙여 두면 계속 써요</p>
    </div>
  )
}
