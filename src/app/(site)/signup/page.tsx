import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignupForm } from '@/components/AuthForms'
import { getUser } from '@/lib/session'
import { safePath } from '@/lib/validate'

export const metadata: Metadata = { title: '가입하기' }

export default async function SignupPage(props: PageProps<'/signup'>) {
  const sp = await props.searchParams
  const next = safePath(sp.next, '')
  if (await getUser()) redirect(next || '/me')
  return (
    <div className="pt-2">
      <h1 className="mb-1 text-2xl font-extrabold">간편 가입</h1>
      <p className="mb-5 text-sub">한 번만 가입하면 다음 행사부터는 버튼 하나로 지원할 수 있어요.</p>
      <SignupForm next={next} />
    </div>
  )
}
