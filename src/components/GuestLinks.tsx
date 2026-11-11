'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 머리글의 '로그인 · 가입하기' (비회원).
 * 공고나 회사 공고 모음(/?co=회사)을 보다가 누르면, 가입·로그인이 끝난 뒤 보던 화면으로 돌아오게 주소(next)를 붙임
 * — 회사가 단톡방에 올린 링크로 들어온 사람이 위쪽 버튼을 눌러도 그 회사 공고에서 벗어나지 않게.
 * 로그인 ↔ 가입 화면을 오갈 때도 돌아갈 곳을 그대로 넘김 (서버가 한 번 더 안전한 주소인지 확인함)
 */
export default function GuestLinks() {
  const path = usePathname()
  const sp = useSearchParams()
  let next = ''
  let worker = false
  const co = sp.get('co')
  if (path === '/' && co && UUID.test(co)) {
    next = `/?co=${co}`
    worker = true // 회사 공고 모음은 아르바이트 공고만 → 유형 고르기를 건너뜀
  } else if (/^\/jobs\/[0-9a-f-]{36}$/i.test(path)) {
    next = path
  } else if (path === '/login' || path === '/signup') {
    const n = sp.get('next') ?? ''
    // 이 사이트 안의 주소만 (서버의 safePath와 같은 기준)
    if (/^\/(?![/\\])/.test(n) && !/[\u0000- \u007f\\]/.test(n)) next = n
  }
  const q = next ? `next=${encodeURIComponent(next)}` : ''
  // 지금 있는 화면으로 가는 버튼은 빼서, 화면에 '로그인'·'가입하기' 큰 버튼이 두 개씩 보이지 않게
  return (
    <>
      {path !== '/login' && (
        <Link href={`/login${q ? `?${q}` : ''}`} className="rounded-lg px-2.5 py-1.5 hover:bg-bg" data-header-login>
          로그인
        </Link>
      )}
      {path !== '/signup' && (
        <Link href={`/signup${worker ? `?type=worker&${q}` : q ? `?${q}` : ''}`} className="btn-primary btn-sm" data-header-signup>
          가입하기
        </Link>
      )}
    </>
  )
}
