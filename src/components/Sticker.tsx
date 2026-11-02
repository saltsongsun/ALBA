import { STICKERS, type StickerId } from '@/lib/stickers'

// 해피워크 캐릭터 '해피': 파란 몸, 노란 스태프 모자, 목에 STAFF 이름표
const BLUE = '#3B7BFF'
const ARM = '#2F6BF0'
const DEEP = '#1D4ED8'
const YEL = '#FFD43B'
const YEL2 = '#F2B705'
const CHEEK = '#FF8FAB'
const PINK = '#FF5C8A'
const INK = '#13256B'

type Arms = 'down' | 'wave' | 'thumb' | 'fist' | 'raise' | 'hold' | 'both'
type Eyes = 'dot' | 'happy' | 'heart' | 'worried' | 'wink' | 'shut' | 'brave'
type Mouth = 'smile' | 'open' | 'small' | 'wobbly'

const heart = (x: number, y: number, s: number) =>
  `M${x} ${y + s * 0.9} C${x - s * 1.6} ${y - s * 0.2} ${x - s * 0.6} ${y - s * 1.4} ${x} ${y - s * 0.4} C${x + s * 0.6} ${y - s * 1.4} ${x + s * 1.6} ${y - s * 0.2} ${x} ${y + s * 0.9}Z`
const sparkle = (x: number, y: number, s: number) =>
  `M${x} ${y - s}L${x + s * 0.28} ${y - s * 0.28}L${x + s} ${y}L${x + s * 0.28} ${y + s * 0.28}L${x} ${y + s}L${x - s * 0.28} ${y + s * 0.28}L${x - s} ${y}L${x - s * 0.28} ${y - s * 0.28}Z`

