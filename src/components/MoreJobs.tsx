'use client'

import Link, { useLinkStatus } from 'next/link'

/** 누르는 동안 '불러오는 중…' (몇 초 걸려도 눌렸는지 알게) */
function Label() {
  const { pending } = useLinkStatus()
  return pending ? (
    <span className="inline-flex items-center gap-2" data-more-pending>
      <span aria-hidden className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
      불러오는 중…
    </span>
  ) : (
    <span>
      공고 더 보기 <span aria-hidden>↓</span>
    </span>
  )
}

/**
 * 홈 공고 목록 끝: 공고가 더 있으면 다음 묶음을 불러옴 (여러 회사 공고가 쌓여도 뒤쪽 공고가 묻히지 않게)
 * 불러온 뒤에는 새로 붙은 첫 공고로 내려가 잠깐 테두리로 알려 줌 (#more-n)
 */
export default function MoreJobs({ href }: { href: string }) {
  return (
    <Link href={href} className="btn-white mt-3 w-full" data-more-jobs data-track="홈 공고 더 보기">
      <Label />
    </Link>
  )
}
