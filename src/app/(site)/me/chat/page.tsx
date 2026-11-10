import type { Metadata } from 'next'
import Link from 'next/link'
import { ASK_MISSED } from '@/lib/signals'
import { sendInquiry } from '@/app/actions/chat'
import AutoRefresh from '@/components/AutoRefresh'
import Icon from '@/components/Icon'
import { CHAT_MESSAGE_COLS, ChatMessages, type ChatMessage } from '@/components/Chat'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import { getJob, getSettings, platformCompanyId, SUPPORT_NAME } from '@/lib/data'
import ReadSync from '@/components/ReadSync'
import { db, must } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { roomEnded, workerRooms, type RoomJob, type RoomLast } from '@/lib/room'
import { isUuid } from '@/lib/validate'
import { plainBody } from '@/lib/stickers'
import { fmtDate, kstDate, kstTime } from '@/lib/time'
import ChatClock from '@/components/ChatClock'

export const metadata: Metadata = { title: '문의' }

// 휴대폰으로 자주 보내는 문의 (누르면 입력칸에 채워짐, 고쳐서 보낼 수 있음)
/** 내 정보에서 '문의하기'로 왔을 때 맨 앞 빠른 답장 */
const ASK_INFO = '이름·주민번호·휴대폰 번호를 바꾸고 싶어요.'
/** 지원했는데 근무가 곧 시작인데도 확정 전일 때 (내 근무 '확정 대기' 칸의 '담당자에게 문의'로 들어옴) */
const ASK_CONFIRM = '지원했는데 확정 여부가 궁금해요.'
const QUICK_DAY = ['조금 늦을 것 같아요. 죄송합니다.', '집결 장소가 어디인가요?', '근무 시작 버튼이 안 눌려요.', '급여 지급일이 언제인가요?']
const QUICK_JOB = ['아직 지원할 수 있나요?', '근무 시간 중 일부만 가능해요.', '식사가 제공되나요?', '주차할 수 있나요?']
// 해피워크 고객센터(아직 지원한 회사가 없을 때): 근무 날 문의 대신 앱 사용 문의
const QUICK_SUPPORT = ['지원은 어떻게 하나요?', '급여는 언제 받나요?', '계좌·전화번호를 바꾸고 싶어요.', '회원 탈퇴는 어떻게 하나요?']

/** 이름 + 와/과 (받침이 있으면 '과') · 한글이 아니면 '와(과)' */
function withWa(name: string) {
  const c = name.trim().charCodeAt(name.trim().length - 1)
  if (c >= 0xac00 && c <= 0xd7a3) return `${name}${(c - 0xac00) % 28 ? '과' : '와'}`
  return `${name}와(과)`
}

