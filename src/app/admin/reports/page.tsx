import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { won } from '@/lib/format'
import { monthlyRows } from '@/lib/reports'
import { requireAdmin } from '@/lib/session'
import { kstDate, kstDateTime, minutesText } from '@/lib/time'

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
  'export.employment': '근로내용확인신고 자료 내려받기',
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

export default async function ReportsPage(props: PageProps<'/admin/reports'>) {
  await requireAdmin()
  const sp = await props.searchParams
  const thisMonth = kstDate().slice(0, 7)
  const month = typeof sp.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : thisMonth
  const [rows, logs] = await Promise.all([
    monthlyRows(month),
    db()
      .from('audit_logs')
      .select('id, action, detail, ip, created_at, actor:users!audit_logs_actor_id_fkey(name), target:users!audit_logs_target_user_id_fkey(name)')
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
  const due = `${m === 12 ? y + 1 : y}년 ${m === 12 ? 1 : m + 1}월`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">정산 · 신고자료</h1>
        <div className="flex items-center gap-1">
          <Link href={`/admin/reports?month=${shiftMonth(month, -1)}`} className="btn-gray btn-sm">
            ◀
          </Link>
          <form className="flex gap-1">
            <input type="month" name="month" defaultValue={month} className="input py-1.5 text-sm" />
            <button className="btn-gray btn-sm">보기</button>
          </form>
          <Link href={`/admin/reports?month=${shiftMonth(month, 1)}`} className="btn-gray btn-sm">
            ▶
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(
          [
            ['근무자', `${rows.length}명`],
            ['지급총액', won(total.gross)],
            ['소득세', won(total.incomeTax)],
            ['지방소득세', won(total.localTax)],
            ['고용보험(근로자)', won(total.insurance)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="card py-4">
            <p className="text-sm text-mute">{k}</p>
            <p className="mt-1 text-xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>

      <section className="card space-y-3">
        <h2 className="font-bold">{month.replace('-', '년 ')}월 신고자료 내려받기</h2>
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/export/daily-income?month=${month}`} className="btn-primary btn-sm">
            일용근로소득 지급명세 CSV
          </a>
          <a href={`/admin/export/employment?month=${month}`} className="btn-soft btn-sm">
            근로내용확인신고(고용·산재) CSV
          </a>
          <a href={`/admin/export/business-income?month=${month}`} className="btn-gray btn-sm">
            사업소득 간이지급명세 CSV
          </a>
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-sub">
          <li>원천징수 이행상황신고·납부: {due} 10일까지 (홈택스)</li>
          <li>일용근로소득 지급명세서: {due} 말일까지 (홈택스, 매월 제출)</li>
          <li>근로내용확인신고: {due} 15일까지 (고용·산재보험 토탈서비스 또는 4대보험 정보연계센터)</li>
          <li>내려받은 파일에는 주민등록번호가 들어 있습니다. 신고 후 바로 삭제하고, 내려받은 기록은 아래 처리 기록에 남습니다.</li>
        </ul>
      </section>

      {eightPlus.length > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          이번 달 8일 이상 근무: <b>{eightPlus.map((r) => `${r.user.name}(${r.dates.length}일)`).join(', ')}</b> — 일용근로자도 월 8일 이상(또는 월 60시간
          이상) 일하면 국민연금·건강보험 사업장 가입 대상이 될 수 있으니 확인하세요.
        </p>
      )}

      <section>
        <h2 className="section-title">근무자별 합계</h2>
        {rows.length === 0 ? (
          <div className="card py-10 text-center text-mute">이 달의 근무 기록이 없습니다.</div>
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="table text-[13px]">
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
                      <div className="text-[11px] text-mute">{r.dates.map((d) => Number(d.slice(8))).join(', ')}일</div>
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
        )}
      </section>

      <section>
        <h2 className="section-title">개인정보 처리 기록</h2>
        <div className="card overflow-x-auto p-0">
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
        <p className="hint">개인정보의 안전성 확보조치 기준에 따라 접속·처리 기록은 1년 이상 보관하세요.</p>
      </section>
    </div>
  )
}
