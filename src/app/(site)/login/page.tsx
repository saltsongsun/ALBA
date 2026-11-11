import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/AuthForms'
import { returnCompany, ReturnCompanyChip, returnJob, ReturnJobChip } from '@/components/ReturnJob'
import { getPlatformSettings, getSettings, SUPPORT_NAME } from '@/lib/data'
import { phoneFmt } from '@/lib/format'
import { getUser } from '@/lib/session'
import { safePath } from '@/lib/validate'
import Icon from '@/components/Icon'

export const metadata: Metadata = { title: '로그인' }

export default async function LoginPage(props: PageProps<'/login'>) {
  const sp = await props.searchParams
  const next = safePath(sp.next, '')
  // forJob: 공고를 보다가 온 로그인이면 그 공고 (로그인하면 거기로 돌아감)
  // forCo: 회사 공고 모음(/?co=회사)을 보다가 온 로그인이면 그 회사
  const [user, settings, forJob, forCo] = await Promise.all([getUser(), getPlatformSettings(), returnJob(next), returnCompany(next)])
  if (user) redirect(next || '/me')
  // 비밀번호를 잊었을 때 연락할 곳: 공고·회사 링크로 왔으면 그 회사 담당자 먼저 (그 회사 관리자가 초기화해 줄 수 있음) + 해피워크 고객센터
  const coId = forJob?.company_id ?? forCo?.id ?? null
  const co = coId ? await getSettings(coId).catch(() => null) : null
  const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
  const helps = [
    co?.contact_phone && co.company_name ? { name: `${co.company_name} 담당자`, phone: digits(co.contact_phone) } : null,
    settings.contact_phone ? { name: SUPPORT_NAME, phone: digits(settings.contact_phone) } : null,
  ]
    .filter((h): h is { name: string; phone: string } => !!h && h.phone.length >= 8)
    // 같은 번호면 한 번만 (운영 회사 공고로 왔을 때)
    .filter((h, i, all) => all.findIndex((x) => x.phone === h.phone) === i)
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
        <LoginForm next={next} helps={helps} />
      </div>
      <div className="mt-5 text-center" data-login-help>
        <p className="text-[13px] text-mute">비밀번호를 잊었다면 담당자에게 초기화를 요청하세요.</p>
        {/* 작은 밑줄 글자 대신 누르기 쉬운 전화 버튼 (번호도 보임) */}
        {helps.length > 0 && (
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            {helps.map((h) => (
              <a key={h.phone} href={`tel:${h.phone}`} className="chip h-10 max-w-full" data-login-call>
                <Icon name="phone" className="shrink-0 text-brand-600" />
                <span className="min-w-0 truncate">{h.name}</span>{' '}
                <span className="shrink-0 tabular-nums">{phoneFmt(h.phone)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
