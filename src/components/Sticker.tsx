import { STICKERS, type StickerId } from '@/lib/stickers'

// 해피워크 이모티콘 캐릭터: 파란 STAFF 조끼를 입은 노란 병아리 '삐약이'
const OL = '#3B2F2F' // 테두리
const YEL = '#FFD84D'
const BEAK = '#FF9F43'
const BLUE = '#2F6BF0'
const PINK = '#FF5C8A'
const line = { stroke: OL, strokeWidth: 3.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }

type Wing = 'down' | 'wave' | 'up' | 'hold' | 'fist' | 'front'
type Eyes = 'dot' | 'happy' | 'brave' | 'worried' | 'shut' | 'heart' | 'wink' | 'relax'
type Beak = 'closed' | 'open' | 'small'

const heart = (x: number, y: number, s: number) =>
  `M${x} ${y + s * 0.9} C${x - s * 1.6} ${y - s * 0.2} ${x - s * 0.6} ${y - s * 1.4} ${x} ${y - s * 0.4} C${x + s * 0.6} ${y - s * 1.4} ${x + s * 1.6} ${y - s * 0.2} ${x} ${y + s * 0.9}Z`
const sparkle = (x: number, y: number, s: number) =>
  `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`

/** 날개 하나 (side: -1 왼쪽, 1 오른쪽) */
function WingPart({ side, pose }: { side: -1 | 1; pose: Wing }) {
  const x = 80 + side * 44
  if (pose === 'wave' || pose === 'up' || pose === 'fist')
    return (
      <g>
        <ellipse cx={x + side * 6} cy={74} rx={9} ry={18} transform={`rotate(${side * 35} ${x + side * 6} 74)`} fill={YEL} {...line} />
        {pose === 'fist' && <circle cx={x + side * 14} cy={58} r={8} fill={YEL} {...line} />}
        {pose === 'wave' && <path d={`M${x + side * 20} 52 l${side * 6} -6 M${x + side * 24} 66 l${side * 9} -1`} {...line} fill="none" />}
      </g>
    )
  if (pose === 'hold' || pose === 'front')
    return <ellipse cx={80 + side * 22} cy={120} rx={9} ry={15} transform={`rotate(${side * -60} ${80 + side * 22} 120)`} fill={YEL} {...line} />
  return <ellipse cx={x} cy={114} rx={9} ry={16} transform={`rotate(${side * -20} ${x} 114)`} fill={YEL} {...line} />
}

function EyesPart({ eyes }: { eyes: Eyes }) {
  const lx = 65
  const rx = 95
  const y = 88
  const arc = (cx: number, up = true) => <path d={`M${cx - 6} ${y + 2} q6 ${up ? -8 : 8} 12 0`} fill="none" {...line} />
  const dot = (cx: number) => (
    <g>
      <ellipse cx={cx} cy={y} rx={5} ry={6.2} fill={OL} />
      <circle cx={cx + 1.8} cy={y - 2.4} r={2} fill="white" />
    </g>
  )
  if (eyes === 'happy') return <g>{arc(lx)}{arc(rx)}</g>
  if (eyes === 'relax') return <g>{arc(lx, false)}{arc(rx, false)}</g>
  if (eyes === 'shut') return <g><path d={`M${lx - 6} ${y} h12 M${rx - 6} ${y} h12`} {...line} /></g>
  if (eyes === 'wink') return <g>{arc(lx)}{dot(rx)}</g>
  if (eyes === 'heart') return <g><path d={heart(lx, y, 6.5)} fill={PINK} {...line} strokeWidth={2.4} /><path d={heart(rx, y, 6.5)} fill={PINK} {...line} strokeWidth={2.4} /></g>
  if (eyes === 'brave')
    return <g>{dot(lx)}{dot(rx)}<path d={`M${lx - 8} ${y - 12} l12 4 M${rx + 8} ${y - 12} l-12 4`} {...line} /></g>
  if (eyes === 'worried')
    return <g>{dot(lx)}{dot(rx)}<path d={`M${lx - 7} ${y - 9} l11 -4 M${rx + 7} ${y - 9} l-11 -4`} {...line} strokeWidth={3} /></g>
  return <g>{dot(lx)}{dot(rx)}</g>
}

function BeakPart({ beak }: { beak: Beak }) {
  if (beak === 'open')
    return (
      <g>
        <path d="M71 101 q9 13 18 0 z" fill="#E8556B" {...line} strokeWidth={3} />
        <path d="M71 101 q9 -9 18 0 q-9 4 -18 0z" fill={BEAK} {...line} strokeWidth={3} />
      </g>
    )
  if (beak === 'small') return <path d="M75 101 q5 -4 10 0 q-5 4 -10 0z" fill={BEAK} {...line} strokeWidth={3} />
  return <path d="M73 100 q7 -7 14 0 q-7 7 -14 0z" fill={BEAK} {...line} strokeWidth={3} />
}

