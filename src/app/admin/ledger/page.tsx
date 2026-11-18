import type { Metadata } from 'next'
import Link from 'next/link'
import Empty from '@/components/Empty'
import Flash from '@/components/Flash'
import { isLedgerCompany, ledgerRuns, ledgerStatus, type LedgerItem, type LedgerRun } from '@/lib/ledger'
import { requireAdmin } from '@/lib/session'
import { fmtDate, kstDate, kstDateTime, kstTime } from '@/lib/time'
import LedgerPanel from '../LedgerPanel'
import { proxySecret } from '@/lib/gsheets'
import { bridgeScript } from '@/lib/ledger-script'

export const metadata: Metadata = { title: '대금 시트 연동 기록' }

const KIND: Record<LedgerItem['kind'], { head: string; tone: string }> = {
  paid: { head: '시트 → 앱 · 입금확인 → 지급 완료', tone: 'text-emerald-700' },
  export: { head: '앱 → 시트 · 장부(05)에 새 줄', tone: 'text-sky-800' },
  worker: { head: '근무자 추가 (02)', tone: 'text-sky-800' },
  project: { head: '프로젝트 추가 (03)', tone: 'text-sky-800' },
  existing: { head: '장부에 이미 있어서 건너뜀', tone: 'text-sub' },
}
const ORDER: LedgerItem['kind'][] = ['paid', 'export', 'worker', 'project', 'existing']

function itemLine(i: LedgerItem): string {
  const who = i.name ?? '알 수 없음'
  if (i.kind === 'project') return i.note || '프로젝트'
  if (i.kind === 'worker') return `${who}${i.row ? ` · ${i.row}줄` : ''}`
  const job = i.jobTitle ? ` · ${i.jobTitle}` : ''
  if (i.kind === 'export') return `${who}${job}${i.note ? ` · ${i.note}` : ''}${i.row ? ` · ${i.row}줄` : ''}`
  if (i.kind === 'paid') return `${who}${job}${i.note ? ` · ${i.note}` : ''}${i.row ? ` · 장부 ${i.row}줄` : ''}`
  return `${who}${job}`
}

/**
 * 대금 시트(거래장부) 연동 기록 — 매일 아침 7시 자동 + 버튼으로 맞춘 것마다 무엇이 바뀌었는지 (사람 · 공고 · 시트 줄)
 * 장부 회사의 관리자만 (근무자 화면에는 없음 · 이름과 공고 제목만, 주민번호·계좌는 보여 주지 않음)
 */
export default async function LedgerPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams
  const admin = await requireAdmin()
  if (!(await isLedgerCompany(admin.companyId))) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-extrabold">대금 시트 연동</h1>
        <Empty icon="📒" title="이 회사는 대금 시트를 쓰지 않아요" />
      </div>
    )
  }
  const [status, runs] = await Promise.all([ledgerStatus(admin.companyId), ledgerRuns(admin.companyId, 14)])
  const today = kstDate()
  // 날짜별로 (오늘 · 어제 · …)
  const byDay = new Map<string, LedgerRun[]>()
  for (const r of runs) {
    const d = kstDate(new Date(r.at))
    byDay.set(d, [...(byDay.get(d) ?? []), r])
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4" data-ledger-page>
      <Flash m={sp.m} />
      <div>
        <Link href="/admin/settings" className="tap text-sm font-semibold text-sub">
          ‹ 회사 설정
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold">대금 시트 연동 기록</h1>
        <p className="mt-1 text-sm text-sub">매일 아침 7시에 맞추고, 바뀐 게 있으면 관리자에게 알려요 · 최근 14일</p>
      </div>
      <LedgerPanel status={status} from="/admin/ledger" full code={status.configured ? undefined : bridgeScript(proxySecret())} />
      {runs.length === 0 ? (
        <Empty icon="📒" title="아직 연동 기록이 없어요">
          <span className="block">내일 아침 7시에 처음 맞추거나, 위 ‘지금 연동하기’를 눌러 보세요</span>
        </Empty>
      ) : (
        [...byDay].map(([day, list]) => (
          <section key={day} className="space-y-2" data-ledger-day={day}>
            <h2 className="section-title">{day === today ? '오늘' : fmtDate(day)}</h2>
            {list.map((r, idx) => {
              const groups = ORDER.map((k) => [k, r.items.filter((i) => i.kind === k)] as const).filter(([, l]) => l.length > 0)
              const changed = r.items.some((i) => i.kind !== 'existing')
              return (
                <details key={r.run} open={day === today && idx === 0} className="card group p-0" data-ledger-run={r.via} data-ok={r.ok ? '1' : '0'}>
                  <summary className="tap flex cursor-pointer list-none items-start gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${!r.ok ? 'bg-rose-500' : changed ? 'bg-sky-500' : 'bg-line'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <b className="block text-sm">
                        {kstTime(new Date(r.at)).slice(0, 5)} · {r.via === 'cron' ? '아침 자동' : r.via === 'first' ? '처음 맞춤' : `버튼${r.actor ? ` (${r.actor})` : ''}`}
                      </b>
                      <span className={`block text-[13px] ${r.ok ? 'text-sub' : 'font-semibold text-rose-600'}`} data-ledger-summary>
                        {r.ok ? r.summary : `실패 · ${r.summary.replace(/^실패: /, '')}`}
                      </span>
                    </span>
                    {groups.length > 0 && (
                      <span className="mt-0.5 shrink-0 text-xs text-mute transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none" aria-hidden>
                        ›
                      </span>
                    )}
                  </summary>
                  {groups.length > 0 && (
                    <div className="space-y-3 border-t border-line px-4 py-3">
                      {groups.map(([k, l]) => (
                        <div key={k} data-ledger-group={k}>
                          <p className={`text-xs font-bold ${KIND[k].tone}`}>
                            {KIND[k].head} · {l.length}
                          </p>
                          <ul className="mt-1 space-y-0.5 text-[13px]">
                            {l.map((i, n) => (
                              <li key={n} className="flex min-w-0 items-center gap-1.5" data-ledger-item={k}>
                                <span className="min-w-0 flex-1 truncate">{itemLine(i)}</span>
                                {i.job && (
                                  <Link href={`/admin/jobs/${i.job}?tab=pay`} className="tap shrink-0 text-xs font-semibold text-brand-600">
                                    정산 ›
                                  </Link>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      <p className="text-[11px] text-mute">{kstDateTime(r.at)} 기록 · 시트의 새 줄은 하늘색 + 비고 ‘🤖 해피워크 자동’</p>
                    </div>
                  )}
                </details>
              )
            })}
          </section>
        ))
      )}
    </div>
  )
}
