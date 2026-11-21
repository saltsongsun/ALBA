import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import Badges from '@/components/play/Badges'
import Challenges from '@/components/play/Challenges'
import Fortune from '@/components/play/Fortune'
import Quiz from '@/components/play/Quiz'
import Ranking from '@/components/play/Ranking'
import Flash from '@/components/Flash'
import { CheckinCard } from '@/components/community2'
import { canWrite } from '@/lib/community'
import { checkinView, weeklyRanking } from '@/lib/community2'
import { addDays } from '@/lib/weekly'
import { coworkersEnabled } from '@/lib/coworkers'
import { playStats } from '@/lib/play'
import { badgesOf, challengesOf, fortuneOf } from '@/lib/playContent'
import { requireUser } from '@/lib/session'
import { kstDate } from '@/lib/time'
import { weekStart } from '@/lib/weekly'

export const metadata: Metadata = { title: '놀이터' }

/**
 * 커뮤니티 > 놀이터 (사용자 요청 2026-11-20 "게임과 커뮤니티 기능을 많이 추가해줘 구인구직자들이 즐길 수 있도록").
 * 오늘의 운세 · 이번 주 챌린지 · 알바 상식 퀴즈 · 배지 — 모두 내 기록으로 계산하거나 이 휴대폰에만 두는 재미용
 * (급여·확정과 무관). 커뮤니티 2단계(2026-11-21): 출석 체크 · 주간 랭킹 — 랭킹은 '참여하기'를 누른 사람의 별명과 점수만
 */
export default async function PlayPage(props: PageProps<'/community/play'>) {
  const sp = await props.searchParams
  const user = await requireUser('/community/play')
  if (user.memberType === 'vendor') redirect('/community')
  const today = kstDate()
  const ws = weekStart(today)
  const dayIdx = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${ws}T00:00:00Z`)) / 864e5)
  // 출석 체크 · 주간 랭킹 (커뮤니티 2단계 · 사용자 요청 2026-11-21): 근무자·전문가만
  const worker = canWrite(user)
  const [stats, pals, checkin, rank] = await Promise.all([playStats(user.id), coworkersEnabled(), worker ? checkinView(user.id) : null, weeklyRanking(user.id)])
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  // 동료 기능을 운영자가 꺼 두었으면 '첫 동료' 배지는 얻을 수 없으니 빼기
  const badges = badgesOf(stats).filter((b) => pals || b.key !== 'pal1')
  const got = badges.filter((b) => b.have >= b.need).length
  return (
    <div className="space-y-4" data-play>
      <Link href="/community" className="tap text-sm font-semibold text-sub" transitionTypes={['nav-back']}>
        ← 커뮤니티
      </Link>
      <Flash m={sp.m} />
      <div>
        <h1 className="text-2xl font-extrabold">놀이터</h1>
        <p className="mt-0.5 text-sm break-keep text-sub">
          출석하고, 퀴즈 풀고, 배지 모아요 · 지금 배지 <b className="text-ink tabular-nums">{got}개</b>
        </p>
      </div>

      {checkin && <CheckinCard view={checkin} ranked={rank.joined} />}

      <Fortune f={fortuneOf(user.id, today)} date={today} />

      <Challenges items={challengesOf(stats)} week={ws} daysLeft={6 - dayIdx} />

      <Ranking {...rank} canJoin={worker} weekLabel={`${md(ws)}~${md(addDays(ws, 6))}`} />

      <section id="quiz" className="card scroll-mt-20" aria-label="알바 상식 퀴즈">
        <Quiz week={ws} />
      </section>

      <Badges items={badges} />

      <p className="px-1 text-center text-xs break-keep text-balance text-mute" data-play-note>
        재미로 보는 기록이에요 · 급여나 확정과는 상관없어요
      </p>
    </div>
  )
}