const POSE: Record<StickerId, { l: Wing; r: Wing; eyes: Eyes; beak: Beak; tilt?: number; extra?: React.ReactNode }> = {
  hi: { l: 'down', r: 'wave', eyes: 'dot', beak: 'open' },
  arrived: {
    l: 'down',
    r: 'up',
    eyes: 'happy',
    beak: 'open',
    extra: (
      <g>
        <path d="M30 18 c-9 0 -14 7 -14 14 c0 10 14 22 14 22 s14 -12 14 -22 c0 -7 -5 -14 -14 -14z" fill="#FF5C5C" {...line} strokeWidth={3} />
        <circle cx={30} cy={32} r={5} fill="white" {...line} strokeWidth={2.4} />
      </g>
    ),
  },
  late: {
    l: 'down',
    r: 'down',
    eyes: 'worried',
    beak: 'small',
    tilt: 8,
    extra: (
      <g>
        <circle cx={134} cy={30} r={15} fill="white" {...line} strokeWidth={3} />
        <path d="M134 21 v9 l7 5" fill="none" {...line} strokeWidth={3} />
        <path d="M114 56 q7 9 0 14 q-7 -5 0 -14z" fill="#7CC7FF" {...line} strokeWidth={2.4} />
        <path d="M8 96 h18 M4 110 h20 M10 124 h14" stroke="#B9C3D6" strokeWidth={4} strokeLinecap="round" />
      </g>
    ),
  },
  ok: {
    l: 'down',
    r: 'front',
    eyes: 'wink',
    beak: 'closed',
    extra: (
      <g>
        <circle cx={136} cy={40} r={16} fill="#22C55E" {...line} strokeWidth={3} />
        <path d="M128 40 l6 6 l11 -12" fill="none" stroke="white" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    ),
  },
  fighting: {
    l: 'down',
    r: 'fist',
    eyes: 'brave',
    beak: 'open',
    extra: (
      <g>
        <path d="M38 64 Q80 50 122 64" fill="none" stroke="#FF5C5C" strokeWidth={8} strokeLinecap="round" />
        <path d="M38 64 Q80 50 122 64" fill="none" {...line} strokeWidth={2} />
        <path d="M144 40 l9 -9 M148 58 l12 0 M128 32 l-2 -12" stroke="#F2B705" strokeWidth={4.5} strokeLinecap="round" />
      </g>
    ),
  },
  thanks: {
    l: 'hold',
    r: 'hold',
    eyes: 'happy',
    beak: 'closed',
    tilt: -8,
    extra: (
      <g>
        <path d={heart(136, 32, 9)} fill={PINK} {...line} strokeWidth={2.6} />
        <path d={heart(148, 62, 5.5)} fill={PINK} {...line} strokeWidth={2.2} />
        <path d={heart(22, 52, 6)} fill={PINK} {...line} strokeWidth={2.2} />
      </g>
    ),
  },
  goodjob: {
    l: 'up',
    r: 'up',
    eyes: 'happy',
    beak: 'open',
    extra: (
      <g fill="#FFC21A" {...line} strokeWidth={2.4}>
        <path d={sparkle(22, 30, 11)} />
        <path d={sparkle(142, 24, 9)} />
        <path d={sparkle(148, 92, 6)} />
        <path d={sparkle(14, 92, 6)} />
      </g>
    ),
  },
  break: {
    l: 'hold',
    r: 'hold',
    eyes: 'relax',
    beak: 'closed',
    extra: (
      <g>
        <path d="M96 110 h5 a6 6 0 0 1 0 12 h-5" fill="none" {...line} strokeWidth={3} />
        <rect x={66} y={106} width={30} height={24} rx={6} fill="white" {...line} strokeWidth={3} />
        <path d="M71 113 h20" stroke="#B5763C" strokeWidth={4} strokeLinecap="round" />
        <path d="M120 44 q-4 -7 0 -14 q4 -7 0 -14 M132 48 q-4 -6 0 -12" fill="none" stroke="#B9C3D6" strokeWidth={3.2} strokeLinecap="round" />
        <text x={132} y={80} fontSize={18} fontWeight={900} fill={OL} textAnchor="middle">
          z
        </text>
      </g>
    ),
  },
  done: {
    l: 'down',
    r: 'wave',
    eyes: 'happy',
    beak: 'open',
    extra: (
      <g>
        <path d="M18 104 v-6 a8 8 0 0 1 16 0 v6" fill="none" {...line} strokeWidth={3} />
        <rect x={10} y={102} width={32} height={26} rx={6} fill="#8B5CF6" {...line} strokeWidth={3} />
        <text x={146} y={34} fontSize={26} fontWeight={900} fill={BLUE} textAnchor="middle">
          ♪
        </text>
      </g>
    ),
  },
  sorry: {
    l: 'down',
    r: 'down',
    eyes: 'shut',
    beak: 'small',
    tilt: -20,
    extra: <path d="M126 46 q7 9 0 14 q-7 -5 0 -14z" fill="#7CC7FF" {...line} strokeWidth={2.4} />,
  },
  question: {
    l: 'down',
    r: 'up',
    eyes: 'dot',
    beak: 'small',
    tilt: -6,
    extra: (
      <text x={140} y={46} fontSize={40} fontWeight={900} fill="#FF8A00" stroke={OL} strokeWidth={3} paintOrder="stroke" textAnchor="middle">
        ?
      </text>
    ),
  },
  love: {
    l: 'up',
    r: 'up',
    eyes: 'heart',
    beak: 'open',
    extra: (
      <g>
        <path d={heart(80, 22, 8)} fill={PINK} {...line} strokeWidth={2.6} />
        <path d={heart(146, 98, 6)} fill={PINK} {...line} strokeWidth={2.2} />
        <path d={heart(14, 98, 6)} fill={PINK} {...line} strokeWidth={2.2} />
      </g>
    ),
  },
}

