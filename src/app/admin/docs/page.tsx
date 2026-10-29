import type { Metadata } from 'next'
import Link from 'next/link'
import { restoreDefaultTemplates } from '@/app/actions/admin'
import Flash from '@/components/Flash'
import { SubmitButton } from '@/components/ui'
import { db, must } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { fmtDate, kstDate } from '@/lib/time'
import type { DocTemplate } from '@/lib/types'

export const metadata: Metadata = { title: '서류 서식' }

const KIND: Record<DocTemplate['kind'], string> = { contract: '근로계약서', pledge: '서약서', consent: '동의서', other: '기타' }

export default async function DocsPage(props: PageProps<'/admin/docs'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const tpls = must(await db().from('doc_templates').select('*').order('created_at')) as DocTemplate[]
  return (
    <div className="space-y-4">
      <Flash m={sp.m} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">서류 서식</h1>
        <div className="flex gap-2">
          <form action={restoreDefaultTemplates}>
            <SubmitButton className="btn-gray btn-sm">기본 서식 불러오기</SubmitButton>
          </form>
          <Link href="/admin/docs/new" className="btn-primary btn-sm">
            + 새 서식
          </Link>
        </div>
      </div>
      <p className="text-sm text-sub">
        공고마다 확정 인원에게 서명받을 서류를 고를 수 있습니다. 근무자는 앱에서 내용을 읽고 손가락으로 서명하며, 서명한 시점의 내용·회사 직인·서명 시각·IP가 함께
        보관됩니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {tpls.map((t) => (
          <Link key={t.id} href={`/admin/docs/${t.id}`} className={`card-link block ${t.active ? '' : 'opacity-50'}`}>
            <div className="flex items-center gap-2">
              <span className="badge bg-bg text-sub">{KIND[t.kind]}</span>
              {t.is_default && <span className="badge bg-brand-50 text-brand-700">기본 체크</span>}
              {!t.active && <span className="badge bg-gray-100 text-mute">사용 안 함</span>}
            </div>
            <p className="mt-2 font-bold">{t.title}</p>
            <p className="mt-1 line-clamp-2 text-xs text-mute">{t.body.replace(/[#\-{}]/g, '').slice(0, 120)}</p>
            <p className="mt-2 text-xs text-mute">수정 {fmtDate(kstDate(t.updated_at))}</p>
          </Link>
        ))}
      </div>
      <div className="card text-sm text-sub">
        <p className="mb-1 font-bold text-ink">앱이 자동으로 만드는 서류</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>임금명세서 — 근로기준법 제48조에 따른 항목(구성항목·계산방법·공제내역)을 근무 기록에서 자동 작성</li>
          <li>근무확인서 — 근무기간·일수·시간과 회사 직인</li>
          <li>개인정보 수집·이용 동의 — 가입할 때 받으며 동의 시각을 기록</li>
          <li>근로자 명부·정산표·월별 신고자료 — CSV(엑셀)로 내려받기</li>
        </ul>
      </div>
    </div>
  )
}
