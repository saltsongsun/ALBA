import BottomNav from '@/components/BottomNav'
import SiteHeader from '@/components/SiteHeader'
import { unreadForWorker } from '@/lib/data'
import { getUser } from '@/lib/session'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  const unread = user ? await unreadForWorker(user.id) : 0
  return (
    <>
      <SiteHeader />
      <main className={`mx-auto max-w-xl px-4 pt-5 ${user ? 'pb-28 sm:pb-16' : 'pb-16'}`}>{children}</main>
      {user && <BottomNav unread={unread} />}
    </>
  )
}