/** 이모티콘 한 개 (대화·고르기 화면). caption=false면 그림만 (작은 아이콘) */
export default function Sticker({ id, size = 120, caption = true }: { id: StickerId; size?: number; caption?: boolean }) {
  const info = STICKERS.find((s) => s.id === id)
  const pose = POSE[id]
  if (!info || !pose) return null
  const h = caption ? 186 : 160
  return (
    <svg viewBox={`0 0 160 ${h}`} width={size} height={(size * h) / 160} role="img" aria-label={`이모티콘: ${info.label}`} className="select-none">
      <defs>
        <clipPath id="happy-chick-body">
          <ellipse cx={80} cy={102} rx={46} ry={50} />
        </clipPath>
      </defs>
      <g transform={pose.tilt ? `rotate(${pose.tilt} 80 150)` : undefined}>
        {/* 발 */}
        <ellipse cx={66} cy={153} rx={11} ry={5.5} fill={BEAK} {...line} strokeWidth={3} />
        <ellipse cx={94} cy={153} rx={11} ry={5.5} fill={BEAK} {...line} strokeWidth={3} />
        {/* 뒤쪽 날개 (위로 든 것) */}
        {['wave', 'up', 'fist'].includes(pose.l) && <WingPart side={-1} pose={pose.l} />}
        {['wave', 'up', 'fist'].includes(pose.r) && <WingPart side={1} pose={pose.r} />}
        {/* 몸 */}
        <ellipse cx={80} cy={102} rx={46} ry={50} fill={YEL} />
        {/* STAFF 조끼 (몸 아래쪽) */}
        <g clipPath="url(#happy-chick-body)">
          <path d="M20 118 Q80 108 140 118 V160 H20Z" fill={BLUE} />
          <path d="M20 118 Q80 108 140 118" fill="none" {...line} strokeWidth={3} />
        </g>
        <ellipse cx={80} cy={102} rx={46} ry={50} fill="none" {...line} />
        <rect x={64} y={124} width={32} height={13} rx={3.5} fill="white" {...line} strokeWidth={2.2} />
        <text x={80} y={134} fontSize={8.6} fontWeight={900} fill={BLUE} textAnchor="middle" fontFamily="Arial, sans-serif">
          STAFF
        </text>
        {/* 머리 깃털 */}
        <path d="M76 54 q-3 -17 9 -19 q-7 10 3 17" fill={YEL} {...line} strokeWidth={3.2} />
        {/* 볼 */}
        <ellipse cx={54} cy={102} rx={7.5} ry={4.5} fill="#FF9DB0" opacity={0.8} />
        <ellipse cx={106} cy={102} rx={7.5} ry={4.5} fill="#FF9DB0" opacity={0.8} />
        <EyesPart eyes={pose.eyes} />
        <BeakPart beak={pose.beak} />
        {/* 앞쪽 날개 */}
        {!['wave', 'up', 'fist'].includes(pose.l) && <WingPart side={-1} pose={pose.l} />}
        {!['wave', 'up', 'fist'].includes(pose.r) && <WingPart side={1} pose={pose.r} />}
      </g>
      {pose.extra}
      {caption && (
        <text x={80} y={180} fontSize={18} fontWeight={900} fill="white" stroke={OL} strokeWidth={5.5} paintOrder="stroke" strokeLinejoin="round" textAnchor="middle">
          {info.label}
        </text>
      )}
    </svg>
  )
}
