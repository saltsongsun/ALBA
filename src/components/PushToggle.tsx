'use client'

import { usePush } from './usePush'

/**
 * 휴대폰 알림(푸시) 켜기·끄기.
 * card: 아직 안 켠 사람에게만 보이는 안내 카드 / row: 내 정보·관리자 화면의 설정 줄 (항상 보임)
 * reason: 카드에 보일 이유 (예: 지원한 뒤 '확정되면 바로 알려 드려요')
 */
export default function PushToggle({
  publicKey,
  variant = 'row',
  admin = false,
  reason,
}: {
  publicKey: string | null
  variant?: 'card' | 'row'
  admin?: boolean
  reason?: string
}) {
  const { state, busy, turnOn, turnOff } = usePush(publicKey)

  const what = admin ? '새 지원·문의·확정 취소·연장 확인 요청' : '근무 확정·공지·모집·답장'

  if (variant === 'card') {
    // 아직 안 켠 사람에게만 (켰거나, 지원이 안 되는 기기면 안 보임)
    if (state !== 'off' && state !== 'error') return null
    return (
      <div className="card flex animate-pop items-center gap-3 p-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-xl">
          🔔
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">휴대폰 알림 받기</span>
          <span className="block text-sm text-sub">
            {state === 'error' ? '알림을 켜지 못했어요. 다시 눌러 주세요.' : (reason ?? `${what} 소식을 바로 알려 드려요`)}
          </span>
        </span>
        <button type="button" onClick={turnOn} disabled={busy} className="btn-primary btn-sm shrink-0">
          {busy ? '켜는 중…' : '알림 켜기'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 text-sm">
        <span className="font-semibold">🔔 휴대폰 알림</span>{' '}
        <span className="text-sub">
          {state === 'on'
            ? `켜짐 · ${what}`
            : state === 'denied'
              ? '휴대폰 설정에서 이 사이트 알림이 꺼져 있어요'
              : state === 'ios-install'
                ? '아이폰은 홈 화면에 앱을 추가한 뒤 켤 수 있어요'
                : state === 'inapp'
                  ? '카카오톡 안에서는 못 받아요 · 크롬·사파리로 열어 주세요'
                : state === 'unsupported'
                  ? '이 브라우저는 알림을 지원하지 않아요'
                  : state === 'error'
                    ? '알림을 켜지 못했어요'
                    : state === 'loading'
                      ? ''
                      : `꺼짐 · 켜면 ${what} 소식을 바로 받아요`}
        </span>
      </span>
      {(state === 'off' || state === 'error') && (
        <button type="button" onClick={turnOn} disabled={busy} className="btn-primary btn-sm">
          {busy ? '켜는 중…' : '알림 켜기'}
        </button>
      )}
      {state === 'on' && (
        <button type="button" onClick={turnOff} disabled={busy} className="btn-gray btn-sm">
          끄기
        </button>
      )}
    </div>
  )
}
