import type { Metadata } from 'next'
import { SettingsForm } from '@/components/admin'
import { getSettings } from '@/lib/data'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import Flash from '@/components/Flash'
import Team from './Team'
import ThemeToggle from '@/components/ThemeToggle'
import Icon from '@/components/Icon'
import { isUuid } from '@/lib/validate'
import { LedgerLink } from '../LedgerPanel'
import { ledgerStatusIfOn } from '@/lib/ledger'

export const metadata: Metadata = { title: '회사 설정' }

export default async function SettingsPage(props: PageProps<'/admin/settings'>) {
  const sp = await props.searchParams
  const admin = await requireAdmin()
  const multi = admin.companies.length > 1
  // 내가 대표·관리자로 있는 다른 회사 (최고 관리자 권한으로만 보이는 회사는 빼고) — 운영 기본값을 그 회사 값으로 채울 수 있게 (정기 개선 2026-11-24 15:35)
  const mine = admin.companies.filter((c) => c.id !== admin.companyId && c.role !== 'super')
  // jobsEver: 이 회사가 올린 공고 수 (0이면 새 회사 → 저장 뒤 '첫 공고 올리기'로 이어 줌)
  const [s, jobsEver, ledger, otherRows] = await Promise.all([
    getSettings(admin.companyId, { seal: true }),
    db()
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', admin.companyId)
      .then(
        (r) => r.count ?? 0,
        () => 1,
      ),
    // 대금 시트(거래장부) 연동: 장부 회사의 관리자만
    ledgerStatusIfOn(admin.companyId), // 회사 확인·기록 읽기를 함께 (속도 개선 2026-11-22)
    // 그 회사들의 운영 기본값만 (문의 담당자·연락처·기본 시급 · 상호·사업자번호·주소·직인 같은 회사 고유 정보는 읽지 않음)
    mine.length
      ? db()
          .from('companies')
          .select('id, contact_name, contact_phone, default_hourly_wage')
          .in('id', mine.map((c) => c.id))
          .then(
            (r) => (r.data ?? []) as { id: string; contact_name: string | null; contact_phone: string | null; default_hourly_wage: number | null }[],
            () => [],
          )
      : Promise.resolve([] as { id: string; contact_name: string | null; contact_phone: string | null; default_hourly_wage: number | null }[]),
  ])
  // 지금 회사와 값이 하나라도 다르고, 채울 값이 있는 회사만 (최대 3곳 · 이름은 내 회사 목록의 이름)
  const others = otherRows
    .filter((o) => mine.some((c) => c.id === o.id))
    .map((o) => ({
      id: o.id,
      name: mine.find((c) => c.id === o.id)!.name,
      contact_name: o.contact_name?.trim() || null,
      contact_phone: o.contact_phone || null,
      default_hourly_wage: o.default_hourly_wage && o.default_hourly_wage > 0 ? o.default_hourly_wage : null,
    }))
    .filter(
      (o) =>
        (o.contact_name && o.contact_name !== (s.contact_name ?? '').trim()) ||
        (o.contact_phone && o.contact_phone !== s.contact_phone) ||
        (o.default_hourly_wage && o.default_hourly_wage !== s.default_hourly_wage),
    )
    .slice(0, 3)
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
      <SettingsForm
        s={s}
        firstJob={jobsEver === 0}
        company={multi ? admin.companyName : undefined}
        companyId={admin.companyId}
        backJob={typeof sp.job === 'string' && isUuid(sp.job) ? sp.job : undefined}
        others={others}
      />
      {/* 대금 시트(거래장부) 연동: 장부 회사 관리자에게만 한 줄 → 연동 화면 */}
      {ledger && <LedgerLink status={ledger} />}
      {/* 이 휴대폰 화면 설정 (회사 설정과 별개) */}
      <div className="card p-4">
        <ThemeToggle />
      </div>
    </div>
  )
}
