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
import { changeMemberType } from '@/app/actions/worker'
import { ProInfoForm } from '@/components/pro'
import { ConfirmSubmit } from '@/components/ui'
import { NicknameForm } from '@/components/community'
import LiveNumber from '@/components/LiveNumber'
import { myActivity } from '@/lib/community'
import { bizNoFmt, MEMBER_TYPES } from '@/lib/members'
import type { MemberType } from '@/lib/types'

export const metadata: Metadata = { title: '내 정보' }

export default async function ProfilePage() {
  const user = await requireUser('/me/profile')
  const { data: me } = await db()
    .from('users')
    .select('name, phone, rrn_masked, address, emergency_phone, bank_name, bank_account_enc, account_holder, photo_at, careers, created_at, member_type, specialty, intro, portfolio_url, biz_name, biz_no')
    .eq('id', user.id)
    .single()
  if (!me) return null
  // 커뮤니티 별명 (따로 읽음: 못 읽어도 내 정보 화면은 그대로)
  const [nickname, activity] = await Promise.all([
    db()
      .from('users')
      .select('nickname')
      .eq('id', user.id)
      .maybeSingle()
      .then((r) => (r.data as { nickname: string | null } | null)?.nickname ?? ''),
    me.member_type === 'vendor' ? { posts: 0, comments: 0, likes: 0 } : myActivity(user.id),
  ])
  const type: MemberType = me.member_type === 'expert' || me.member_type === 'vendor' ? me.member_type : 'worker'
  const vendor = type === 'vendor'
  // 정보 채우기: 비어 있는 항목을 눌러 바로 그 칸으로 (급여·현장 연락이 빨라지게). 유형마다 다름
  const checks = vendor
    ? [
        { key: 'account', label: '대금 계좌', done: !!me.bank_account_enc, href: '#account', why: '대금을 바로 받아요' },
        { key: 'specialty', label: '분야', done: !!me.specialty, href: '#pro', why: '맞는 견적 요청을 받아요' },
        { key: 'intro', label: '한 줄 소개', done: !!me.intro, href: '#pro', why: '회사가 업체를 고를 때 봐요' },
      ]
    : [
        { key: 'photo', label: '얼굴 사진', done: !!me.photo_at, href: '#photo', why: '현장에서 담당자가 알아봐요' },
        { key: 'account', label: type === 'expert' ? '대금 계좌' : '급여 계좌', done: !!me.bank_account_enc, href: '#account', why: type === 'expert' ? '용역 대금을 바로 받아요' : '급여를 바로 받아요' },
        { key: 'emergency', label: '비상연락처', done: !!me.emergency_phone, href: '#account', why: '현장에서 연락이 안 될 때' },
        type === 'expert'
          ? { key: 'specialty', label: '전문 분야', done: !!me.specialty, href: '#pro', why: '맞는 의뢰를 받아요' }
          : { key: 'address', label: '주소', done: !!me.address, href: '#account', why: '근로계약서에 들어가요' },
        { key: 'careers', label: type === 'expert' ? '참여한 행사' : '행사 경력', done: Array.isArray(me.careers) && me.careers.length > 0, href: '#careers', why: '확정될 때 참고해요' },
      ]
  const doneN = checks.filter((c) => c.done).length
  return (
    <div className="space-y-4">
      <OpenOnHash />
      <Link href={vendor ? '/pro' : '/me'} className="text-sm font-semibold text-sub">
        {vendor ? '← 홈' : '← 내 근무'}
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
      {vendor ? (
        <div className="card space-y-1">
          <p className={`badge ${MEMBER_TYPES.vendor.badge}`}>🏢 외주 업체</p>
          <h1 className="text-xl font-extrabold">{me.biz_name ?? me.name}</h1>
          <p className="text-sm text-sub">
            담당 {me.name} · <span className="whitespace-nowrap">{phoneFmt(me.phone)}</span>
            {me.biz_no && <span className="whitespace-nowrap"> · {bizNoFmt(me.biz_no)}</span>}
          </p>
        </div>
      ) : (
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
      )}
      {/* 가입 유형: 아르바이트 ↔ 전문가 (외주 업체는 사업자라 그대로) */}
      <section id="type" className="card scroll-mt-20 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">가입 유형</h2>
          <span className={`badge ${MEMBER_TYPES[type].badge}`}>
            {MEMBER_TYPES[type].emoji} {MEMBER_TYPES[type].label}
          </span>
        </div>
        <p className="text-sm text-sub">{MEMBER_TYPES[type].desc}</p>
        {!vendor && (
          <form action={changeMemberType.bind(null, type === 'worker' ? 'expert' : 'worker')}>
            <ConfirmSubmit className="btn-gray btn-sm" confirmText={type === 'worker' ? '전문가로 바꿀까요? 알바 공고 대신 전문가 의뢰를 봐요' : '아르바이트로 바꿀까요? 전문가 의뢰 대신 알바 공고를 봐요'}>
              {type === 'worker' ? '🎛️ 전문가로 바꾸기' : '🙋 아르바이트로 바꾸기'}
            </ConfirmSubmit>
          </form>
        )}
      </section>
      {/* 커뮤니티 별명: 게시판·후기에 실명 대신 보임 (외주 업체는 읽기만이라 없음) */}
      {!vendor && (
        <section id="nickname" className="card scroll-mt-20 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">커뮤니티 별명</h2>
            <Link href="/community" className="text-sm font-semibold text-brand-600">
              커뮤니티 →
            </Link>
          </div>
          <p className="text-sm text-sub">게시판 글·댓글과 회사 후기에 이름 대신 이 별명이 보여요.{!nickname && ' 아직 없으면 처음 글을 쓸 때 자동으로 정해져요.'}</p>
          <NicknameForm current={nickname} />
          {/* 내 커뮤니티 활동 (숫자가 0부터 올라감) */}
          {activity.posts + activity.comments > 0 && (
            <dl className="grid grid-cols-3 gap-2 text-center" data-my-activity>
              {(
                [
                  ['쓴 글', activity.posts],
                  ['단 댓글', activity.comments],
                  ['받은 ❤️', activity.likes],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-bg py-2.5">
                  <dd className="text-lg font-extrabold tabular-nums">
                    <LiveNumber value={v} countUp />
                  </dd>
                  <dt className="text-xs text-sub">{k}</dt>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
      {type !== 'worker' && (
        <div id="pro" className="scroll-mt-20">
          <ProInfoForm
            vendor={vendor}
            initial={{
              specialty: me.specialty ?? '',
              intro: me.intro ?? '',
              portfolio_url: me.portfolio_url ?? '',
              biz_name: me.biz_name ?? '',
              biz_no: me.biz_no ?? '',
            }}
          />
        </div>
      )}
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
      {!vendor && (
        <div id="careers" className="scroll-mt-20">
          <CareerForm initial={(me.careers as Career[] | null) ?? []} />
        </div>
      )}
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
