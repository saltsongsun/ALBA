import Icon from '@/components/Icon'
import type { Metadata } from 'next'
import Link from 'next/link'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import Empty from '@/components/Empty'
import { db, must } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { plainBody } from '@/lib/stickers'
import { adminRooms, roomEnded } from '@/lib/room'
import { fmtDateRange } from '@/lib/time'
import { fmtDate, kstDate, kstTime } from '@/lib/time'
import Flash from '@/components/Flash'

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
  const admin = await requireAdmin()
  const sp = await props.searchParams
  const onlyUnread = sp.unread === '1'
  const rooms = await adminRooms(admin.companyId, admin.id)
  // 최근 메시지에서 근무자별 대화방을 모음 (가장 최근 대화가 위)
  const rows = must(
    await db()
      .from('messages')
      .select('id, thread_user_id, from_admin, body, created_at, read_at, user:users!messages_thread_user_id_fkey(id, name, phone, photo_at)').eq('company_id', admin.companyId)
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
      <Flash m={sp.m} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">문의</h1>
          <AutoRefresh seconds={15} pulse="/api/pulse?s=admin-chat" />
        </div>
        <a href="/admin/chat/export" download className="chip h-8 shrink-0 px-3 text-xs">
          ⬇️ 모든 대화 저장
        </a>
      </div>
      {/* 같은 근무 단체방: 공고마다 확정자 + 담당자 · 행사가 끝난 방은 아래 '종료된 행사'로 접어 둠 */}
      {(() => {
        const live = rooms.filter((r) => !roomEnded(r))
        const past = rooms.filter((r) => roomEnded(r))
        const pastUnread = past.reduce((n, r) => n + r.unread, 0)
        const card = (r: (typeof rooms)[number]) => (
          <Link key={r.id} href={`/admin/chat/room/${r.id}`} className="card-link flex items-center gap-3 p-3.5" data-room-row>
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-lg">
              👥
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{r.title}</span>
              <span className="block truncate text-xs text-sub">
                {fmtDateRange(r.start_date, r.end_date)} · 확정 {r.members}명
              </span>
            </span>
            {r.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 animate-pop place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{r.unread}</span>}
          </Link>
        )
        if (!rooms.length) return null
        return (
          <section className="space-y-2" aria-label="단체방">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-sub">
              <Icon name="users" /> 단체방
            </h2>
            {live.length === 0 && <p className="text-sm text-mute">진행 중인 행사 단체방이 없어요.</p>}
            {live.map(card)}
            {past.length > 0 && (
              <details className="group" data-rooms-ended>
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-sub ring-1 ring-line [&::-webkit-details-marker]:hidden">
                  <Icon name="clock" className="text-mute" />
                  종료된 행사 단체방 {past.length}
                  {pastUnread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white tabular-nums">{pastUnread}</span>}
                  <svg viewBox="0 0 24 24" className="ml-auto size-4 text-mute transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <div className="mt-2 space-y-2 opacity-90">{past.map(card)}</div>
              </details>
            )}
          </section>
        )
      })()}
      <div className="flex gap-1.5">
        <Link href="/admin/chat" className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${!onlyUnread ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`}>
          전체 {all.length}
        </Link>
        <Link href="/admin/chat?unread=1" className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${onlyUnread ? 'bg-rose-600 text-white' : 'bg-white text-sub ring-1 ring-line'}`}>
          안 읽음 {unreadCount}
        </Link>
      </div>
      {list.length === 0 ? (
        <Empty icon="💬" title="아직 들어온 문의가 없어요">근무자가 앱의 &lsquo;문의&rsquo;에서 보낸 메시지가 여기에 모여요.</Empty>
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
                    {plainBody(last.body)}
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
