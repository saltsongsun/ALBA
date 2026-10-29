import type { Metadata } from 'next'
import Link from 'next/link'
import { PinForm, ProfileForm, WithdrawForm } from '@/components/worker'
import { decrypt } from '@/lib/crypto'
import { db } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: '내 정보' }

export default async function ProfilePage() {
  const user = await requireUser('/me/profile')
  const { data: me } = await db()
    .from('users')
    .select('name, phone, rrn_masked, address, emergency_phone, bank_name, bank_account_enc, account_holder, created_at')
    .eq('id', user.id)
    .single()
  if (!me) return null
  return (
    <div className="space-y-4">
      <Link href="/me" className="text-sm font-semibold text-sub">
        ← 내 근무
      </Link>
      <div className="card">
        <h1 className="text-xl font-extrabold">{me.name}</h1>
        <p className="mt-1 text-sm text-sub">
          {phoneFmt(me.phone)} · {me.rrn_masked ?? '주민번호 미등록'}
        </p>
        <p className="hint">이름·주민등록번호·휴대폰 번호를 바꾸려면 담당자에게 요청해 주세요.</p>
      </div>
      <ProfileForm
        initial={{
          address: me.address ?? '',
          emergency_phone: me.emergency_phone ?? '',
          bank_name: me.bank_name ?? '',
          bank_account: decrypt(me.bank_account_enc) ?? '',
          account_holder: me.account_holder ?? '',
        }}
      />
      <PinForm />
      <WithdrawForm />
    </div>
  )
}
