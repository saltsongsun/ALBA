import Icon from '@/components/Icon'
import PayTools from '@/components/PayTools'
import Link from 'next/link'
import { announcePayday, nudgeWorkers, setAllPaid, setPaid } from '@/app/actions/admin'
import { GroupContact } from '@/components/GroupContact'
import { ConfirmSubmit, SubmitButton } from '@/components/ui'
import { decrypt } from '@/lib/crypto'
import { maskAccount, won } from '@/lib/format'
import { calcDay, settle, TAX_LABEL, workingToday } from '@/lib/pay'
import { fmtDate, kstDate, kstDateTime, minutesText } from '@/lib/time'
import { paydayGuess } from '@/lib/payday'
import { parsePayday, SIGNAL } from '@/lib/signals'
import type { Attendance, Job, VendorPayment } from '@/lib/types'
import { db } from '@/lib/db'
import { payState } from '@/lib/vendors'
import { weeklyPayMap } from '@/lib/weekly'
import type { WorkerLite } from './page'
import TransferCopy from '@/components/TransferCopy'
import LiveNumber from '@/components/LiveNumber'

export default async function PayTab({ job, atts, users, origin }: { job: Job; atts: Attendance[]; users: Map<string, WorkerLite>; origin: string }) {
  // 이 행사의 외주 비용 (협력업체 대금) → 인건비와 합쳐 행사 비용 합계
  const vpays = await db()
    .from('vendor_payments')
    .select('*').eq('company_id', job.company_id)
    .eq('job_id', job.id)
    .then((r) => (r.error ? [] : (r.data as VendorPayment[]).filter((p) => p.job_id === job.id)))
  const vnames = vpays.length
    ? await db()
        .from('vendors')
        .select('id, name').eq('company_id', job.company_id)
        .in('id', [...new Set(vpays.map((p) => p.vendor_id))])
        .then((r) => new Map(((r.data ?? []) as { id: string; name: string }[]).map((v) => [v.id, v.name])))
    : new Map<string, string>()
  const userIds = [...new Set(atts.map((a) => a.user_id))]
  // 주휴수당: 같은 회사 여러 공고를 합쳐 주(월~일)마다 요건을 확인 → 그 주 마지막 근무일 기록에 붙음 (lib/weekly)
  const weekly = await weeklyPayMap(job.company_id, atts).catch(() => new Map<string, number>())
  const wk = (a: Attendance) => ({ ...a, weekly_pay: weekly.get(a.id) ?? 0 })
  const rows = userIds
    .map((uid) => {
      const mine = atts.filter((a) => a.user_id === uid)
      const done = mine.filter((a) => a.clock_out)
      return {
        uid,
        user: users.get(uid),
        s: settle(job, mine.map((a) => calcDay(job, wk(a)))),
        paid: done.length > 0 && done.every((a) => a.paid),
        done: done.length,
        unconfirmed: done.filter((a) => !a.confirmed).length,
      }
    })
    .sort((a, b) => (a.user?.name ?? '').localeCompare(b.user?.name ?? '', 'ko'))
  const sum = (k: 'gross' | 'incomeTax' | 'localTax' | 'insurance' | 'deduction' | 'net' | 'paidMin' | 'days') =>
    rows.reduce((t, r) => t + r.s[k], 0)
  const incomplete = rows.reduce((t, r) => t + r.s.incomplete, 0)
  const unconfirmed = rows.reduce((t, r) => t + r.unconfirmed, 0)
  // 계좌가 없으면 입금을 못 하므로 정산 전에 한 번에 요청
  const noAccount = rows.filter((r) => !r.user?.bank_account_enc)
  const unpaid = rows.filter((r) => r.done > 0 && !r.paid)
  // 계약 종료 시각 이후 기록이 있는데 아직 서로 확인이 안 끝난 근무 (금액에서 빠져 있음)
  const otWaiting = atts.filter((a) => a.clock_out && calcDay(job, a).otOpen).length
  // 오늘 아직 근무 중(퇴근 전)은 따로: 고칠 일이 아니라 퇴근하면 금액에 들어감
  const todayKst = kstDate()
  const live = workingToday(atts, todayKst)
  // 지난날 퇴근 기록이 없는 근무 → 출퇴근 탭의 그 날짜·그 사람으로 바로 가서 고치기
  const missing = atts.filter((a) => a.clock_in && !a.clock_out && a.work_date !== todayKst).sort((a, b) => a.work_date.localeCompare(b.work_date))
  const fixHref = missing[0] ? `/admin/jobs/${job.id}?tab=att&date=${missing[0].work_date}&fix=${missing[0].user_id}#att-${missing[0].user_id}` : null

  // 한눈에: 지급할 사람 중 몇 명에게 보냈는지 · 남은 금액 (계산은 위 정산과 같은 값 — 규칙은 그대로)
  const payable = rows.filter((r) => r.done > 0)
  const paidN = payable.filter((r) => r.paid).length
  const leftWon = unpaid.reduce((t, r) => t + r.s.net, 0)
  const paidPct = payable.length ? Math.round((paidN / payable.length) * 100) : 0
  // 정산 예정일: 마지막으로 알린 것 (근무자 문의함에 남은 안내) · 처음 고를 날짜는 공고의 지급일 글자로 짐작
  const lastPayday = userIds.length
    ? await db()
        .from('messages')
        .select('body, created_at')
        .eq('company_id', job.company_id)
        .eq('job_id', job.id)
        .eq('from_admin', true)
        .like('body', `${SIGNAL.payday}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .then((r) => {
          const m = ((r.data ?? []) as { body: string; created_at: string }[]).filter((x) => x.body.startsWith(SIGNAL.payday)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
          return m ? { label: parsePayday(m.body), at: kstDateTime(m.created_at) } : null
        })
    : null
  const guess = paydayGuess(job.pay_day, job.end_date)

  return (
    <div className="space-y-4">
      {/* 정산 예정일 알리기: 일한 근무자 모두에게 앱 알림 + 문의함, 근무자 '지난 근무'에 그 날짜가 보임 */}
      {userIds.length > 0 && unpaid.length > 0 && (
        <form action={announcePayday.bind(null, job.id)} className="card space-y-3" data-payday>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold">💰 정산 예정일 알리기</h3>
              <p className="text-xs text-sub" data-payday-last>
                {lastPayday?.label ? `${lastPayday.at}에 '${lastPayday.label}'로 알렸어요` : `일한 근무자 ${userIds.length}명에게 언제 들어오는지 알려요`}
              </p>
            </div>
            {job.pay_day && <span className="badge shrink-0 bg-bg text-sub">지급일 {job.pay_day}</span>}
          </div>
          <div className="flex gap-2">
            <input type="date" name="payday" required defaultValue={guess?.date ?? ''} min={job.end_date} className="input min-w-0 flex-1" aria-label="정산 예정일" />
            <SubmitButton className="btn-primary shrink-0" pendingText="알리는 중…" track="정산 예정일 알리기">
              {userIds.length}명에게 알리기
            </SubmitButton>
          </div>
          <input name="memo" maxLength={80} className="input" placeholder="덧붙일 말 (선택) · 예: 오후 중 순서대로 입금돼요" aria-label="덧붙일 말" />
          {guess && <p className="hint">지급일 ‘{job.pay_day}’로 {fmtDate(guess.date)}을 골라 두었어요{guess.until ? ' (이날까지)' : ''}.</p>}
        </form>
      )}
      {payable.length > 0 && (
        <div className="card space-y-3" data-pay-summary>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0">
              <p className="text-xs text-mute">실수령 합계</p>
              <p className="mt-0.5 truncate text-lg font-extrabold">
                <LiveNumber value={sum('net')} countUp />
                <span className="text-sm font-bold">원</span>
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-mute">지급 완료</p>
              <p className={`mt-0.5 text-lg font-extrabold ${paidN === payable.length ? 'text-emerald-600' : ''}`} data-paid-count>
                <LiveNumber value={paidN} />
                <span className="text-sm font-bold text-mute">/{payable.length}명</span>
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-mute">남은 지급</p>
              <p className={`mt-0.5 truncate text-lg font-extrabold ${leftWon > 0 ? 'text-rose-600' : 'text-emerald-600'}`} data-left>
                {leftWon > 0 ? (
                  <>
                    <LiveNumber value={leftWon} countUp />
                    <span className="text-sm font-bold">원</span>
                  </>
                ) : (
                  '없음'
                )}
              </p>
            </div>
          </div>
          {/* 지급 진행 막대 (보낸 사람 비율) */}
          <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="지급 진행" aria-valuenow={paidPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full origin-left rounded-full bg-emerald-500 transition-transform duration-500" style={{ transform: `scaleX(${paidPct / 100})` }} />
          </div>
          {/* 주휴수당이 붙은 사람 (같은 회사 여러 공고를 합쳐 주마다 확인 → 그 주 마지막 근무일 정산에 들어감) */}
          {(() => {
            const wp = rows.filter((r) => r.s.weeklyPay > 0)
            if (!wp.length) return null
            return (
              <Link href={`/admin/weekly?w=${job.start_date}`} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800" data-weekly-note>
                <span className="min-w-0 flex-1">
                  <b className="block">주휴수당 {wp.length}명 · {won(wp.reduce((t, r) => t + r.s.weeklyPay, 0))} 포함</b>
                  <span className="block">한 주 15시간 이상 · 개근한 주 (여러 공고 합산)</span>
                </span>
                <span className="shrink-0 font-semibold">주간 보기 →</span>
              </Link>
            )
          })()}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sub">
          {job.pay_type === 'daily' ? `일급 ${won(job.daily_wage)}` : `시급 ${won(job.hourly_wage)}`} · {TAX_LABEL[job.tax_type]}
          {job.tax_type === 'daily' && job.employment_insurance ? ' · 고용보험 0.9%' : ''}
          {job.premium_enabled ? ' · 연장·야간 가산' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {unpaid.length > 0 && (
            <form action={setAllPaid.bind(null, job.id)}>
              <ConfirmSubmit
                className="btn-soft btn-sm"
                confirmText={
                  // 연장 확인·퇴근 기록·계좌가 덜 정리됐으면 한 번 더 알려 줌 (금액이 빠졌거나 입금을 못 했을 수 있어서)
                  otWaiting || incomplete || unpaid.some((r) => !r.user?.bank_account_enc)
                    ? `정리 안 된 근무·계좌가 있어요 · ${unpaid.length}명 지급 완료?`
                    : `${unpaid.length}명 지급 완료로 바꾸고 알릴까요?`
                }
              >
                미지급 {unpaid.length}명 모두 지급 완료
              </ConfirmSubmit>
            </form>
          )}
          {unpaid.length > 0 && <TransferCopy jobId={job.id} />}
          {/* 급여 설정 · 정산표 엑셀 · 명세서 인쇄 (같은 크기 칸 한 줄 · 안 끝난 근무가 있으면 엑셀은 한 번 멈춤) */}
          <PayTools
            settingsHref={`/admin/jobs/${job.id}/edit`}
            csvHref={`/admin/export/settlement?job=${job.id}`}
            printHref={rows.length > 0 ? `/print/payslip/${job.id}` : null}
            incomplete={incomplete}
          />
        </div>
      </div>
      {noAccount.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p className="min-w-0 flex-1">
            계좌 미등록 <b>{noAccount.length}명</b>: {noAccount.map((r) => r.user?.name ?? '알 수 없음').join(', ')}
          </p>
          <GroupContact
            copy={false}
            className="chip-primary"
            phones={noAccount.map((r) => r.user?.phone)}
            label={`${noAccount.length}명에게 계좌 등록 요청`}
            body={`[${job.title}] 급여를 보내 드리려면 계좌가 필요해요. 앱의 내 정보에서 급여 계좌를 등록해 주세요.\n${origin}/me/profile`}
          />
          {/* 앱 문의함 + 휴대폰 알림 (누르면 바로 등록 화면으로) */}
          <form action={nudgeWorkers.bind(null, job.id, 'account', null)}>
            <ConfirmSubmit className="chip" confirmText={`${noAccount.length}명에게 보낼까요?`}>
              앱 알림
            </ConfirmSubmit>
          </form>
        </div>
      )}
      {live > 0 && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" data-live-note>
          오늘 근무 중 {live}명은 퇴근하면 금액에 들어가요.
        </p>
      )}
      {(missing.length > 0 || unconfirmed > 0 || otWaiting > 0) && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" data-pay-warn>
          {otWaiting > 0 && `계약 종료 시각 이후 근무 ${otWaiting}건은 아직 서로 확인되지 않아 종료 시각까지만 계산돼 있어요. `}
          {missing.length > 0 && (
            <>
              퇴근 기록이 없는 근무 {missing.length}건은 금액에서 빠져 있어요.{' '}
              {fixHref && (
                <Link href={fixHref} className="font-bold whitespace-nowrap underline-offset-2 hover:underline" data-fix-link>
                  출퇴근에서 고치기 →
                </Link>
              )}{' '}
            </>
          )}
          {unconfirmed > 0 && `아직 확정하지 않은 근무 ${unconfirmed}건이 있어요. 출퇴근 탭에서 확인해 주세요.`}
        </p>
      )}
      {rows.length === 0 ? (
        <div className="card py-10 text-center text-mute">아직 근무 기록이 없어요.</div>
      ) : (
        <>
        {/* 휴대폰: 열이 많아 옆으로 밀어야 함 → 이름 칸은 고정, 밀 수 있다는 안내 */}
        <p className="-mb-1 text-xs text-mute sm:hidden" data-swipe-hint>
          이름은 그대로 두고 옆으로 밀면 공제·계좌·지급이 보여요 →
        </p>
        <div className="card overflow-x-auto p-0" data-pay-table>
          <table className="table table-pin text-[13px]">
            <thead>
              <tr>
                <th>이름</th>
                <th>일수</th>
                <th>인정시간</th>
                <th className="text-right">지급총액</th>
                <th className="text-right">소득세</th>
                <th className="text-right">지방세</th>
                <th className="text-right">고용보험</th>
                <th className="text-right">기타공제</th>
                <th className="text-right">실지급액</th>
                <th>계좌</th>
                <th>지급</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid}>
                  <td className="font-semibold whitespace-nowrap">
                    <Link href={`/admin/workers/${r.uid}`}>{r.user?.name}</Link>
                    {/* 지난 정산도 출근·퇴근 시각·휴게·추가 지급·공제를 고칠 수 있게: 그날 기록 수정 칸으로 (저장하면 정산 탭으로 돌아옴) */}
                    <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs font-semibold" data-pay-edit>
                      {(() => {
                        const days = [...new Set(atts.filter((a) => a.user_id === r.uid).map((a) => a.work_date))].sort()
                        return days.map((d) => (
                          <Link key={d} href={`/admin/jobs/${job.id}?tab=att&date=${d}&fix=${r.uid}&from=pay#att-${r.uid}`} className="text-brand-600">
                            ✏️ {days.length > 1 ? fmtDate(d) : '시간 수정'}
                          </Link>
                        ))
                      })()}
                    </span>
                  </td>
                  <td>{r.s.days}</td>
                  <td className="whitespace-nowrap">{minutesText(r.s.paidMin)}</td>
                  <td className="text-right">
                    {won(r.s.gross)}
                    {r.s.weeklyPay > 0 && (
                      <span className="block text-[11px] font-semibold whitespace-nowrap text-emerald-700" data-weekly-pay>
                        주휴 +{won(r.s.weeklyPay)}
                      </span>
                    )}
                  </td>
                  <td className="text-right">{won(r.s.incomeTax)}</td>
                  <td className="text-right">{won(r.s.localTax)}</td>
                  <td className="text-right">{won(r.s.insurance)}</td>
                  <td className="text-right">{won(r.s.deduction)}</td>
                  <td className="text-right font-bold">{won(r.s.net)}</td>
                  <td className="text-xs whitespace-nowrap text-sub">
                    {r.user?.bank_account_enc ? (
                      `${r.user.bank_name ?? ''} ${maskAccount(decrypt(r.user.bank_account_enc))}`
                    ) : (
                      <span className="text-rose-500">미등록</span>
                    )}
                  </td>
                  <td>
                    <form action={setPaid.bind(null, job.id, r.uid, !r.paid)}>
                      {!r.paid && !r.user?.bank_account_enc ? (
                        // 계좌가 없는데 지급 완료로 바꾸려 하면 한 번 더 확인
                        <ConfirmSubmit className="badge bg-gray-100 text-sub" confirmText="계좌 없음 · 지급완료?">
                          미지급
                        </ConfirmSubmit>
                      ) : (
                        <SubmitButton className={r.paid ? 'badge bg-emerald-50 text-emerald-700' : 'badge bg-gray-100 text-sub'} pendingText="…">
                          {r.paid ? '지급완료' : '미지급'}
                        </SubmitButton>
                      )}
                    </form>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/print/payslip/${job.id}/${r.uid}`} className="text-xs font-semibold text-brand-600">
                      명세서
                    </Link>
                    <Link href={`/print/cert/${job.id}/${r.uid}`} className="ml-2 text-xs font-semibold text-sub">
                      확인서
                    </Link>
                  </td>
                </tr>
              ))}
              <tr className="bg-bg font-bold">
                <td className="whitespace-nowrap">합계 {rows.length}명</td>
                <td>{sum('days')}</td>
                <td className="whitespace-nowrap">{minutesText(sum('paidMin'))}</td>
                <td className="text-right">{won(sum('gross'))}</td>
                <td className="text-right">{won(sum('incomeTax'))}</td>
                <td className="text-right">{won(sum('localTax'))}</td>
                <td className="text-right">{won(sum('insurance'))}</td>
                <td className="text-right">{won(sum('deduction'))}</td>
                <td className="text-right">{won(sum('net'))}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}
      {/* 행사 비용 합계: 알바 인건비(세전 지급총액) + 외주 대금 */}
      {(() => {
        const labor = sum('gross')
        const vendorSum = vpays.reduce((t, p) => t + p.amount, 0)
        const vendorUnpaid = vpays.filter((p) => !p.paid_at).reduce((t, p) => t + p.amount, 0)
        const today = kstDate()
        return (
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-bold">
                <Icon name="receipt" className="text-sub" /> 행사 비용 합계
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <Link href={`/admin/vendors?tab=quotes&job=${job.id}`} className="chip h-8 px-3 text-xs">
                  외주 견적 요청
                </Link>
                <Link href={`/admin/vendors?tab=pay&job=${job.id}`} className="chip h-8 px-3 text-xs">
                  외주 대금 등록
                </Link>
              </div>
            </div>
            {/* 금액은 한 줄에 하나씩 (휴대폰 세 칸이면 큰 금액이 숫자 중간에서 꺾임) */}
            <dl className="divide-y divide-line rounded-xl bg-bg px-4 text-sm">
              {(
                [
                  ['알바 인건비', labor, 'font-semibold text-ink'],
                  ['외주 비용', vendorSum, 'font-semibold text-ink'],
                  ['합계', labor + vendorSum, 'text-base font-extrabold text-brand-700'],
                ] as const
              ).map(([k, v, tone]) => (
                <div key={k} className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-sub">{k}</dt>
                  <dd className={`whitespace-nowrap tabular-nums ${tone}`}>{won(v)}</dd>
                </div>
              ))}
            </dl>
            {vpays.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {vpays.map((p) => {
                  const st = payState(p, today)
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate">
                        <Link href={`/admin/vendors/${p.vendor_id}`} className="font-semibold">
                          {vnames.get(p.vendor_id) ?? '외주사'}
                        </Link>{' '}
                        <span className="text-sub">{p.title}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <b className="tabular-nums">{won(p.amount)}</b>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="text-xs text-mute">
              인건비는 세전 지급총액, 외주 비용은 등록한 대금(부가세 포함·별도는 건마다 다름) 기준이에요.
              {vendorUnpaid > 0 && <b className="text-amber-700"> 외주 미지급 {won(vendorUnpaid)}.</b>}
            </p>
          </section>
        )
      })()}
      <p className="text-xs text-mute">
        소득세는 근무자별로 이 공고의 근무일을 한 번에 지급한다고 보고 계산합니다 (1천원 미만 소액부징수). 원천징수한 세금은 다음 달 10일까지 신고·납부하고,
        월별 신고자료는 정산·신고자료 메뉴에서 내려받으세요.
      </p>
    </div>
  )
}
