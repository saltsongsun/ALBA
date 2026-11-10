import Icon from '@/components/Icon'
import type { Metadata } from 'next'
import Link from 'next/link'
import AutoRefresh from '@/components/AutoRefresh'
import Avatar from '@/components/Avatar'
import Empty from '@/components/Empty'
import { db, must } from '@/lib/db'
import { phoneFmt } from '@/lib/format'
import { requireAdmin } from '@/lib/session'
import { isDeleted } from '@/lib/deleted'
import { plainBody } from '@/lib/stickers'
import { adminRooms, roomEnded } from '@/lib/room'
import { fmtDateRange } from '@/lib/time'
import { fmtDate, kstDate, kstTime } from '@/lib/time'
import Flash from '@/components/Flash'
import SearchInput from '@/components/SearchInput'
import { ConfirmSubmit } from '@/components/ui'
import { markAllInquiriesRead } from '@/app/actions/chat'
import { askTag, needsReply } from '@/lib/signals'

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
  // '답장 전'만 모아 보기 (읽었지만 아직 답하지 않은 문의)
  const onlyNoReply = !onlyUnread && sp.noreply === '1'
  const rooms = await adminRooms(admin.companyId, admin.id)
  // 단체방 마지막 말을 쓴 사람 이름 (나는 '나')
  const lastSenders = [...new Set(rooms.map((r) => r.last?.sender_id).filter((id): id is string => !!id && id !== admin.id))]
  const senderName = new Map(
    lastSenders.length ? (((await db().from('users').select('id, name').in('id', lastSenders)).data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]) : [],
  )
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
  // 지금 이 회사에서 근무 중인 사람 (사진 옆 초록 점 — 현장에서 온 문의를 먼저 보게)
  const workingNow = new Set(
    all.length
      ? (
          ((
            await db()
              .from('attendance')
              .select('user_id, clock_out')
              .eq('company_id', admin.companyId)
              .eq('work_date', today)
              .is('clock_out', null)
              .in('user_id', all.map((t) => t.last.thread_user_id))
          ).data ?? []) as { user_id: string; clock_out: string | null }[]
        )
          .filter((a) => !a.clock_out)
          .map((a) => a.user_id)
      : [],
  )
  const unreadCount = all.filter((t) => t.unread > 0).length
  // 검색: 근무자 이름 · 전화번호(숫자 3자리 이상) · 주고받은 메시지 내용 / 단체방은 공고 이름
  const term = typeof sp.q === 'string' ? sp.q.trim().slice(0, 50) : ''
  const low = term.toLowerCase()
  const digits = term.replace(/\D/g, '')
  const hitOf = new Map<string, Row>()
  if (term)
    for (const r of rows) {
      if (hitOf.has(r.thread_user_id) || isDeleted(r.body)) continue
      if (plainBody(r.body).toLowerCase().includes(low)) hitOf.set(r.thread_user_id, r)
    }
  const matches = (t: { last: Row }) =>
    !term ||
    t.last.user!.name.toLowerCase().includes(low) ||
    (digits.length >= 3 && (t.last.user!.phone ?? '').replace(/\D/g, '').includes(digits)) ||
    hitOf.has(t.last.thread_user_id)
  const found = all.filter(matches)
  // 답장 전: 근무자가 마지막으로 보낸 글을 읽기만 하고 답하지 않은 대화 (최근 7일 · 알리기만 하는 글은 빼고) — 읽고 나면 빨간 숫자가 사라져 묻히기 쉬움
  const noReplySince = Date.now() - 7 * 86_400_000
  const noReply = (t: { last: Row; unread: number }) => !t.last.from_admin && t.unread === 0 && needsReply(t.last.body) && Date.parse(t.last.created_at) >= noReplySince
  const noReplyCount = found.filter(noReply).length
  const list = onlyUnread ? found.filter((t) => t.unread > 0) : onlyNoReply ? found.filter(noReply) : found
  const roomHits = term ? rooms.filter((r) => r.title.toLowerCase().includes(low)) : rooms
  const qs = (unread: boolean, noreply = false) => {
    const p = new URLSearchParams()
    if (unread) p.set('unread', '1')
    else if (noreply) p.set('noreply', '1')
    if (term) p.set('q', term)
    const s = p.toString()
    return `/admin/chat${s ? `?${s}` : ''}`
  }

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
      {/* 같은 근무 단체방: 공고마다 확정자 + 참여한 담당자 · 참여 안 한 방·끝난 방은 아래에 접어 둠 */}
      {/* 검색 (공고 화면과 같은 모양): 이름·번호·메시지 내용 · 단체방 이름 */}
      <form className="flex gap-1.5" role="search" data-chat-search>
        {onlyUnread && <input type="hidden" name="unread" value="1" />}
        <SearchInput name="q" enterKeyHint="search" defaultValue={term} className="input py-2 text-sm" placeholder="이름·번호·메시지 내용·단체방으로 찾기" aria-label="문의 찾기" />
        {term && (
          <Link href={onlyUnread ? '/admin/chat?unread=1' : '/admin/chat'} className="btn-gray btn-sm shrink-0">
            지우기
          </Link>
        )}
      </form>
      {term && (
        <p className="text-sm text-sub" data-chat-search-result>
          ‘{term}’ 검색 결과 · 대화 {found.length}개{rooms.length > 0 ? ` · 단체방 ${roomHits.length}개` : ''}
        </p>
      )}
      {(() => {
        // 검색 중에는 찾은 방만, 접지 않고 모두 보여 줌
        // 평소: 내가 참여한 진행 중 방은 위 · 참여 안 한 진행 중 방은 '참여 안 한 단체방'으로 · 끝난 방은 '종료된 행사'로 접어 둠
        const shown = roomHits
        const live = term ? shown : shown.filter((r) => !roomEnded(r) && r.joined)
        const others = term ? [] : shown.filter((r) => !roomEnded(r) && !r.joined)
        const past = term ? [] : shown.filter((r) => roomEnded(r))
        const pastUnread = past.reduce((n, r) => n + r.unread, 0)
        const card = (r: (typeof rooms)[number]) => (
          <Link key={r.id} href={`/admin/chat/room/${r.id}`} className="card-link flex items-center gap-3 p-3.5" data-room-row data-joined={r.joined ? '1' : '0'}>
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-lg">
              👥
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-bold">{r.title}</span>
                {r.last && <span className="shrink-0 text-xs text-mute">{kstDate(r.last.created_at) === today ? kstTime(r.last.created_at) : fmtDate(kstDate(r.last.created_at))}</span>}
              </span>
              <span className="block truncate text-xs text-sub">
                {fmtDateRange(r.start_date, r.end_date)} · 확정 {r.members}명{!r.joined && ' · 참여 안 함'}
              </span>
              {/* 마지막 말 미리보기: 방에 들어가지 않고도 무슨 얘기가 오갔는지 */}
              {r.last && (
                <span className={`mt-0.5 block truncate text-[13px] ${r.unread ? 'font-semibold text-ink' : 'text-sub'}`} data-room-last>
                  <span className="text-mute">{r.last.sender_id === admin.id ? '나' : (senderName.get(r.last.sender_id ?? '') ?? (r.last.from_admin ? '담당자' : '근무자'))}: </span>
                  {plainBody(r.last.body)}
                </span>
              )}
            </span>
            {r.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 animate-pop place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{r.unread}</span>}
          </Link>
        )
        const fold = (key: string, icon: 'clock' | 'users', label: string, list: typeof rooms, unread: number, hint?: string) => (
          <details className="group" {...{ [key]: '' }}>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl before:hidden bg-white px-4 py-3 text-sm font-semibold text-sub ring-1 ring-line [&::-webkit-details-marker]:hidden">
              <Icon name={icon} className="text-mute" />
              {label} {list.length}
              {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white tabular-nums">{unread}</span>}
              <svg viewBox="0 0 24 24" className="ml-auto size-4 text-mute transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            {hint && <p className="mt-2 px-1 text-[13px] text-mute">{hint}</p>}
            <div className="mt-2 space-y-2 opacity-90">{list.map(card)}</div>
          </details>
        )
        if (!shown.length) return null
        return (
          <section className="space-y-2" aria-label="단체방">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-sub">
              <Icon name="users" /> 단체방
            </h2>
            {live.length === 0 && !term && <p className="text-sm text-mute">{others.length ? '내가 참여한 진행 중 단체방이 없어요.' : '진행 중인 행사 단체방이 없어요.'}</p>}
            {live.map(card)}
            {others.length > 0 && fold('data-rooms-others', 'users', '참여 안 한 단체방', others, 0, '다른 관리자가 올린 공고의 방이에요. 들어가서 ‘참여하기’를 누르면 알림을 받아요.')}
            {past.length > 0 && fold('data-rooms-ended', 'clock', '종료된 행사 단체방', past, pastUnread)}
          </section>
        )
      })()}
      <div className="flex gap-1.5">
        <Link href={qs(false)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${!onlyUnread && !onlyNoReply ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`}>
          전체 {found.length}
        </Link>
        <Link href={qs(true)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${onlyUnread ? 'bg-rose-600 text-white' : 'bg-white text-sub ring-1 ring-line'}`}>
          안 읽음 {term ? found.filter((t) => t.unread > 0).length : unreadCount}
        </Link>
        {/* 읽고 답하지 않은 문의가 있을 때만 */}
        {(noReplyCount > 0 || onlyNoReply) && (
          <Link href={qs(false, true)} className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${onlyNoReply ? 'bg-amber-500 text-white' : 'bg-white text-sub ring-1 ring-line'}`} data-inbox-noreply-chip>
            답장 전 {noReplyCount}
          </Link>
        )}
        {/* 안 읽은 대화가 둘 이상이면 하나씩 열지 않고 한 번에 읽음 (두 번 눌러야) */}
        {unreadCount > 1 && !term && (
          <form action={markAllInquiriesRead} className="ml-auto">
            <ConfirmSubmit className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-sub ring-1 ring-line active:scale-95" confirmText="모두 읽음으로?" track="문의 모두 읽음">
              모두 읽음
            </ConfirmSubmit>
          </form>
        )}
      </div>
      {list.length === 0 ? (
        term ? (
          <Empty icon="🔍" title={`‘${term}’에 맞는 대화가 없어요`}>
            <p>근무자 이름·전화번호·메시지 내용으로 찾아요.</p>
            <Link href={onlyUnread ? '/admin/chat?unread=1' : '/admin/chat'} className="btn-gray btn-sm mt-3 inline-flex">
              검색 지우기
            </Link>
          </Empty>
        ) : (
          onlyNoReply ? (
            <Empty icon="✅" title="답장을 기다리는 문의가 없어요">읽은 문의에는 모두 답했어요.</Empty>
          ) : <Empty icon="💬" title="아직 들어온 문의가 없어요">근무자가 앱의 &lsquo;문의&rsquo;에서 보낸 메시지가 여기에 모여요.</Empty>
        )
      ) : (
        <div className="stagger space-y-2">
          {list.map(({ last, unread }) => (
            <Link key={last.thread_user_id} data-inbox-row={last.thread_user_id} href={`/admin/chat/${last.thread_user_id}`} className="card-link flex items-center gap-3 p-4">
              <span className="relative shrink-0">
                <Avatar id={last.user!.id} name={last.user!.name} photoAt={last.user!.photo_at} zoom={false} />
                {workingNow.has(last.thread_user_id) && (
                  <span role="img" aria-label="지금 근무 중" title="지금 근무 중" className="absolute right-0 bottom-0 size-3 rounded-full bg-emerald-500 ring-2 ring-white" data-inbox-working />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate font-bold">
                    {last.user!.name} <span className="text-xs font-medium text-mute">{phoneFmt(last.user!.phone)}</span>
                  </p>
                  <span className="shrink-0 text-xs text-mute">{kstDate(last.created_at) === today ? kstTime(last.created_at) : fmtDate(kstDate(last.created_at))}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {(() => {
                    // 메시지 내용으로 찾았으면 그 메시지를 보여 줌 (이름·번호로 찾았으면 마지막 메시지)
                    const hit = term && !last.user!.name.toLowerCase().includes(low) ? hitOf.get(last.thread_user_id) : undefined
                    const m = hit ?? last
                    // 바로 처리할 요청이면 종류를 짧게 (출근 확인 · 출근 기록 · 기록 정정 · 확정 문의) — 머리말 줄은 같은 말이라 빼고 내용만
                    const tag = !hit && !m.from_admin ? askTag(m.body) : null
                    const rest = tag && /^(📍|✏️)/.test(m.body) ? m.body.split('\n').slice(1).join(' ').trim() : ''
                    return (
                      <p className={`truncate text-sm ${unread ? 'font-semibold text-ink' : 'text-sub'}`} data-chat-snippet>
                        {m.from_admin && <span className="text-mute">답장: </span>}
                        {hit && <span className="mr-1 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-800">찾은 말</span>}
                        {tag && (
                          <>
                            <span className={`rounded px-1 text-[11px] font-bold ${tag.urgent ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-700'}`} data-inbox-tag={tag.urgent ? 'urgent' : 'ask'}>
                              {tag.label}
                            </span>{' '}
                          </>
                        )}
                        {rest || plainBody(m.body)}
                      </p>
                    )
                  })()}
                  {unread > 0 ? (
                    <span className="grid h-5 min-w-5 shrink-0 animate-pop place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>
                  ) : (
                    // 읽었지만 아직 답하지 않음
                    noReply({ last, unread }) && (
                      <span className="shrink-0 text-[11px] font-bold whitespace-nowrap text-amber-700" data-inbox-noreply>
                        답장 전
                      </span>
                    )
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
