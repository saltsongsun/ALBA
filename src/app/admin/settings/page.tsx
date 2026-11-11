import type { Metadata } from 'next'
import { SettingsForm } from '@/components/admin'
import { getSettings } from '@/lib/data'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import Flash from '@/components/Flash'
import Team from './Team'
import ThemeToggle from '@/components/ThemeToggle'
import Icon from '@/components/Icon'

export const metadata: Metadata = { title: '회사 설정' }

export default async function SettingsPage(props: PageProps<'/admin/settings'>) {
  const sp = await props.searchParams
  const admin = await requireAdmin()
  const multi = admin.companies.length > 1
  // jobsEver: 이 회사가 올린 공고 수 (0이면 새 회사 → 저장 뒤 '첫 공고 올리기'로 이어 줌)
  const [s, jobsEver] = await Promise.all([
    getSettings(admin.companyId, { seal: true }),
    db()
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', admin.companyId)
      .then(
        (r) => r.count ?? 0,
        () => 1,
      ),
  ])
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Flash m={sp.m} />
      <div>
        <h1 className="text-2xl font-extrabold">회사 설정</h1>
        {/* 여러 회사를 맡은 관리자: 지금 어느 회사 설정을 고치는지 (직인·사업자번호를 다른 회사에 잘못 넣지 않게) */}
        {multi && (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-sub" data-settings-company>
            <Icon name="building" className="shrink-0 text-brand-600" />
            <b className="min-w-0 truncate font-semibold text-ink">{admin.companyName}</b>
            <span className="shrink-0">설정이에요</span>
          </p>
        )}
      </div>
      {/* 관리자 초대 코드·가입 신청 승인·관리자 목록 */}
      <Team admin={admin} />
      <SettingsForm s={s} firstJob={jobsEver === 0} company={multi ? admin.companyName : undefined} />
      {/* 이 휴대폰 화면 설정 (회사 설정과 별개) */}
      <div className="card p-4">
        <ThemeToggle />
      </div>
    </div>
  )
}
