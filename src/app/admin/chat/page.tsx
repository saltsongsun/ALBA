import type { Metadata } from 'next'
import Link from 'next/link'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import Empty from '@/components/Empty'
import { db, must } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { fmtDate, kstDate, kstTime } from '@/lib/time'

export const metadata: Metadata = { title: '문의' }

type Row = {
  id: number
  thread_user_id: string
  from_admin: boolean
  body: string
  created_at: string
  read_at: string | null
  user: { id: string; name: string; phone: string; photo_at: string | null } | null
}

export default async function AdminChatList(props: PageProps<'/admin/chat'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const onlyUnread = sp.unread === '1'
  // 최근 메시지에서 근무자별 대화방을 모음 (가장 최근 대화가 위)
  const rows = must(
    await db()
      .from('messages')
      .select('id, thread_user_id, from_admin, body, created_at, read_at, user:users!messages_thread_user_id_fkey(id, name, phone, photo_at)')
      .order('created_at', { ascending: false })
      .limit(1000),
  ) as unknown as Row[]
  const threads = new Map<string, { last: Row; unread: number }>()
  for (const r of rows) {
    const t = threads.get(r.thread_user_id) ?? threads.set(r.thread_user_id, { last: r, unread: 0 }).get(r.thread_user_id)!
    if (!r.from_admin && !r.read_at) t.unread++
  }
  const today = kstDate()
  const all = [...threads.values()].filter((t) => t.last.user)
  const unreadCount = all.filter((t) => t.unread > 0).length
  const list = onlyUnread ? all.filter((t) => t.unread > 0) : all

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">문의</h1>
        <AutoRefresh seconds={15} />
      </div>
      <div className="flex gap-1.5">
        <Link href="/admin/chat" className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${!onlyUnread ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`}>
          전체 {all.length}
        </Link>
        <Link href="/admin/chat?unread=1" className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${onlyUnread ? 'bg-rose-600 text-white' : 'bg-white text-sub ring-1 ring-line'}`}>
          안 읽음 {unreadCount}
        </Link>
      </div>
      {list.length === 0 ? (
        <Empty icon="💬" title="아직 들어온 문의가 없습니다">근무자가 앱의 &lsquo;문의&rsquo;에서 보낸 메시지가 여기에 모입니다.</Empty>
      ) : (
        <div className="stagger space-y-2">
          {list.map(({ last, unread }) => (
            <Link key={last.thread_user_id} href={`/admin/chat/${last.thread_user_id}`} className="card-link flex items-center gap-3 p-4">
              <Avatar id={last.user!.id} name={last.user!.name} photoAt={last.user!.photo_at} zoom={false} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-bold">
                    {last.user!.name} <span className="text-xs font-medium text-mute">{phoneFmt(last.user!.phone)}</span>
                  </p>
                  <span className="shrink-0 text-xs text-mute">{kstDate(last.created_at) === today ? kstTime(last.created_at) : fmtDate(kstDate(last.created_at))}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-sm ${unread ? 'font-semibold text-ink' : 'text-sub'}`}>
                    {last.from_admin && <span className="text-mute">답장: </span>}
                    {last.body}
                  </p>
                  {unread > 0 && <span className="grid h-5 min-w-5 shrink-0 animate-pop place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
