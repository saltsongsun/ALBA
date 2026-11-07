import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/session'
import { VIEW_COOKIE } from '@/lib/view'

/**
 * 관리자는 접속하면 관리자 화면부터 (사용자 요청 2026-11-07).
 * 화면을 그리기 전에(불러오는 중 화면보다 먼저) 바로 /admin으로 보냄 · '근무자 화면으로 보기'로 들어온 동안이나
 * 공고 모음 링크(/?co=)·검색처럼 주소 뒤에 값이 있으면 근무자 첫 화면 그대로
 */
export default async function HomeLayout({ children }: { children: React.ReactNode }) {
  const [me, jar, h] = await Promise.all([getUser(), cookies(), headers()])
  if (me?.role === 'admin' && !h.get('x-search') && jar.get(VIEW_COOKIE)?.value !== 'worker') redirect('/admin')
  return children
}
