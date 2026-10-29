import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/AuthForms'
import { getSettings } from '@/lib/data'
import { phoneFmt } from '@/lib/format'
import { getUser } from '@/lib/session'
import { safePath } from '@/lib/validate'

export const metadata: Metadata = { title: '로그인' }

export default async function LoginPage(props: PageProps<'/login'>) {
  const sp = await props.searchParams
  const next = safePath(sp.next, '')
  if (await getUser()) redirect(next || '/me')
  const settings = await getSettings()
  return (
    <div className="pt-6">
      <h1 className="mb-1 text-2xl font-extrabold">로그인</h1>
      <p className="mb-6 text-sub">가입할 때 쓴 휴대폰 번호로 로그인하세요.</p>
      <div className="card">
        <LoginForm next={next} />
      </div>
      <p className="mt-5 text-center text-[13px] text-mute">
        비밀번호를 잊었다면 담당자에게 초기화를 요청하세요.
        {settings.contact_phone && (
          <>
            <br />
            {settings.contact_name ?? '담당자'}{' '}
            <a href={`tel:${settings.contact_phone}`} className="font-semibold text-sub underline">
              {phoneFmt(settings.contact_phone)}
            </a>
          </>
        )}
      </p>
    </div>
  )
}