export default async function ChatPage(props: PageProps<'/me/chat'>) {
  const sp = await props.searchParams
  const user = await requireUser('/me/chat')
  const jobId = typeof sp.job === 'string' && isUuid(sp.job) ? sp.job : null
  const wantCo = typeof sp.co === 'string' && isUuid(sp.co) ? sp.co : null
  // 내 정보에서 '이름·번호 바꾸기' 문의로 왔는지 (회사를 고르는 동안에도 이어짐)
  const askInfo = sp.ask === 'info'
  const askMissed = sp.ask === 'missed'
  const askConfirm = sp.ask === 'confirm'
  // 문의함은 회사마다 따로: 지원했거나 문의를 주고받은 회사들 (처음이면 기본 회사)
  // 단체방 목록(여러 번 읽음)은 먼저 출발시키고, 회사 이름 읽기와 함께 기다림
  const roomsP = workerRooms(user.id)
  roomsP.catch(() => {})
  const [job, apps, threads, platformId] = await Promise.all([
    jobId ? getJob(jobId) : null,
    db().from('applications').select('company_id').eq('user_id', user.id).then((r) => must(r) as { company_id: string }[]),
    db()
      .from('messages')
      .select('company_id, from_admin, read_at, created_at, body')
      .eq('thread_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then((r) => must(r) as { company_id: string; from_admin: boolean; read_at: string | null; created_at: string; body: string }[]),
    platformCompanyId(),
  ])
  const related = [...new Set([...threads.map((t) => t.company_id), ...apps.map((a) => a.company_id)])]
  const companyId = job?.company_id ?? (wantCo && related.includes(wantCo) ? wantCo : null) ?? threads[0]?.company_id ?? related[0] ?? platformId
  const ids = [...new Set([...related, ...(companyId ? [companyId] : [])])]
  const [{ data: companyRows }, rooms] = await Promise.all([
    ids.length ? db().from('companies').select('id, company_name').in('id', ids) : Promise.resolve({ data: [] }),
    // 같은 근무 단체방 (확정된 공고)
    roomsP,
  ])
  const companies = ((companyRows ?? []) as { id: string; company_name: string }[]).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id),
  )
  // 운영 회사(해피워크)에 그 회사 공고로 지원한 적이 없으면 '해피워크 고객센터'로 보여 줌
  const support = (id: string | null) => !!id && id === platformId && !apps.some((a) => a.company_id === id)
  const nameOf = (c: { id: string; company_name: string }) => (support(c.id) ? SUPPORT_NAME : c.company_name)
  const unreadBy = new Map<string, number>()
  for (const t of threads) if (t.from_admin && !t.read_at) unreadBy.set(t.company_id, (unreadBy.get(t.company_id) ?? 0) + 1)
  // 대화가 둘 이상이면 (회사 문의 여러 곳 · 단체방) 문의 탭은 대화 목록부터
  const many = companies.length + rooms.length >= 2
  if (many && !jobId && !wantCo) return <ChatList userId={user.id} companies={companies.map((c) => ({ id: c.id, name: nameOf(c), support: support(c.id) }))} threads={threads} unreadBy={unreadBy} rooms={rooms} askInfo={askInfo} />
  const [messages, settings] = companyId
    ? await Promise.all([
        // 최근 300개 (오래된 것부터 보여 줌)
        db()
          .from('messages')
          .select(CHAT_MESSAGE_COLS)
          .eq('company_id', companyId)
          .eq('thread_user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(300)
          .then((r) => (must(r) as unknown as ChatMessage[]).sort((a, b) => a.created_at.localeCompare(b.created_at))),
        getSettings(companyId),
        // 이 회사 담당자 답장을 읽음으로 (보는 동안 새로 온 것도 자동 갱신 때 읽음 처리)
        db()
          .from('messages')
          .update({ read_at: new Date().toISOString() })
          .eq('company_id', companyId)
          .eq('thread_user_id', user.id)
          .eq('from_admin', true)
          .is('read_at', null),
      ])
    : [[], null]

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={5} quiet pulse="/api/pulse?s=me-chat" />
      <ScrollToEnd count={messages.length} />
      {/* 열자마자 위·아래 문의 숫자를 맞추고 이 대화의 알림도 지움 */}
      {companyId && <ReadSync tag={`chat-${companyId}`} />}
      <div>
        {many && (
          <Link href="/me/chat" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-sub" data-chat-back transitionTypes={['nav-back']}>
            ← 대화 목록
          </Link>
        )}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">문의</h1>
          {companyId && messages.length > 0 && (
            <a href={`/me/chat/export?co=${companyId}`} download className="chip h-8 px-3 text-xs">
              ⬇️ 대화 저장
            </a>
          )}
        </div>
        {/* 대화가 이어지는 중이면 설명 대신 누구와의 대화인지만 한 줄 (설명은 첫 문의 때만 · 화면을 덜 차지하게) */}
        <p className="mt-1 truncate text-sm text-sub" data-chat-intro>
          {messages.length === 0 ? (
            <>궁금한 점을 남기면 {support(companyId) ? SUPPORT_NAME : (settings?.company_name ?? '담당자')}에서 확인하고 답장해 드려요.</>
          ) : (
            <>{withWa(support(companyId) ? SUPPORT_NAME : (settings?.company_name ?? '담당자'))}의 대화</>
          )}
        </p>
        {settings?.contact_phone && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-mute">급한 일은</span>
            <ContactButtons phone={settings.contact_phone} name={support(companyId) ? SUPPORT_NAME : (settings.contact_name ?? '담당자')} />
          </div>
        )}
      </div>

      {messages.length === 0 ? (
        <Empty icon="💬" sticker="hi" title="아직 주고받은 메시지가 없어요">
          아래 칸에 궁금한 점을 적어 보내 주세요.
        </Empty>
      ) : (
        // 담당자가 '근무 시작·종료' 버튼을 보냈으면 그 자리에 진짜 근무 버튼 (채팅에서 바로 누름)
        <ChatMessages
          messages={messages}
          viewer="worker"
          viewerId={user.id}
          clock={companyId && messages.some((m) => m.from_admin && /::b:clock-(in|out)::/.test(m.body)) ? <ChatClock userId={user.id} companyId={companyId} /> : undefined}
        />
      )}

      {/* 휴대폰은 아래 탭 위에, 넓은 화면은 화면 아래에 붙어 있음 */}
      <div data-vv="end" className="sticky bottom-[calc(var(--tabbar-space)+6px-var(--vv,0px))] z-10 pt-2 sm:bottom-4">
        <ChatComposer
          action={sendInquiry.bind(null, companyId ?? '', job?.id ?? null)}
          placeholder={support(companyId) ? '고객센터에 보낼 내용' : '담당자에게 보낼 내용'}
          quickReplies={askInfo ? [ASK_INFO, ...(support(companyId) ? QUICK_SUPPORT : QUICK_DAY).filter((q) => !q.startsWith('계좌·전화번호'))] : askMissed ? [ASK_MISSED, ...QUICK_DAY] : askConfirm && job ? [ASK_CONFIRM, ...QUICK_JOB.filter((q) => q !== '아직 지원할 수 있나요?')] : job ? QUICK_JOB : support(companyId) ? QUICK_SUPPORT : QUICK_DAY}
          context={
            job && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-sub">
                <span className="min-w-0 truncate rounded-md bg-white px-2 py-0.5 ring-1 ring-line">📌 {job.title}</span>
                <span className="shrink-0 whitespace-nowrap">문의</span>
                <Link href={`/me/chat?co=${job.company_id}`} className="ml-auto shrink-0 whitespace-nowrap text-mute underline">
                  공고 빼기
                </Link>
              </p>
            )
          }
        />
      </div>
    </div>
  )
}