function ArmsPart({ arms }: { arms: Arms }) {
  const line = { stroke: ARM, strokeWidth: 10, strokeLinecap: 'round' as const, fill: 'none' }
  const left = arms === 'hold' ? 'M46 96 Q54 110 68 108' : arms === 'both' ? 'M46 92 Q32 80 30 64' : 'M46 96 Q36 104 38 113'
  const right =
    arms === 'wave' ? 'M114 92 Q128 80 130 64' :
    arms === 'thumb' ? 'M114 96 Q126 94 128 82' :
    arms === 'fist' ? 'M114 90 Q123 74 124 58' :
    arms === 'raise' ? 'M112 88 L120 54' :
    arms === 'hold' ? 'M114 96 Q106 110 92 108' :
    arms === 'both' ? 'M114 92 Q128 80 130 64' :
    'M114 96 Q124 104 122 113'
  return (
    <g>
      <path d={left} {...line} />
      <path d={right} {...line} />
      {arms === 'both' && <circle cx={29} cy={60} r={7} fill={BLUE} />}
      {(arms === 'wave' || arms === 'both') && <circle cx={131} cy={60} r={7} fill={BLUE} />}
      {arms === 'raise' && <circle cx={121} cy={50} r={7} fill={BLUE} />}
      {arms === 'fist' && <circle cx={124} cy={54} r={8.5} fill={BLUE} stroke={DEEP} strokeWidth={2} />}
      {arms === 'thumb' && (
        <g>
          <circle cx={128} cy={79} r={7.5} fill={BLUE} stroke={DEEP} strokeWidth={2} />
          <path d="M128 72 L128 62" stroke={BLUE} strokeWidth={6.5} strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

function EyesPart({ eyes }: { eyes: Eyes }) {
  const arc = { stroke: 'white', strokeWidth: 3.6, strokeLinecap: 'round' as const, fill: 'none' }
  if (eyes === 'happy') return <g><path d="M62 78 q6 -8 12 0" {...arc} /><path d="M86 78 q6 -8 12 0" {...arc} /></g>
  if (eyes === 'shut') return <g><path d="M62 77 h12" {...arc} /><path d="M86 77 h12" {...arc} /></g>
  if (eyes === 'heart') return <g><path d={heart(68, 76, 6)} fill={PINK} /><path d={heart(92, 76, 6)} fill={PINK} /></g>
  if (eyes === 'wink') return <g><path d="M62 78 q6 -8 12 0" {...arc} /><circle cx={92} cy={76} r={4.6} fill="white" /></g>
  const dots = <g><circle cx={68} cy={76} r={4.6} fill="white" /><circle cx={92} cy={76} r={4.6} fill="white" /></g>
  if (eyes === 'worried') return <g>{dots}<path d="M62 66 l10 3.5" {...arc} strokeWidth={3} /><path d="M98 66 l-10 3.5" {...arc} strokeWidth={3} /></g>
  if (eyes === 'brave') return <g>{dots}<path d="M62 67 l10 5" {...arc} strokeWidth={3} /><path d="M98 67 l-10 5" {...arc} strokeWidth={3} /></g>
  return dots
}

function MouthPart({ mouth }: { mouth: Mouth }) {
  const stroke = { stroke: 'white', strokeLinecap: 'round' as const, fill: 'none' }
  if (mouth === 'open')
    return (
      <g>
        <path d="M69 86 q11 15 22 0 z" fill={INK} />
        <ellipse cx={80} cy={93} rx={5} ry={2.6} fill={CHEEK} />
      </g>
    )
  if (mouth === 'small') return <path d="M75 89 q5 5 10 0" {...stroke} strokeWidth={3.4} />
  if (mouth === 'wobbly') return <path d="M70 91 q4 -4 7 0 q3.5 4 6.5 0 q3.5 -4 7 0" {...stroke} strokeWidth={3} />
  return <path d="M68 87 q12 11 24 0" {...stroke} strokeWidth={4} />
}

const POSE: Record<StickerId, { arms: Arms; eyes: Eyes; mouth: Mouth; tilt?: number; extra?: React.ReactNode }> = {
  hi: { arms: 'wave', eyes: 'dot', mouth: 'open', extra: <g stroke={DEEP} strokeWidth={2.6} strokeLinecap="round"><path d="M141 52 l6 -5" /><path d="M143 63 l8 0" /></g> },
  arrived: {
    arms: 'raise',
    eyes: 'happy',
    mouth: 'open',
    extra: (
      <g>
        <path d="M30 14 c-8 0 -13 6 -13 13 c0 9 13 21 13 21 s13 -12 13 -21 c0 -7 -5 -13 -13 -13z" fill="#FF5C5C" />
        <circle cx={30} cy={27} r={5} fill="white" />
      </g>
    ),
  },
  late: {
    arms: 'down',
    eyes: 'worried',
    mouth: 'wobbly',
    extra: (
      <g>
        <circle cx={132} cy={32} r={14} fill="white" stroke={DEEP} strokeWidth={3} />
        <path d="M132 24 v8 l6 4" stroke={DEEP} strokeWidth={3} strokeLinecap="round" fill="none" />
        <path d="M113 52 q6 8 0 12 q-6 -4 0 -12z" fill="#7CC7FF" />
        <g stroke="#B8C6E6" strokeWidth={3} strokeLinecap="round"><path d="M16 80 h16" /><path d="M12 92 h18" /><path d="M18 104 h12" /></g>
      </g>
    ),
  },
  ok: { arms: 'thumb', eyes: 'wink', mouth: 'smile', extra: <path d={sparkle(146, 52, 7)} fill={YEL} /> },
  fighting: {
    arms: 'fist',
    eyes: 'brave',
    mouth: 'open',
    extra: (
      <g stroke={YEL2} strokeWidth={3.2} strokeLinecap="round">
        <path d="M137 44 l7 -6" />
        <path d="M140 58 l9 0" />
        <path d="M112 43 l-4 -8" />
      </g>
    ),
  },
  thanks: {
    arms: 'hold',
    eyes: 'happy',
    mouth: 'smile',
    extra: (
      <g fill={PINK}>
        <path d={heart(132, 34, 8)} />
        <path d={heart(146, 58, 5)} opacity={0.8} />
        <path d={heart(24, 52, 5)} opacity={0.7} />
      </g>
    ),
  },
  goodjob: {
    arms: 'wave',
    eyes: 'happy',
    mouth: 'open',
    extra: (
      <g fill={YEL}>
        <path d={sparkle(26, 40, 9)} />
        <path d={sparkle(145, 28, 7)} />
        <path d={sparkle(20, 92, 5)} />
      </g>
    ),
  },
  break: {
    arms: 'hold',
    eyes: 'happy',
    mouth: 'smile',
    extra: (
      <g>
        <g stroke="#B8C6E6" strokeWidth={2.4} strokeLinecap="round" fill="none">
          <path d="M100 94 q-3 -5 0 -10 q3 -5 0 -10" />
          <path d="M108 96 q-3 -5 0 -10" />
        </g>
        <path d="M89 102 h4 a5 5 0 0 1 0 10 h-4" stroke={DEEP} strokeWidth={2.6} fill="none" />
        <rect x={69} y={98} width={21} height={18} rx={4} fill="white" stroke={DEEP} strokeWidth={2.6} />
        <path d="M73 104 h13" stroke="#C08A5B" strokeWidth={3} strokeLinecap="round" />
      </g>
    ),
  },
  done: {
    arms: 'wave',
    eyes: 'happy',
    mouth: 'open',
    extra: (
      <g>
        <path d="M24 98 v-4 a6 6 0 0 1 12 0 v4" stroke="#334155" strokeWidth={3} fill="none" />
        <rect x={16} y={98} width={28} height={20} rx={5} fill="#334155" />
        <text x={146} y={40} fontSize={22} fontWeight={800} fill={DEEP} textAnchor="middle">
          ♪
        </text>
      </g>
    ),
  },
  sorry: {
    arms: 'down',
    eyes: 'shut',
    mouth: 'small',
    tilt: -14,
    extra: <path d="M118 46 q6 8 0 12 q-6 -4 0 -12z" fill="#7CC7FF" />,
  },
  question: {
    arms: 'raise',
    eyes: 'dot',
    mouth: 'small',
    extra: (
      <text x={140} y={46} fontSize={34} fontWeight={900} fill="#FF8A00" textAnchor="middle">
        ?
      </text>
    ),
  },
  love: {
    arms: 'both',
    eyes: 'heart',
    mouth: 'open',
    extra: (
      <g fill={PINK}>
        <path d={heart(80, 12, 6)} />
        <path d={heart(146, 88, 5)} opacity={0.8} />
        <path d={heart(14, 88, 5)} opacity={0.8} />
      </g>
    ),
  },
}

/** 이모티콘 한 개 (대화·고르기 화면) */
export default function Sticker({ id, size = 120, caption = true }: { id: StickerId; size?: number; caption?: boolean }) {
  const info = STICKERS.find((s) => s.id === id)
  const pose = POSE[id]
  if (!info || !pose) return null
  return (
    <svg viewBox={`0 0 160 ${caption ? 166 : 130}`} width={size} height={(size * (caption ? 166 : 130)) / 160} role="img" aria-label={`이모티콘: ${info.label}`} className="select-none">
      <g transform={pose.tilt ? `rotate(${pose.tilt} 80 124)` : undefined}>
        <ArmsPart arms={pose.arms} />
        {/* 발 */}
        <rect x={58} y={116} width={16} height={10} rx={5} fill={DEEP} />
        <rect x={86} y={116} width={16} height={10} rx={5} fill={DEEP} />
        {/* 몸 */}
        <rect x={42} y={42} width={76} height={80} rx={32} fill={BLUE} />
        <ellipse cx={64} cy={58} rx={13} ry={7} fill="white" opacity={0.18} />
        {/* 볼 */}
        <circle cx={58} cy={88} r={4.6} fill={CHEEK} opacity={0.75} />
        <circle cx={102} cy={88} r={4.6} fill={CHEEK} opacity={0.75} />
        <EyesPart eyes={pose.eyes} />
        <MouthPart mouth={pose.mouth} />
        {/* 목걸이 이름표 */}
        <path d="M64 98 L75 109 M96 98 L85 109" stroke={YEL} strokeWidth={3} strokeLinecap="round" />
        <rect x={68} y={106} width={24} height={13} rx={3} fill="white" />
        <text x={80} y={115.4} fontSize={6.6} fontWeight={800} fill={DEEP} textAnchor="middle" letterSpacing={0.3}>
          STAFF
        </text>
        {/* 스태프 모자 */}
        <path d="M43 54 C43 30 60 21 80 21 C100 21 117 30 117 54 Z" fill={YEL} />
        <rect x={43} y={48} width={74} height={7} rx={3.5} fill={YEL2} />
        <path d="M80 52 C96 49 113 51 126 58 C113 64 94 63 80 58 Z" fill={YEL2} />
        <path d={sparkle(80, 35, 6)} fill="white" />
      </g>
      {pose.extra}
      {caption && (
        <g>
          <rect x={8} y={132} width={144} height={30} rx={15} fill="white" stroke="#DCE3F2" strokeWidth={2} />
          <text x={80} y={152.5} fontSize={16} fontWeight={800} fill="#1F2A44" textAnchor="middle">
            {info.label}
          </text>
        </g>
      )}
    </svg>
  )
}
