import type { Metadata } from 'next'
import Link from 'next/link'
import CareerForm from '@/components/CareerForm'
import PhotoUpload from '@/components/PhotoUpload'
import PushToggle from '@/components/PushToggle'
import TextSizeToggle from '@/components/TextSizeToggle'
import { PinForm, ProfileForm, WithdrawForm } from '@/components/worker'
import type { Career } from '@/lib/careers'
import { decrypt } from '@/lib/crypto'
import { db } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { pushPublicKey } from '@/lib/push'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: '내 정보' }

export default async function ProfilePage() {
  const user = await requireUser('/me/profile')
  const { data: me } = await db()
    .from('users')
    .select('name, phone, rrn_masked, address, emergency_phone, bank_name, bank_account_enc, account_holder, photo_at, careers, created_at')
    .eq('id', user.id)
    .single()
  if (!me) return null
  return (
    <div className="space-y-4">
      <Link href="/me" className="text-sm font-semibold text-sub">
        ← 내 근무
      </Link>
      <div className="card space-y-3">
        <PhotoUpload userId={user.id} name={me.name} photoAt={me.photo_at}>
          <h1 className="text-xl font-extrabold">{me.name}</h1>
          <p className="mt-0.5 text-sm text-sub">
            <span className="whitespace-nowrap">{phoneFmt(me.phone)}</span> ·{' '}
            <span className="whitespace-nowrap">{me.rrn_masked ?? '주민번호 미등록'}</span>
          </p>
        </PhotoUpload>
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
      <CareerForm initial={(me.careers as Career[] | null) ?? []} />
      <div className="card p-4">
        <PushToggle publicKey={pushPublicKey()} />
      </div>
      <div className="card p-4">
        <TextSizeToggle />
      </div>
      <PinForm />
      <WithdrawForm />
    </div>
  )
}