type Thread = { company_id: string; from_admin: boolean; read_at: string | null; created_at: string; body: string }

/** 대화 목록 (카톡처럼): 회사 1:1 문의 + 같은 근무 단체방, 최근 대화 순 · 마지막 말 미리보기 · 안 읽은 수 */
async function ChatList({
  userId,
  companies,
  threads,
  unreadBy,
  rooms,
  askInfo = false,
}: {
  userId: string
  askInfo?: boolean
  companies: { id: string; name: string; support: boolean }[]
  threads: Thread[]
  unreadBy: Map<string, number>
  rooms: { id: string; title: string; start_date: string; end_date: string; status: RoomJob['status']; unread: number; last: RoomLast | null }[]
}) {
  // 단체방 마지막 말은 안 읽은 수를 셀 때 함께 읽어 옴 (workerRooms)
  const lastRoom = new Map<string, RoomLast>(rooms.filter((r) => r.last).map((r) => [r.id, r.last!]))
  // 단체방 마지막 말을 쓴 다른 근무자 이름 (단체방 안에서도 이름으로 보임)
  const others = [...new Set([...lastRoom.values()].filter((m) => !m.from_admin && m.sender_id && m.sender_id !== userId).map((m) => m.sender_id!))]
  const names = new Map(
    others.length ? (((await db().from('users').select('id, name').in('id', others)).data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]) : [],
  )
  const lastCo = new Map<string, Thread>()
  for (const t of threads) {
    const prev = lastCo.get(t.company_id)
    if (!prev || t.created_at > prev.created_at) lastCo.set(t.company_id, t)
  }
  type Row = { key: string; href: string; kind: 'room' | 'company'; title: string; icon: 'room' | 'company' | 'support'; who: string; body: string | null; at: string | null; unread: number; ended?: boolean }
  const all: Row[] = [
    ...rooms.map((r): Row => {
      const m = lastRoom.get(r.id)
      return {
        key: `r-${r.id}`,
        href: `/me/chat/room/${r.id}`,
        kind: 'room',
        title: r.title,
        icon: 'room',
        who: !m ? '' : m.from_admin ? '담당자' : m.sender_id === userId ? '나' : (names.get(m.sender_id ?? '') ?? '근무자'),
        body: m ? plainBody(m.body) : null,
        at: m?.created_at ?? null,
        unread: r.unread,
        ended: roomEnded(r),
      }
    }),
    ...companies.map((c): Row => {
      const m = lastCo.get(c.id)
      return {
        key: `c-${c.id}`,
        href: `/me/chat?co=${c.id}${askInfo ? '&ask=info' : ''}`,
        kind: 'company',
        title: c.name,
        icon: c.support ? 'support' : 'company',
        who: m && !m.from_admin ? '나' : '',
        body: m ? plainBody(m.body) : null,
        at: m?.created_at ?? null,
        unread: unreadBy.get(c.id) ?? 0,
      }
    }),
  ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  // 행사가 끝난 단체방은 아래 '종료된 행사'로 따로 모아 접어 둠 (진행 중인 대화가 위에)
  const live = all.filter((r) => !r.ended)
  const past = all.filter((r) => r.ended)
  const pastUnread = past.reduce((n, r) => n + r.unread, 0)
  const today = kstDate()
  const when = (iso: string) => (kstDate(iso) === today ? kstTime(iso) : fmtDate(kstDate(iso)))
  const unreadAll = all.reduce((n, r) => n + r.unread, 0)
  const row = (r: Row) => (
    <li key={r.key}>
      <Link href={r.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-bg" data-chat-row={r.kind} transitionTypes={['nav-forward']}>
        <span
          aria-hidden
          className={`grid size-12 shrink-0 place-items-center rounded-[18px] text-xl ${
            r.icon === 'room' ? 'bg-[linear-gradient(135deg,var(--color-brand-500),#22d3ee)] text-white' : r.icon === 'support' ? 'bg-amber-50' : 'bg-brand-50'
          }`}
        >
          {r.icon === 'room' ? (
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3 19.5a6 6 0 0 1 12 0M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17.5 13.6a6 6 0 0 1 3.5 5.9" />
            </svg>
          ) : r.icon === 'support' ? (
            <Icon name="help" className="!size-6 text-amber-600" />
          ) : (
            // 회사 문의도 단체방처럼 선 아이콘 (이모지 대신 · 다른 화면과 같은 모양)
            <Icon name="building" className="!size-6 text-brand-600" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <b className="min-w-0 truncate">{r.title}</b>
            {r.kind === 'room' && <span className="badge shrink-0 bg-brand-50 text-brand-700">단체방</span>}
            {r.at && <span className="ml-auto shrink-0 pl-1 text-xs text-mute tabular-nums">{when(r.at)}</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-sm ${r.unread > 0 ? 'font-semibold text-ink' : 'text-sub'}`}>
              {r.body ? (
                <>
                  {r.who && <span className="text-mute">{r.who}: </span>}
                  {r.body.replace(/\s+/g, ' ')}
                </>
              ) : (
                <span className="text-mute">{r.kind === 'room' ? '아직 대화가 없어요. 먼저 인사해 보세요' : '궁금한 점을 남겨 보세요'}</span>
              )}
            </span>
            {r.unread > 0 && (
              <span data-unread className="grid h-5 min-w-5 shrink-0 animate-pop place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white tabular-nums">
                {r.unread > 99 ? '99+' : r.unread}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  )

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={10} quiet pulse="/api/pulse?s=me-chat" />
      <div>
        <h1 className="text-2xl font-extrabold">문의</h1>
        <p className="mt-1 text-sm text-sub">
          {unreadAll > 0 ? (
            <>
              안 읽은 메시지 <b className="text-rose-600">{unreadAll}개</b>가 있어요.
            </>
          ) : (
            '담당자 1:1 문의와 같은 근무 단체방이 여기 모여요.'
          )}
        </p>
      </div>
      {/* 내 정보에서 '이름·번호 바꾸기'로 왔으면: 회사가 여럿이니 어느 담당자에게 보낼지 먼저 */}
      {askInfo && (
        <p className="animate-pop rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm font-semibold text-brand-700" data-ask-hint>
          이름·번호를 바꿔 달라고 할 회사를 골라 주세요
        </p>
      )}
      {live.length > 0 && (
        <ul className="card stagger divide-y divide-line overflow-hidden p-0" data-chat-list>
          {live.map(row)}
        </ul>
      )}
      {past.length > 0 && (
        <details className="group" data-chat-ended open={live.length === 0}>
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl before:hidden bg-white px-4 py-3 text-sm font-semibold text-sub ring-1 ring-line [&::-webkit-details-marker]:hidden">
            <Icon name="clock" className="text-mute" />
            종료된 행사 단체방 {past.length}
            {pastUnread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white tabular-nums">{pastUnread}</span>}
            <svg viewBox="0 0 24 24" className="ml-auto size-4 text-mute transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <ul className="card mt-2 divide-y divide-line overflow-hidden p-0 opacity-90" data-chat-list-ended>
            {past.map(row)}
          </ul>
        </details>
      )}
    </div>
  )
}
