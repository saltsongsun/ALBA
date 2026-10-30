import 'server-only'

const PREFIX = 'data:image/jpeg;base64,'
/** 휴대폰에서 320px로 줄인 JPEG는 base64로 수십 KB. 넉넉히 잡고 그 이상은 거절 */
const MAX_CHARS = 200_000

/** 올라온 사진(data URL)이 정말 JPEG인지 보고 base64 부분만 돌려줌. 아니면 null */
export function photoBase64(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string' || !v.startsWith(PREFIX) || v.length > PREFIX.length + MAX_CHARS) return null
  const b64 = v.slice(PREFIX.length)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null
  const head = Buffer.from(b64.slice(0, 8), 'base64')
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? b64 : null
}
