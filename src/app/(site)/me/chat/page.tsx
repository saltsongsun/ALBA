import type { Metadata } from 'next'
import Link from 'next/link'
import { sendInquiry } from '@/app/actions/chat'
import AutoRefresh from '@/components/AutoRefresh'
import { CHAT_MESSAGE_COLS, ChatMessages, type ChatMessage } from '@/components/Chat'
import ChatComposer, { ScrollToEnd } from '@/components/ChatComposer'
import { ContactButtons } from '@/components/Contact'
import Empty from '@/components/Empty'
import { getJob, getSettings, platformCompanyId, SUPPORT_NAME } from '@/lib/data'
import ReadSync from '@/components/ReadSync'
import { db, must } from '@/lib/db'
import { requireUser } from '@/lib/session'
import { workerRooms } from '@/lib/room'
import { isUuid } from '@/lib/validate'

export const metadata: Metadata = { title: '문의' }

// 휴대폰으로 자주 보내는 문의 (누르면 입력칸에 채워짐, 고쳐서 보낼 수 있음)
const QUICK_DAY = ['조금 늦을 것 같아요. 죄송합니다.', '집결 장소가 어디인가요?', '근무 시작 버튼이 안 눌려요.', '급여 지급일이 언제인가요?']
const QUICK_JOB = ['아직 지원할 수 있나요?', '근무 시간 중 일부만 가능해요.', '식사가 제공되나요?', '주차할 수 있나요?']

export default async function ChatPage(props: PageProps<'/me/chat'>) {
  const sp = await props.searchParams
  const user = await requireUser('/me/chat')
  const jobId = typeof sp.job === 'string' && isUuid(sp.job) ? sp.job : null
  const wantCo = typeof sp.co === 'string' && isUuid(sp.co) ? sp.co : null
  // 문의함은 회사마다 따로: 지원했거나 문의를 주고받은 회사들 (처음이면 기본 회사)
  const [job, apps, threads, platformId, rooms] = await Promise.all([
    jobId ? getJob(jobId) : null,
    db().from('applications').select('company_id').eq('user_id', user.id).then((r) => must(r) as { company_id: string }[]),
    db()
      .from('messages')
      .select('company_id, from_admin, read_at, created_at')
      .eq('thread_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then((r) => must(r) as { company_id: string; from_admin: boolean; read_at: string | null; created_at: string }[]),
    platformCompanyId(),
    // 같은 근무 단체방 (확정된 공고)
    workerRooms(user.id),
  ])
  const related = [...new Set([...threads.map((t) => t.company_id), ...apps.map((a) => a.company_id)])]
  const companyId = job?.company_id ?? (wantCo && related.includes(wantCo) ? wantCo : null) ?? threads[0]?.company_id ?? related[0] ?? platformId
  const ids = [...new Set([...related, ...(companyId ? [companyId] : [])])]
  const { data: companyRows } = ids.length
    ? await db().from('companies').select('id, company_name').in('id', ids)
    : { data: [] }
  const companies = ((companyRows ?? []) as { id: string; company_name: string }[]).sort(
    (a, b) => ids.indexOf(a.id) - ids.indexOf(b.id),
  )
  // 운영 회사(해피워크)에 그 회사 공고로 지원한 적이 없으면 '해피워크 고객센터'로 보여 줌
  const support = (id: string | null) => !!id && id === platformId && !apps.some((a) => a.company_id === id)
  const nameOf = (c: { id: string; company_name: string }) => (support(c.id) ? SUPPORT_NAME : c.company_name)
  const unreadBy = new Map<string, number>()
  for (const t of threads) if (t.from_admin && !t.read_at) unreadBy.set(t.company_id, (unreadBy.get(t.company_id) ?? 0) + 1)
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
      <AutoRefresh seconds={5} quiet />
      <ScrollToEnd count={messages.length} />
      {/* 열자마자 위·아래 문의 숫자를 맞추고 이 대화의 알림도 지움 */}
      {companyId && <ReadSync tag={`chat-${companyId}`} />}
      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">문의</h1>
          {companyId && messages.length > 0 && (
            <a href={`/me/chat/export?co=${companyId}`} download className="chip h-8 px-3 text-xs">
              ⬇️ 대화 저장
            </a>
          )}
        </div>
        {/* 같은 근무 단체방 */}
        {rooms.length > 0 && (
          <section className="mt-3" aria-label="단체방">
            <p className="mb-1.5 text-xs font-semibold text-mute">👥 같은 근무 단체방</p>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {rooms.map((r) => (
                <Link key={r.id} href={`/me/chat/room/${r.id}`} className="chip max-w-[15rem] shrink-0">
                  <span className="truncate">{r.title}</span>
                  {r.unread > 0 && <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{r.unread}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
        <p className="mt-1 text-sm text-sub">
          궁금한 점을 남기면 {support(companyId) ? SUPPORT_NAME : (settings?.company_name ?? '담당자')}에서 확인하고 답장해 드려요.
        </p>
        {/* 여러 회사와 일하면 회사별 문의함 */}
        {companies.length > 1 && (
          <nav aria-label="회사" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {companies.map((c) => (
              <Link
                key={c.id}
                href={`/me/chat?co=${c.id}`}
                aria-current={c.id === companyId ? 'page' : undefined}
                className={c.id === companyId ? 'chip-primary' : 'chip'}
              >
                {nameOf(c)}
                {c.id !== companyId && (unreadBy.get(c.id) ?? 0) > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unreadBy.get(c.id)}</span>
                )}
              </Link>
            ))}
          </nav>
        )}
        {settings?.contact_phone && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-mute">급한 일은</span>
            <ContactButtons phone={settings.contact_phone} name={support(companyId) ? SUPPORT_NAME : (settings.contact_name ?? '담당자')} />
          </div>
        )}
      </div>

      {messages.length === 0 ? (
        <Empty icon="💬" title="아직 주고받은 메시지가 없어요">
          아래 칸에 궁금한 점을 적어 보내 주세요.
        </Empty>
      ) : (
        <ChatMessages messages={messages} viewer="worker" />
      )}

      {/* 휴대폰은 아래 탭 위에, 넓은 화면은 화면 아래에 붙어 있음 */}
      <div className="sticky bottom-[calc(69px+env(safe-area-inset-bottom))] z-10 pt-2 sm:bottom-4">
        <ChatComposer
          action={sendInquiry.bind(null, companyId ?? '', job?.id ?? null)}
          placeholder={support(companyId) ? '고객센터에 보낼 내용' : '담당자에게 보낼 내용'}
          quickReplies={job ? QUICK_JOB : QUICK_DAY}
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
