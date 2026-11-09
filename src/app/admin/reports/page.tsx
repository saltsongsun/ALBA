import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { monthlyRows } from '@/lib/reports'
import { requireAdmin } from '@/lib/session'
import { kstDate, kstDateTime, minutesText } from '@/lib/time'
import Icon from '@/components/Icon'
import Flash from '@/components/Flash'
import ReportDownloads from '@/components/ReportDownloads'

export const metadata: Metadata = { title: '정산 · 신고자료' }

const ACTIONS: Record<string, string> = {
  'rrn.view': '주민번호 열람',
  'pin.reset': '비밀번호 초기화',
  'user.edit': '근무자 정보 수정',
  'attendance.edit': '출퇴근 보정',
  'attendance.add': '출퇴근 수기 등록',
  'attendance.delete': '출퇴근 삭제',
  'pay.mark_paid': '지급 처리',
  'pay.unmark_paid': '지급 취소',
  'doc.void': '서류 무효',
  'doc.rerequest': '재서명 요청',
  'job.delete': '공고 삭제',
  'export.settlement': '정산표 내려받기',
  'export.workers': '근로자 명부 내려받기',
  'export.daily_income': '일용근로소득 자료 내려받기',
  'export.business_income': '사업소득 자료 내려받기',
  'export.other_income': '기타소득 자료 내려받기',
  'export.employment': '근로내용확인신고 자료 내려받기',
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

export default async function ReportsPage(props: PageProps<'/admin/reports'>) {
  const admin = await requireAdmin()
  const sp = await props.searchParams
  const thisMonth = kstDate().slice(0, 7)
  const month = typeof sp.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : thisMonth
  const [rows, logs] = await Promise.all([
    monthlyRows(month, admin.companyId),
    db()
      .from('audit_logs')
      .select('id, action, detail, ip, created_at, actor:users!audit_logs_actor_id_fkey(name), target:users!audit_logs_target_user_id_fkey(name)').eq('company_id', admin.companyId)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(
        (r) =>
          must(r) as unknown as {
            id: number
            action: string
            detail: string | null
            ip: string | null
            created_at: string
            actor: { name: string } | null
            target: { name: string } | null
          }[],
      ),
  ])
  const total = rows.reduce(
    (t, r) => ({
      gross: t.gross + r.gross,
      incomeTax: t.incomeTax + r.incomeTax,
      localTax: t.localTax + r.localTax,
      insurance: t.insurance + r.insurance,
      net: t.net + r.net,
    }),
    { gross: 0, incomeTax: 0, localTax: 0, insurance: 0, net: 0 },
  )
  const eightPlus = rows.filter((r) => r.dates.length >= 8)
  const [y, m] = month.split('-').map(Number)
  const dueY = m === 12 ? y + 1 : y
  const dueM = m === 12 ? 1 : m + 1
  // 신고 기한은 다음 달 (올해가 아니면 연도까지)
  const due = dueY === Number(thisMonth.slice(0, 4)) ? `${dueM}월` : `${dueY}년 ${dueM}월`
  // 아직 안 끝난 근무: 오늘 근무 중 · 퇴근 기록 없음 (금액·신고자료에 아직 안 들어감)
  const today = kstDate()
  const open = rows.flatMap((r) => r.open.map((o) => ({ ...o, user: r.user })))
  const live = open.filter((o) => o.date === today)
  const missing = open.filter((o) => o.date !== today).sort((a, b) => a.date.localeCompare(b.date))
  const fix = missing[0]
  const fixHref = fix ? `/admin/jobs/${fix.jobId}?tab=att&date=${fix.date}&fix=${fix.user.id}#att-${fix.user.id}` : null
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  const isThisMonth = month === thisMonth

  return (
    <div className="space-y-5">
      <Flash m={sp.m} />
      <h1 className="text-2xl font-extrabold">정산 · 신고자료</h1>

      {/* 달 고르기: 양쪽 화살표 칸 · 가운데 '2026년 11월' (주간 화면과 같은 모양 · 영어 달 이름 없음) */}
      <nav className="flex items-center gap-1.5 rounded-2xl bg-white p-1.5 ring-1 ring-line" aria-label="달 고르기" data-month-nav>
        <Link href={`/admin/reports?month=${shiftMonth(month, -1)}`} className="grid size-10 shrink-0 place-items-center rounded-xl text-lg font-bold text-sub active:bg-bg" aria-label="지난 달" data-month-prev>
          ‹
        </Link>
        <Link href="/admin/reports" className="min-w-0 flex-1 text-center text-sm leading-tight font-bold whitespace-nowrap" data-month-label>
          <span className={`block text-[11px] font-semibold ${isThisMonth ? 'text-brand-600' : 'text-mute'}`}>{isThisMonth ? '이번 달' : '이번 달로'}</span>
          {y}년 {m}월
        </Link>
        <Link href={`/admin/reports?month=${shiftMonth(month, 1)}`} className="grid size-10 shrink-0 place-items-center rounded-xl text-lg font-bold text-sub active:bg-bg" aria-label="다음 달" data-month-next>
          ›
        </Link>
      </nav>

      {/* 한눈에: 지급총액만 크게 · 세금·보험은 아래 작은 세 칸 */}
      <section className="card space-y-3" data-report-summary>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-mute">지급총액</p>
            <p className="truncate text-2xl font-extrabold tabular-nums" data-report-gross>
              {won(total.gross)}
            </p>
          </div>
          <p className="shrink-0 pb-1 text-sm text-sub">
            근무자 <b className="text-ink">{rows.length}명</b>
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
          {(
            [
              ['소득세', total.incomeTax, undefined],
              ['지방소득세', total.localTax, undefined],
              ['고용보험', total.insurance, '근로자 부담분'],
            ] as const
          ).map(([k, v, t]) => (
            <div key={k} className="min-w-0" title={t}>
              <dt className="truncate text-[11px] font-semibold text-mute">{k}</dt>
              <dd className="truncate text-sm font-bold tabular-nums">{won(v)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {missing.length > 0 && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" data-report-missing>
          <b className="block">퇴근 기록이 없는 근무 {missing.length}건</b>
          <span className="block truncate text-xs">
            {missing
              .slice(0, 3)
              .map((o) => `${o.user.name} ${md(o.date)}`)
              .join(' · ')}
            {missing.length > 3 && ` 외 ${missing.length - 3}건`}
          </span>
          <span className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>금액·신고자료에서 빠져 있어요</span>
            {fixHref && (
              <Link href={fixHref} className="font-bold whitespace-nowrap underline-offset-2 hover:underline" data-report-fix>
                출퇴근에서 고치기 →
              </Link>
            )}
          </span>
        </div>
      )}
      {live.length > 0 && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" data-report-live>
          오늘 근무 중 {live.length}건은 퇴근하면 들어가요.
        </p>
      )}

      <section className="card space-y-3" data-report-downloads>
        <h2 className="font-bold">신고자료 내려받기</h2>
        <ReportDownloads
          incomplete={open.length}
          files={[
            { key: 'daily', href: `/admin/export/daily-income?month=${month}`, label: '일용근로소득 지급명세', note: `${due} 말일까지 · 홈택스` },
            { key: 'employment', href: `/admin/export/employment?month=${month}`, label: '근로내용확인신고 (고용·산재)', note: `${due} 15일까지 · 고용·산재 토탈서비스` },
            { key: 'business', href: `/admin/export/business-income?month=${month}`, label: '사업소득 간이지급명세' },
            { key: 'other', href: `/admin/export/other-income?month=${month}`, label: '기타소득 지급명세' },
          ]}
        />
        <ul className="space-y-0.5 text-xs text-sub" data-report-notes>
          <li>원천세 신고·납부: {due} 10일까지 · 홈택스</li>
          <li className="flex items-start gap-1">
            <Icon name="shield" className="mt-px shrink-0 text-[13px] text-mute" />
            <span>파일에 주민등록번호가 있어요. 신고 후 바로 지워 주세요 (받은 기록은 아래에 남아요).</span>
          </li>
        </ul>
      </section>

      {eightPlus.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" data-report-eight>
          <b className="block">이번 달 8일 이상: {eightPlus.map((r) => `${r.user.name}(${r.dates.length}일)`).join(', ')}</b>
          <span className="block text-xs">월 8일(또는 60시간) 이상이면 일용근로자도 국민연금·건강보험 가입 대상일 수 있어요.</span>
        </p>
      )}

      <section>
        <h2 className="section-title">근무자별 합계</h2>
        {rows.length === 0 ? (
          <div className="card py-10 text-center text-mute">이 달의 근무 기록이 없어요.</div>
        ) : (
          <div className="card overflow-hidden p-0">
          <div className="fade-r overflow-x-auto" data-report-table>
            {/* 옆으로 밀어도 성명 칸은 왼쪽에 남게 */}
            <table className="table table-pin text-[13px]">
              <thead>
                <tr>
                  <th>성명</th>
                  <th>근무일</th>
                  <th>인정시간</th>
                  <th className="text-right">지급총액</th>
                  <th className="text-right">소득세</th>
                  <th className="text-right">지방세</th>
                  <th className="text-right">고용보험</th>
                  <th className="text-right">실지급액</th>
                  <th>행사</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user.id}>
                    <td className="font-semibold whitespace-nowrap">
                      <Link href={`/admin/workers/${r.user.id}`}>{r.user.name}</Link>
                    </td>
                    <td className="whitespace-nowrap">
                      {r.dates.length}일
                      {r.dates.length > 0 && <div className="text-[11px] text-mute">{r.dates.map((d) => Number(d.slice(8))).join(', ')}일</div>}
                      {/* 아직 안 끝난 근무 (금액에 안 들어간 날) */}
                      {r.open.some((o) => o.date !== today) ? (
                        <div className="text-[11px] font-semibold text-amber-700" data-row-open>
                          퇴근 기록 없음 {r.open.filter((o) => o.date !== today).length}
                        </div>
                      ) : (
                        r.open.length > 0 && (
                          <div className="text-[11px] font-semibold text-emerald-700" data-row-open>
                            오늘 근무 중
                          </div>
                        )
                      )}
                    </td>
                    <td className="whitespace-nowrap">{minutesText(r.paidMin)}</td>
                    <td className="text-right">{won(r.gross)}</td>
                    <td className="text-right">{won(r.incomeTax)}</td>
                    <td className="text-right">{won(r.localTax)}</td>
                    <td className="text-right">{won(r.insurance)}</td>
                    <td className="text-right font-bold">{won(r.net)}</td>
                    <td className="max-w-56 truncate text-xs text-sub">{[...new Set(r.jobs)].join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </section>

      {/* 개인정보 처리 기록: 접어 두기 (필요할 때 펼쳐 보기) */}
      <details className="group" data-audit-log>
        <summary className="section-title cursor-pointer">
          개인정보 처리 기록 <span className="text-xs font-semibold text-mute">· 최근 {logs.length}건</span>
        </summary>
        <div className="card overflow-hidden p-0">
        <div className="fade-r overflow-x-auto">
          <table className="table text-[13px]">
            <thead>
              <tr>
                <th>시각</th>
                <th>처리자</th>
                <th>내용</th>
                <th>대상</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-mute">
                    기록 없음
                  </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{kstDateTime(l.created_at)}</td>
                  <td>{l.actor?.name ?? '-'}</td>
                  <td>
                    {ACTIONS[l.action] ?? l.action}
                    {l.detail && <span className="ml-1 text-mute">{l.detail}</span>}
                  </td>
                  <td>{l.target?.name ?? ''}</td>
                  <td className="text-mute">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
        <p className="hint">개인정보의 안전성 확보조치 기준에 따라 접속·처리 기록은 1년 이상 보관하세요.</p>
      </details>
    </div>
  )
}
