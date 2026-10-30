// 행사장 지도 주소 (지도 앱 키 없이 쓰는 공개 링크)

export type Place = { name: string | null; address: string | null; lat: number | null; lng: number | null }

export function mapLinks(p: Place) {
  const point = p.lat != null && p.lng != null
  // 좌표 > 주소 > 장소 이름 순으로 찾음 (이름만 있어도 '진주종합경기장'처럼 검색되면 지도가 나옴)
  const text = p.address || p.name
  if (!point && !text) return null
  const label = encodeURIComponent(p.name || p.address || '행사장')
  const query = point ? `${p.lat},${p.lng}` : text!
  return {
    embed: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&hl=ko&z=16&output=embed`,
    kakao: point ? `https://map.kakao.com/link/map/${label},${p.lat},${p.lng}` : `https://map.kakao.com/link/search/${encodeURIComponent(text!)}`,
    route: point ? `https://map.kakao.com/link/to/${label},${p.lat},${p.lng}` : null,
    naver: `https://map.naver.com/p/search/${encodeURIComponent(text || query)}`,
  }
}
