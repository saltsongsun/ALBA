/** 아이폰 홈 화면 앱 시작 화면 (public/splash, 기기 화면 크기별 세로 이미지) */
const SIZES: [w: number, h: number, ratio: number][] = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 14·15 Pro Max, 15·16 Plus
  [393, 852, 3], // 14·15 Pro, 15·16
  [428, 926, 3], // 12·13 Pro Max, 14 Plus
  [390, 844, 3], // 12·13·14
  [375, 812, 3], // X·XS·11 Pro·12 mini
  [414, 896, 3], // XS Max·11 Pro Max
  [414, 896, 2], // XR·11
  [375, 667, 2], // SE·8
]

export const SPLASH_SIZES = SIZES.map(([w, h, r]) => ({ w, h, r, file: `splash-${w * r}x${h * r}.png` }))

export const SPLASH = SPLASH_SIZES.map(({ w, h, r, file }) => ({
  url: `/splash/${file}`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}))
