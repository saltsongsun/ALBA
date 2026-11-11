import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/AuthForms'
import { returnCompany, ReturnCompanyChip, returnJob, ReturnJobChip } from '@/components/ReturnJob'
import { getPlatformSettings, SUPPORT_NAME } from '@/lib/data'
import { phoneFmt } from '@/lib/format'
import { getUser } from '@/lib/session'
import { safePath } from '@/lib/validate'

export const metadata: Metadata = { title: '로그인' }

export default async function LoginPage(props: PageProps<'/login'>) {
  const sp = await props.searchParams
  const next = safePath(sp.next, '')
  // forJob: 공고를 보다가 온 로그인이면 그 공고 (로그인하면 거기로 돌아감)
  // forCo: 회사 공고 모음(/?co=회사)을 보다가 온 로그인이면 그 회사
  const [user, settings, forJob, forCo] = await Promise.all([getUser(), getPlatformSettings(), returnJob(next), returnCompany(next)])
  if (user) redirect(next || '/me')
  return (
    <div className="pt-6">
      <h1 className="mb-1 text-2xl font-extrabold">로그인</h1>
      <p className={`text-sub ${forJob || forCo ? 'mb-3' : 'mb-6'}`}>가입할 때 쓴 휴대폰 번호로 로그인하세요.</p>
      {forJob ? (
        <ReturnJobChip job={forJob} text="로그인하면 이 공고로 돌아가요" name="login" />
      ) : (
        forCo && <ReturnCompanyChip company={forCo} text="로그인하면 이 회사 공고로 돌아가요" name="login" />
      )}
      <div className="card">
        <LoginForm next={next} help={{ name: SUPPORT_NAME, phone: settings.contact_phone ?? null }} />
      </div>
      <p className="mt-5 text-center text-[13px] text-mute">
        비밀번호를 잊었다면 담당자에게 초기화를 요청하세요.
        {settings.contact_phone && (
          <>
            <br />
            {SUPPORT_NAME}{' '}
            <a href={`tel:${settings.contact_phone}`} className="font-semibold text-sub underline">
              {phoneFmt(settings.contact_phone)}
            </a>
          </>
        )}
      </p>
    </div>
  )
}
