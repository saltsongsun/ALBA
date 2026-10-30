// 휴대폰에서 고른 사진을 올리기 전에 작게 줄이기 (브라우저에서만 씀)

const SIZE = 320 // 올리는 사진 가로세로 (목록 동그라미·크게 보기에 충분)
const MAX_CHARS = 150_000

/** 고른 사진을 가운데 정사각형으로 잘라 작은 JPEG로 (세로 사진은 얼굴이 있는 위쪽을 조금 더 살림) */
export async function toSquareJpeg(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w = img.naturalWidth
    const h = img.naturalHeight
    const s = Math.min(w, h)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIZE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (w - s) / 2, h > w ? (h - s) * 0.3 : 0, s, s, 0, 0, SIZE, SIZE)
    let q = 0.86
    let out = canvas.toDataURL('image/jpeg', q)
    while (out.length > MAX_CHARS && q > 0.5) {
      q -= 0.12
      out = canvas.toDataURL('image/jpeg', q)
    }
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}
