/**
 * 계좌번호 칸 아래: 쓰는 대로 몇 자리인지 (숫자만 셈 · 10~16자리면 ✓).
 * 자리가 모자라거나 넘치면 입금 전에 알 수 있게 — 저장은 서버가 같은 기준으로 확인함
 */
export default function AccountDigits({ value, id, fallback }: { value: string; id?: string; fallback?: React.ReactNode }) {
  const n = value.replace(/\D/g, '').length
  if (n === 0) return fallback ? <p className="hint mt-1">{fallback}</p> : null
  const ok = n >= 10 && n <= 16
  return (
    <p id={id} aria-live="polite" data-account-digits={ok ? 'ok' : 'bad'} className={`hint mt-1 ${ok ? 'font-semibold text-emerald-700' : n > 16 ? 'font-semibold text-amber-700' : ''}`}>
      {ok ? `✓ 계좌번호 ${n}자리` : n > 16 ? `${n}자리 · 너무 길어요 (숫자 10~16자리)` : `${n}자리 · 계좌번호는 숫자 10~16자리예요`}
    </p>
  )
}
