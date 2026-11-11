import Link from 'next/link'
import Icon from '@/components/Icon'
import Logo from '@/components/Logo'

/**
 * 견적 링크가 맞지 않을 때 (문자에서 주소가 잘렸거나, 요청이 지워졌거나).
 * 여는 사람은 아르바이트 지원자가 아니라 외주 업체 담당자 → '모집 중인 알바' 대신 무엇을 하면 되는지를 알려 줌
 */
export default function QuoteNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="card animate-pop space-y-4 py-7 text-center" data-quote-404>
        <Logo className="mx-auto size-12" />
        <div>
          <h1 className="text-xl font-extrabold">견적 링크를 열 수 없어요</h1>
          <p className="mt-2 text-sm text-pretty text-sub">주소가 중간에 잘렸거나, 요청이 지워졌을 수 있어요.</p>
        </div>
        <ul className="space-y-2 rounded-2xl bg-bg px-4 py-3.5 text-left text-sm">
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-brand-700 ring-1 ring-line">
              1
            </span>
            <span className="min-w-0 text-pretty">
              받은 문자·카톡의 <b className="font-semibold">주소를 끝까지</b> 다시 눌러 보세요. 두 줄로 나뉘었다면 전체를 복사해 주소창에 붙여 넣으면 돼요.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-brand-700 ring-1 ring-line">
              2
            </span>
            <span className="min-w-0 text-pretty">
              그래도 안 열리면 견적을 요청한 회사에 <b className="font-semibold">링크를 다시 보내 달라고</b> 해 주세요.
            </span>
          </li>
        </ul>
        <Link href="/pro/money" className="btn-gray w-full" data-quote-404-app>
          <Icon name="file" />
          앱에 가입한 업체라면 · 받은 견적 보기
        </Link>
      </div>
    </main>
  )
}
