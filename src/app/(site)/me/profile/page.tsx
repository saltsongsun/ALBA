import type { Metadata } from 'next'
import Link from 'next/link'
import CareerForm from '@/components/CareerForm'
import OpenOnHash from '@/components/OpenOnHash'
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
  // 정보 채우기: 비어 있는 항목을 눌러 바로 그 칸으로 (급여·현장 연락이 빨라지게)
  const checks = [
    { key: 'photo', label: '얼굴 사진', done: !!me.photo_at, href: '#photo', why: '현장에서 담당자가 알아봐요' },
    { key: 'account', label: '급여 계좌', done: !!me.bank_account_enc, href: '#account', why: '급여를 바로 받아요' },
    { key: 'emergency', label: '비상연락처', done: !!me.emergency_phone, href: '#account', why: '현장에서 연락이 안 될 때' },
    { key: 'address', label: '주소', done: !!me.address, href: '#account', why: '근로계약서에 들어가요' },
    { key: 'careers', label: '행사 경력', done: Array.isArray(me.careers) && me.careers.length > 0, href: '#careers', why: '확정될 때 참고해요' },
  ]
  const doneN = checks.filter((c) => c.done).length
  return (
    <div className="space-y-4">
      <OpenOnHash />
      <Link href="/me" className="text-sm font-semibold text-sub">
        ← 내 근무
      </Link>
      {doneN < checks.length && (
        <section className="card space-y-3 border-2 border-brand-100">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">
              정보 채우기 <span className="tabular-nums text-brand-700">{doneN}/{checks.length}</span>
            </h2>
            <span className="text-xs text-mute">다 채우면 확정·급여가 빨라져요</span>
          </div>
          <div className="flex gap-1" aria-hidden>
            {checks.map((c, i) => (
              <span key={c.key} className={`h-1.5 flex-1 rounded-full ${i < doneN ? 'bg-brand-600' : 'bg-bg'}`} />
            ))}
          </div>
          <ul className="space-y-1.5">
            {checks
              .filter((c) => !c.done)
              .map((c) => (
                <li key={c.key}>
                  <a href={c.href} className="flex items-center justify-between gap-3 rounded-xl bg-bg px-3.5 py-2.5 text-sm transition active:scale-[0.99]">
                    <span className="min-w-0">
                      <b className="block">{c.label}</b>
                      <span className="block text-xs text-sub">{c.why}</span>
                    </span>
                    <span className="shrink-0 font-semibold whitespace-nowrap text-brand-600">채우기 →</span>
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
      <div id="photo" className="card scroll-mt-20 space-y-3">
        <PhotoUpload userId={user.id} name={me.name} photoAt={me.photo_at}>
          <h1 className="text-xl font-extrabold">{me.name}</h1>
          <p className="mt-0.5 text-sm text-sub">
            <span className="whitespace-nowrap">{phoneFmt(me.phone)}</span> ·{' '}
            <span className="whitespace-nowrap">{me.rrn_masked ?? '주민번호 미등록'}</span>
          </p>
        </PhotoUpload>
        <p className="hint">이름·주민등록번호·휴대폰 번호를 바꾸려면 담당자에게 요청해 주세요.</p>
      </div>
      <div id="account" className="scroll-mt-20">
      <ProfileForm
        initial={{
          address: me.address ?? '',
          emergency_phone: me.emergency_phone ?? '',
          bank_name: me.bank_name ?? '',
          bank_account: decrypt(me.bank_account_enc) ?? '',
          account_holder: me.account_holder ?? '',
        }}
      />
      </div>
      <div id="careers" className="scroll-mt-20">
        <CareerForm initial={(me.careers as Career[] | null) ?? []} />
      </div>
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
