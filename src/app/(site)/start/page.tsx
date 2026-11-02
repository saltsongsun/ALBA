import type { Metadata } from 'next'
import { CompanySignupForm } from '@/components/AuthForms'
import { getUser } from '@/lib/session'

export const metadata: Metadata = { title: '회사로 시작하기' }

/** 회사 직접 가입: 신청하면 바로 관리자 화면으로 (해피워크 전체 회원 명단은 확인 뒤) */
export default async function StartPage() {
  const user = await getUser()
  const signedIn = user?.role === 'admin'
  return (
    <div className="space-y-5 pt-4">
      <div>
        <h1 className="text-2xl font-extrabold">🏢 회사로 시작하기</h1>
        <p className="mt-1 text-sub">행사 인력을 뽑는 회사라면 바로 시작해요.</p>
      </div>
      <ul className="card space-y-2 text-sm">
        <li>📢 공고를 올리면 회원이 휴대폰으로 지원</li>
        <li>✍️ 근로계약서를 앱에서 전자서명</li>
        <li>⏱ 출퇴근·임금명세서·신고자료 자동 정리</li>
        <li>🔒 자료는 회사마다 따로 관리</li>
      </ul>
      {user && user.role !== 'admin' ? (
        <p className="card text-sm text-sub">
          지금은 근무자 계정으로 로그인돼 있어요. 회사 담당자 휴대폰 번호로 따로 가입하려면 먼저 로그아웃해 주세요.
        </p>
      ) : (
        <CompanySignupForm signedIn={signedIn} />
      )}
      <p className="hint">
        가입하면 바로 공고를 올리고 지원자를 받을 수 있어요. 다른 회사에 지원한 사람까지 보이는 해피워크 전체 회원 명단은 회사 확인을 마친 뒤에 열려요.
      </p>
    </div>
  )
}
