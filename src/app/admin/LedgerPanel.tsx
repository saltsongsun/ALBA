import Link from 'next/link'
import { syncLedgerNow } from '@/app/actions/ledger'
import { SubmitButton } from '@/components/ui'
import { isLedgerCompany, ledgerStatus, type LedgerStatus } from '@/lib/ledger'
import { kstDate, kstDateTime, kstTime } from '@/lib/time'
import CopyCode from '@/components/CopyCode'

/**
 * 대금 시트(거래장부) 연동 — 관리자 화면에만 (장부 회사의 관리자만 이 컴포넌트를 받음 · 근무자 화면엔 없음)
 * full: 회사 설정 카드 (상태 · 마지막 연동 · 버튼 · 연결 방법) / 아니면 정산 탭 한 줄
 */
export default function LedgerPanel({
  status,
  from,
  full = false,
  counts,
  code,
}: {
  status: LedgerStatus
  from: string
  full?: boolean
  counts?: { exported: number; paid: number; total: number }
  /** 연결 전일 때만: 시트에 붙여 넣을 연결 코드 (비밀값 포함 · 장부 회사 관리자 화면에만) */
  code?: string
}) {
  const last = status.last
  const lastLine = last ? `${kstDateTime(last.at)} · ${last.detail.replace(/^(버튼|아침 자동) · /, '')}` : '아직 맞춘 적 없어요'
  const button = (
    <form action={syncLedgerNow} className="shrink-0">
      <input type="hidden" name="from" value={from} />
      <SubmitButton className={full ? 'btn-primary' : 'chip-primary'} pendingText="맞추는 중…" track="대금 시트 연동">
        {full ? '지금 연동하기' : '지금 연동'}
      </SubmitButton>
    </form>
  )

  if (!full) {
    // 정산 탭 한 줄: 이 공고에서 장부에 올린 사람 · 장부 입금확인으로 지급 완료가 된 사람
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-[13px] text-sky-900" data-ledger-strip>
        <span aria-hidden>📒</span>
        <p className="min-w-0 flex-1 truncate">
          <b className="font-bold">대금 시트</b>
          {!status.configured ? (
            <span className="text-sky-800/80"> · 연결 전</span>
          ) : counts && counts.total > 0 ? (
            <span data-ledger-counts>
              {' '}
              · 장부 {counts.exported}/{counts.total}명{counts.paid > 0 ? ` · 입금확인 ${counts.paid}명` : ''}
            </span>
          ) : (
            <span className="text-sky-800/80"> · 행사 끝난 다음 날 아침 7시에 올라가요</span>
          )}
        </p>
        {status.configured ? (
          button
        ) : (
          <Link href="/admin/settings#ledger" className="tap shrink-0 font-bold text-sky-700" data-ledger-setup>
            연결하기 →
          </Link>
        )}
      </div>
    )
  }

  return (
    <section id="ledger" className="card scroll-mt-24 space-y-3" data-ledger-card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-bold">📒 대금 시트 연동</h2>
          <p className="text-xs text-sub">거래장부 구글 시트와 지급 기록을 맞춰요 · 관리자에게만 보여요</p>
        </div>
        <span className={`badge shrink-0 ${status.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-sub'}`} data-ledger-state={status.configured ? 'on' : 'off'}>
          {status.configured ? '연결됨' : '연결 전'}
        </span>
      </div>
      {status.configured ? (
        <>
          <ul className="space-y-1 text-[13px] text-sub">
            <li>· 시트에서 <b className="text-ink">입금확인</b>한 사람 → 앱에서 지급 완료 (근무자 알림 없음)</li>
            <li>· 끝난 공고 → 다음 날 아침 7시에 장부 맨 아래에 사람마다 한 줄</li>
            <li>· 기존 줄은 바꾸지 않아요 · 새로 쓴 줄은 <span className="rounded bg-sky-100 px-1 text-sky-900">하늘색</span> + 비고 ‘🤖 해피워크 자동’</li>
          </ul>
          <div className="flex items-center gap-2">
            <p className={`min-w-0 flex-1 text-xs ${last && !last.ok ? 'font-semibold text-rose-600' : 'text-mute'}`} data-ledger-last>
              <span className="line-clamp-2">마지막: {lastLine}</span>
            </p>
            {button}
          </div>
          {from !== '/admin/ledger' && (
            <Link href="/admin/ledger" className="tap inline-block text-sm font-bold text-brand-600" data-ledger-history>
              매일 연동 기록 보기 →
            </Link>
          )}
        </>
      ) : (
        <div className="space-y-2 rounded-xl bg-bg px-3 py-3 text-[13px]" data-ledger-howto>
          <p className="font-bold">연결 방법 (한 번만 · 5분)</p>
          <ol className="list-decimal space-y-1 pl-5 text-sub">
            <li>거래장부 시트 → 확장 프로그램 → Apps Script를 열어요</li>
            <li>편집기 내용을 지우고 아래 코드를 붙여 넣은 뒤 저장해요</li>
            <li>배포 → 새 배포 → 웹 앱 (실행: 나 · 액세스: 모든 사용자) → 권한 허용</li>
            <li>나온 웹 앱 주소를 Vercel 환경 변수 <code>LEDGER_PROXY_URL</code>에 넣고 다시 배포해요</li>
          </ol>
          {code && <CopyCode code={code} label="연결 코드 복사" />}
          <p className="text-[11px] text-mute">코드에 이 회사 전용 비밀값이 들어 있어요 · 다른 사람에게 보내지 마세요</p>
        </div>
      )}
    </section>
  )
}

/**
 * 관리자 홈 한 줄: 오늘 아침 대금 시트 연동 결과 (무엇이 바뀌었는지는 누르면 기록 화면)
 * 장부 회사 · 연결된 뒤에만 · 오늘 연동이 없고 아침 8시가 지났으면 '연동 기록이 없어요'
 */
export async function LedgerToday({ companyId }: { companyId: string }) {
  if (!(await isLedgerCompany(companyId).catch(() => false))) return null
  const status = await ledgerStatus(companyId).catch(() => null)
  if (!status?.configured) return null
  const today = kstDate()
  const last = status.last && kstDate(new Date(status.last.at)) === today ? status.last : null
  if (!last && Number(kstTime(new Date()).slice(0, 2)) < 8) return null
  const quiet = last?.ok && /^새로 맞출 내용이 없어요/.test(last.detail)
  const tone = !last ? 'bg-amber-50 text-amber-900' : !last.ok ? 'bg-rose-50 text-rose-700' : quiet ? 'bg-bg text-sub' : 'bg-sky-50 text-sky-900'
  const text = !last ? '오늘 아침 연동 기록이 없어요 · 확인해 주세요' : !last.ok ? `연동 실패 · ${last.detail.replace(/^실패: /, '')}` : last.detail.replace(/ · 위치 .*$/, '')
  return (
    <Link href="/admin/ledger" className={`flex min-w-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm ${tone}`} data-ledger-today={!last ? 'missing' : !last.ok ? 'fail' : quiet ? 'quiet' : 'changed'}>
      <span aria-hidden>📒</span>
      <span className="min-w-0 flex-1">
        <b className="block text-[13px]">오늘 대금 시트{last ? ` · ${kstTime(new Date(last.at)).slice(0, 5)}` : ''}</b>
        <span className="block truncate text-[13px]">{text}</span>
      </span>
      <span aria-hidden className="shrink-0">›</span>
    </Link>
  )
}
