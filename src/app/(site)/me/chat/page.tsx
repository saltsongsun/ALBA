import type { Metadata } from 'next'
import Link from 'next/link'
import { ASK_CONFIRM, ASK_INVOICE, ASK_MISSED, ASK_PAYDUE, ASK_PAYLATE, invoiceTag } from '@/lib/signals'
import { partnerCompanies, partnerPayments } from '@/lib/partners'
import { won } from '@/lib/format'
import { sendInquiry } from '@/app/actions/chat'
import AutoRefresh from '@/components/AutoRefresh'
import Icon from '@/components/Icon'
import { companyInitial } from '@/components/CompanyMark'
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
const QUICK_DAY = ['조금 늦을 것 같아요. 죄송합니다.', '집결 장소가 어디인가요?', '근무 시작 버튼이 안 눌려요.', '급여 지급일이 언제인가요?']
/** 오늘 이 회사에서 근무 중이면 (이미 출근했는데 '늦어요'·'시작 버튼'은 맞지 않으니) */
const QUICK_WORKING = ['근무 종료 버튼이 안 눌려요.', '쉬는 시간이 언제인가요?', '현장 담당자를 못 찾겠어요.', '급여 지급일이 언제인가요?']
/** 오늘 이 회사 근무를 마쳤으면 */
const QUICK_DONE = ['급여 지급일이 언제인가요?', '두고 온 물건이 있어요.', '다음 근무도 할 수 있나요?']
const QUICK_JOB = ['아직 지원할 수 있나요?', '근무 시간 중 일부만 가능해요.', '식사가 제공되나요?', '주차할 수 있나요?']
// 해피워크 고객센터(아직 지원한 회사가 없을 때): 근무 날 문의 대신 앱 사용 문의
/** 지원하고 확정을 기다리는 사람 (늦어요·출근 버튼 같은 근무 날 문구 대신) */
const QUICK_WAIT = [ASK_CONFIRM, ...QUICK_JOB.filter((q) => q !== '아직 지원할 수 있나요?')]
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
  // '지난 근무'에서 정산일이 지난 입금 대기 → 첫 빠른 답이 '정산일이 지났는데 급여가 아직…'
  const askPayLate = sp.ask === 'paylate'
  // 외주 업체 '견적·대금'에서 '세금계산서 보냈으면 알리기' (어느 대금인지 · 내 대금일 때만 글을 채움)
  // · '지급일 지남 · 물어보기'도 같은 방식 (ask=paydue)
  const payId = (sp.ask === 'invoice' || sp.ask === 'paydue') && typeof sp.pay === 'string' && isUuid(sp.pay) ? sp.pay : null
  // 문의함은 회사마다 따로: 지원했거나 문의를 주고받은 회사들 (처음이면 기본 회사)
  // 단체방 목록(여러 번 읽음)은 먼저 출발시키고, 회사 이름 읽기와 함께 기다림
  const roomsP = workerRooms(user.id)
  roomsP.catch(() => {})
  const [job, apps, recentMsgs, platformId, unreadRows] = await Promise.all([
    jobId ? getJob(jobId) : null,
    db()
      .from('applications')
      .select('company_id, status, job:jobs(end_date, status)')
      .eq('user_id', user.id)
      .then((r) => must(r) as unknown as { company_id: string; status: string; job: { end_date: string; status: string } | null }[]),
    db()
      .from('messages')
      .select('company_id, from_admin, read_at, created_at, body')
      .eq('thread_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then((r) => (must(r) as Thread[]).slice(0, 500)),
    platformCompanyId(),
    // 회사별 안 읽은 답장은 따로 셈 (위 최근 500개만 세면, 다른 회사 글이 많을 때 숫자가 줄거나 그 회사가 목록에서 빠졌음)
    db()
      .from('messages')
      .select('company_id')
      .eq('thread_user_id', user.id)
      .eq('from_admin', true)
      .is('read_at', null)
      .limit(1000)
      .then((r) => (r.data ?? []) as { company_id: string }[], () => [] as { company_id: string }[]),
  ])
  // 안 읽은 답장이 있는데 최근 500개 밖이라 빠진 회사: 그 회사의 마지막 글 하나씩 더 읽어 목록에 (미리보기용 · 드묾)
  const lostCos = [...new Set(unreadRows.map((u) => u.company_id))].filter((co) => !recentMsgs.some((t) => t.company_id === co))
  const lostLast = lostCos.length
    ? (
        await Promise.all(
          lostCos.slice(0, 20).map((co) =>
            db()
              .from('messages')
              .select('company_id, from_admin, read_at, created_at, body')
              .eq('thread_user_id', user.id)
              .eq('company_id', co)
              .order('created_at', { ascending: false })
              .limit(1)
              .then((r) => ((r.data ?? []) as Thread[]).filter((t) => t.company_id === co).slice(0, 1), () => [] as Thread[]),
          ),
        )
      ).flat()
    : []
  const threads = [...recentMsgs, ...lostLast].sort((a, b) => b.created_at.localeCompare(a.created_at))
  // 나를 외주사로 등록한 회사 (대화가 아직 없어도 그 회사 문의함을 열 수 있게 — 계산서 알리기 · 고른 회사일 때만 읽음)
  const partnerCo = wantCo && payId && !threads.some((t) => t.company_id === wantCo) && !apps.some((a) => a.company_id === wantCo) ? ((await partnerCompanies(user.id)).includes(wantCo) ? wantCo : null) : null
  const related = [...new Set([...threads.map((t) => t.company_id), ...apps.map((a) => a.company_id), ...(partnerCo ? [partnerCo] : [])])]
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
  // 이 회사에 확정을 기다리는 지원만 있는지 (확정된 근무가 없고 지원만 해 둔 사람): 빠른 답을 '확정 여부가 궁금해요'부터
  const liveHere = apps.filter((x) => x.company_id === companyId && x.job && x.job.end_date >= kstDate() && x.job.status !== 'cancelled')
  const onlyWaiting = liveHere.some((x) => x.status === 'applied') && !liveHere.some((x) => x.status === 'approved')
  // 운영 회사(해피워크)에 그 회사 공고로 지원한 적이 없으면 '해피워크 고객센터'로 보여 줌
  const support = (id: string | null) => !!id && id === platformId && !apps.some((a) => a.company_id === id)
  const nameOf = (c: { id: string; company_name: string }) => (support(c.id) ? SUPPORT_NAME : c.company_name)
  const unreadBy = new Map<string, number>()
  for (const u of unreadRows) unreadBy.set(u.company_id, (unreadBy.get(u.company_id) ?? 0) + 1)
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
  // 오늘 이 회사에서: 근무 중 · 마침 · 아직 (빠른 답장을 지금 상황에 맞게) — 이 회사 기록만
  const todayAtts =
    companyId && !support(companyId)
      ? ((
          await db().from('attendance').select('clock_in, clock_out').eq('company_id', companyId).eq('user_id', user.id).eq('work_date', kstDate())
        ).data ?? []) as { clock_in: string | null; clock_out: string | null }[]
      : []
  const dayNow = todayAtts.some((a) => a.clock_in && !a.clock_out) ? 'working' : todayAtts.some((a) => a.clock_out) ? 'done' : null
  const quickDay = dayNow === 'working' ? QUICK_WORKING : dayNow === 'done' ? QUICK_DONE : QUICK_DAY
  // 이 회사에서 받을 내 대금이면: '세금계산서를 보냈어요. 개막식 음향 · 1,500,000원'을 첫 빠른 답장으로
  const askPay = payId && companyId ? (await partnerPayments(user.id).catch(() => [])).find((x) => x.id === payId && x.company_id === companyId) : null
  const invoiceAsk = askPay && sp.ask === 'invoice' && !askPay.invoice_at ? `${ASK_INVOICE} ${invoiceTag(askPay.title, won(askPay.amount))}` : null
  // 지급일이 지난 내 대금이면: '대금 지급일이 지났어요. 확인 부탁드려요. 개막식 음향 · 1,500,000원 (지급 예정 11/16(월))'
  const paydueAsk =
    askPay && sp.ask === 'paydue' && !askPay.paid_at && askPay.due_date && askPay.due_date < kstDate()
      ? `${ASK_PAYDUE} ${invoiceTag(askPay.title, won(askPay.amount))} (지급 예정 ${fmtDate(askPay.due_date)})`
      : null

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={5} quiet pulse="/api/pulse?s=me-chat" />
      <ScrollToEnd count={messages.length} />
      {/* 열자마자 위·아래 문의 숫자를 맞추고 이 대화의 알림도 지움 */}
      {companyId && <ReadSync tag={`chat-${companyId}`} />}
      <div>
        {many && (
          <Link href="/me/chat" className="tap mb-2 inline-flex items-center gap-1 text-sm font-semibold text-sub" data-chat-back transitionTypes={['nav-back']}>
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
          quickReplies={paydueAsk ? [paydueAsk] : invoiceAsk ? [invoiceAsk] : askInfo ? [ASK_INFO, ...(support(companyId) ? QUICK_SUPPORT : QUICK_DAY).filter((q) => !q.startsWith('계좌·전화번호'))] : askMissed ? [ASK_MISSED, ...QUICK_DAY] : askPayLate ? [ASK_PAYLATE, ...QUICK_DONE.filter((q) => !q.startsWith('급여'))] : askConfirm && job ? QUICK_WAIT : job ? QUICK_JOB : support(companyId) ? QUICK_SUPPORT : onlyWaiting ? QUICK_WAIT : quickDay}
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
  rooms: { id: string; title: string; company_id: string; start_date: string; end_date: string; status: RoomJob['status']; unread: number; last: RoomLast | null }[]
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
  type Row = { key: string; href: string; kind: 'room' | 'company'; title: string; icon: 'room' | 'company' | 'support'; who: string; body: string | null; at: string | null; unread: number; ended?: boolean; co?: string }
  // 여러 회사 일을 하면 단체방 줄에 어느 회사 방인지 (공고 이름만으로는 헷갈리지 않게 · 한 회사면 그대로)
  const coName = new Map(companies.map((c) => [c.id, c.name]))
  const roomCos = new Set(rooms.map((r) => r.company_id))
  const multiCo = new Set([...roomCos, ...companies.filter((c) => !c.support).map((c) => c.id)]).size >= 2
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
        co: multiCo ? coName.get(r.company_id) : undefined,
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
            // 회사 문의: 회사 이름 첫 글자 (같은 건물 아이콘이 여러 줄이면 어느 회사인지 한눈에 안 보임)
            <span data-company-mark className="text-lg font-extrabold text-brand-700">
              {companyInitial(r.title)}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <b className="min-w-0 truncate">{r.title}</b>
            {r.kind === 'room' && <span className="badge shrink-0 bg-brand-50 text-brand-700">단체방</span>}
            {r.at && <span className="ml-auto shrink-0 pl-1 text-xs text-mute tabular-nums">{when(r.at)}</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={`flex min-w-0 flex-1 items-center text-sm ${r.unread > 0 ? 'font-semibold text-ink' : 'text-sub'}`}>
              {/* 어느 회사 단체방인지 (여러 회사일 때만 · 긴 이름은 줄임) */}
              {r.co && (
                <>
                  <span className="max-w-[45%] shrink-0 truncate font-medium text-mute" data-room-co>
                    {r.co}
                  </span>
                  <span aria-hidden className="shrink-0 px-1 text-mute">
                    ·
                  </span>
                </>
              )}
              <span className="min-w-0 flex-1 truncate">
                {r.body ? (
                  <>
                    {r.who && <span className="text-mute">{r.who}: </span>}
                    {r.body.replace(/\s+/g, ' ')}
                  </>
                ) : (
                  <span className="text-mute">{r.kind === 'room' ? '아직 대화가 없어요. 먼저 인사해 보세요' : '궁금한 점을 남겨 보세요'}</span>
                )}
              </span>
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
