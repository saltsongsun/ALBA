import { timingSafeEqual } from 'node:crypto'
import { cleanupRateEvents } from '@/lib/ratelimit'
import { sendDayBeforeReminders, sendForgotClockOutReminders } from '@/lib/remind'
import { kstTime } from '@/lib/time'

/**
 * 근무 전날 안내 + 근무 종료를 깜빡한 근무자 안내 (Vercel Cron: 매일 18시 KST). CRON_SECRET을 정해 두면 그 값으로만 부를 수 있음.
 * 정하지 않았으면 저녁(17시~24시)에만 동작: 공고·날짜마다 한 번만 보내므로 다른 사람이 불러도 안내가 조금 일찍 갈 뿐임
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    // 비밀값 비교는 걸리는 시간으로 알아내지 못하게
    const got = Buffer.from(req.headers.get('authorization') ?? '')
    const want = Buffer.from(`Bearer ${secret}`)
    if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response('unauthorized', { status: 401 })
  } else {
    // 비밀값을 정하지 않았으면: Vercel Cron 요청처럼 보이고 저녁(17시 이후)일 때만
    if (!(req.headers.get('user-agent') ?? '').startsWith('vercel-cron/')) return new Response('forbidden', { status: 403 })
    if (Number(kstTime(new Date()).slice(0, 2)) < 17) return Response.json({ skipped: '저녁 5시 이후에만 보냅니다.' })
  }
  const result = await sendDayBeforeReminders()
  // 지난 근무의 종료를 깜빡한 근무자에게 끝난 시각을 알려 달라고 (기록마다 한 번)
  const forgot = await sendForgotClockOutReminders()
  await cleanupRateEvents() // 하루 한 번: 오래된 자동화 방어 기록 지우기
  return Response.json({ ...result, forgot })
}
