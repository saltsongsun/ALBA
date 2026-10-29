import type { Metadata } from 'next'
import { SettingsForm } from '@/components/admin'
import { getSettings } from '@/lib/data'
import { requireAdmin } from '@/lib/session'

export const metadata: Metadata = { title: '회사 설정' }

export default async function SettingsPage() {
  await requireAdmin()
  const s = await getSettings({ seal: true })
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">회사 설정</h1>
      <SettingsForm s={s} />
    </div>
  )
}
