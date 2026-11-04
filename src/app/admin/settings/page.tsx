import type { Metadata } from 'next'
import { SettingsForm } from '@/components/admin'
import { getSettings } from '@/lib/data'
import { requireAdmin } from '@/lib/session'
import Flash from '@/components/Flash'
import Team from './Team'
import ThemeToggle from '@/components/ThemeToggle'

export const metadata: Metadata = { title: '회사 설정' }

export default async function SettingsPage(props: PageProps<'/admin/settings'>) {
  const sp = await props.searchParams
  const admin = await requireAdmin()
  const s = await getSettings(admin.companyId, { seal: true })
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Flash m={sp.m} />
      <h1 className="text-2xl font-extrabold">회사 설정</h1>
      {/* 관리자 초대 코드·가입 신청 승인·관리자 목록 */}
      <Team admin={admin} />
      <SettingsForm s={s} />
      {/* 이 휴대폰 화면 설정 (회사 설정과 별개) */}
      <div className="card p-4">
        <ThemeToggle />
      </div>
    </div>
  )
}
