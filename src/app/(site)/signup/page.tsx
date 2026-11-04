import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SignupForm, SignupTypePicker } from '@/components/AuthForms'
import ProMode from '@/components/ProMode'
import { isMemberType, MEMBER_TYPES } from '@/lib/members'
import { getUser } from '@/lib/session'
import { safePath } from '@/lib/validate'

export const metadata: Metadata = { title: '가입하기' }

/** 가입: 먼저 유형(아르바이트·전문가·외주 업체)을 고르고, 유형마다 다른 가입 화면 (전문가·업체는 보라색 화면) */
export default async function SignupPage(props: PageProps<'/signup'>) {
  const sp = await props.searchParams
  const next = safePath(sp.next, '')
  if (await getUser()) redirect(next || '/me')
  const type = isMemberType(sp.type) ? sp.type : null
  if (!type) {
    return (
      <div className="pt-2">
        <h1 className="mb-1 text-2xl font-extrabold">어떤 분이세요?</h1>
        <p className="mb-5 text-sub">가입 유형에 따라 보는 화면과 계약·정산 방식이 달라요.</p>
        <SignupTypePicker next={next} />
      </div>
    )
  }
  const m = MEMBER_TYPES[type]
  return (
    <div className="pt-2" data-mode={type === 'worker' ? undefined : 'pro'}>
      {type !== 'worker' && <ProMode />}
      <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 유형 다시 고르기
      </Link>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
        {m.emoji} {m.label}
      </p>
      <h1 className="mt-2 mb-1 text-2xl font-extrabold">{type === 'worker' ? '간편 가입' : type === 'expert' ? '전문가 가입' : '외주 업체 가입'}</h1>
      <p className="mb-5 text-sub">
        {type === 'worker'
          ? '한 번만 가입하면 다음 행사부터는 버튼 하나로 지원할 수 있어요.'
          : type === 'expert'
            ? '전문가 의뢰에 지원하고, 용역계약·대금을 앱에서 관리해요.'
            : '견적 요청을 앱으로 받고, 대금·세금계산서 현황을 한눈에 봐요.'}
      </p>
      <SignupForm next={next} type={type} />
    </div>
  )
}
