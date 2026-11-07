import type { Metadata } from 'next'
import Link from 'next/link'
import { CompanySignupForm, JoinCompanyForm } from '@/components/AuthForms'
import Icon, { type IconName } from '@/components/Icon'
import { getUser } from '@/lib/session'

export const metadata: Metadata = { title: '회사로 시작하기' }

const POINTS: [IconName, string][] = [
  ['megaphone', '공고를 올리면 회원이 휴대폰으로 지원'],
  ['pen', '근로계약서를 앱에서 전자서명'],
  ['clock', '출퇴근·임금명세서·신고자료 자동 정리'],
  ['shield', '자료는 회사마다 따로 관리'],
]

/**
 * 회사 쪽 가입. 두 가지:
 * · 새 회사 등록: 신청하면 바로 관리자 화면 (해피워크 전체 회원 명단은 확인 뒤)
 * · 기존 회사에 합류: 대표 관리자에게 받은 회사 코드로 관리자 가입 신청 → 대표가 승인하면 시작
 */
export default async function StartPage(props: PageProps<'/start'>) {
  const sp = await props.searchParams
  const user = await getUser()
  const code = typeof sp.code === 'string' ? sp.code.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9) : ''
  const join = sp.tab === 'join' || !!code
  const signedIn = user?.role === 'admin'
  const tab = (on: boolean) =>
    `flex-1 rounded-xl py-2.5 text-center text-sm font-bold transition active:scale-[0.98] ${on ? 'bg-white text-ink shadow-sm' : 'text-mute'}`

  return (
    <div className="space-y-5 pt-4">
      <div>
        <h1 className="text-2xl font-extrabold">회사로 시작하기</h1>
        <p className="mt-1 text-sub">행사 인력을 뽑는 회사와 직원을 위한 화면이에요.</p>
      </div>
      <nav className="flex gap-1 rounded-2xl bg-line/60 p-1" aria-label="가입 방법">
        <Link href="/start" className={tab(!join)} aria-current={!join ? 'page' : undefined}>
          새 회사 등록
        </Link>
        <Link href="/start?tab=join" className={tab(join)} aria-current={join ? 'page' : undefined}>
          기존 회사에 합류
        </Link>
      </nav>

      {join ? (
        <>
          <ol className="card space-y-2 text-sm">
            <li>① 대표 관리자에게 <b>회사 코드</b>를 받아요</li>
            <li>② 코드를 넣고 관리자 가입을 신청해요</li>
            <li>③ 대표 관리자가 승인하면 관리자 화면이 열려요</li>
          </ol>
          {user && user.role !== 'admin' && user.memberType === 'vendor' ? (
            <p className="card text-sm text-sub">외주 업체 계정으로는 관리자가 될 수 없어요. 로그아웃한 뒤 담당자 번호로 따로 가입해 주세요.</p>
          ) : (
            <JoinCompanyForm signedIn={!!user} name={user?.name} code={code} worker={!!user && user.role !== 'admin'} />
          )}
        </>
      ) : (
        <>
          {/* 할 수 있는 일 네 줄 (그림 글자 대신 앱의 선 아이콘 · 한 줄에 짧게) */}
          <ul className="card space-y-2.5 text-sm" data-start-points>
            {POINTS.map(([icon, text]) => (
              <li key={text} className="flex items-center gap-2.5">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon name={icon} />
                </span>
                <span className="min-w-0">{text}</span>
              </li>
            ))}
          </ul>
          {user && user.role !== 'admin' ? (
            <p className="card text-sm text-sub">
              지금은 근무자 계정으로 로그인돼 있어요. 회사 담당자 휴대폰 번호로 따로 가입하려면 먼저 로그아웃해 주세요.
            </p>
          ) : (
            <CompanySignupForm signedIn={signedIn} />
          )}
          <p className="hint" data-start-note>
            가입하면 바로 공고를 올리고 지원자를 받아요. 전체 회원 명단은 회사 확인 뒤에 열려요.
          </p>
          <p className="text-center text-sm text-sub">
            이미 우리 회사가 해피워크를 쓰나요?{' '}
            <Link href="/start?tab=join" className="font-semibold text-brand-600">
              회사 코드로 합류 →
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
