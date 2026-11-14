import { db } from './db'
import { kstDate, kstDateTime, kstTime } from './time'

/**
 * 이 공고에 마지막으로 보낸 담당자 앱 알림(문의함 글 첫 줄 머리말로 구분) 시각 — 우리 회사 문의함에서만.
 * 서류 탭 '서명 요청' · 정산 탭 '계좌 등록 요청'이 같은 알림을 금방 또 보내지 않게 화면에 보여 줌
 */
export async function lastNudgeAt(companyId: string, jobId: string, head: string): Promise<string | null> {
  return (await lastNudge(companyId, jobId, head))?.at ?? null
}

type NudgeRow = { created_at: string; body: string; thread_user_id: string; read_at: string | null }

/**
 * 위와 같지만 글도 함께 (머리말 줄은 뺌) — 확정자 공지 칸의 '마지막 공지'
 * + 그때 한 번에 받은 사람과 읽었는지 (같은 글 · 1분 안에 보낸 묶음) — 이 공고·우리 회사 문의함에서만
 */
export async function lastNudge(
  companyId: string,
  jobId: string,
  head: string,
): Promise<{ at: string; body: string; to: { uid: string; read: boolean }[] } | null> {
  const { data } = await db()
    .from('messages')
    .select('created_at, body, thread_user_id, read_at')
    .eq('company_id', companyId)
    .eq('job_id', jobId)
    .eq('from_admin', true)
    .order('created_at', { ascending: false })
    .limit(300)
  const rows = ((data ?? []) as NudgeRow[]).filter((m) => m.body.startsWith(head))
  // 가장 늦은 것 (정렬에 기대지 않고 직접 고름)
  const last = rows.reduce<NudgeRow | null>((a, m) => (!a || m.created_at > a.created_at ? m : a), null)
  if (!last) return null
  const t = Date.parse(last.created_at)
  const by = new Map<string, boolean>()
  for (const m of rows) if (m.body === last.body && Math.abs(Date.parse(m.created_at) - t) < 60_000) by.set(m.thread_user_id, (by.get(m.thread_user_id) ?? false) || !!m.read_at)
  return { at: last.created_at, body: last.body.split('\n').slice(1).join('\n').trim(), to: [...by].map(([uid, read]) => ({ uid, read })) }
}

/** 마지막 알림 때: '방금' · 'n분 전' · '오늘 14:02' · '11/13(금) 14:02' + 30분 안이면 recent (다시 보낼 때 한 번 더 확인) */
export function nudgeAgo(iso: string | null | undefined): { when: string; recent: boolean; confirm: (n: number) => string } | null {
  if (!iso) return null
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  const when = min < 1 ? '방금' : min < 60 ? `${min}분 전` : kstDate(iso) === kstDate() ? `오늘 ${kstTime(iso)}` : kstDateTime(iso)
  const recent = min < 30
  return { when, recent, confirm: (n) => (recent ? `${when === '방금' ? '방금' : `${when}에`} 보냈어요 · 또 보낼까요?` : `${n}명에게 보낼까요?`) }
}
