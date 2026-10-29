// 행사장 지도 주소 (지도 앱 키 없이 쓰는 공개 링크)

export type Place = { name: string | null; address: string | null; lat: number | null; lng: number | null }

export function mapLinks(p: Place) {
  const point = p.lat != null && p.lng != null
  if (!point && !p.address) return null
  const label = encodeURIComponent(p.name || p.address || '행사장')
  const query = point ? `${p.lat},${p.lng}` : p.address!
  return {
    /** 화면에 넣는 지도 (구글 지도 퍼가기) */
    embed: `https://maps.google.com/maps?q=${encodeURIComponent(query)}&hl=ko&z=16&output=embed`,
    kakao: point ? `https://map.kakao.com/link/map/${label},${p.lat},${p.lng}` : `https://map.kakao.com/link/search/${encodeURIComponent(p.address!)}`,
    /** 카카오맵 길찾기 (좌표가 있을 때만) */
    route: point ? `https://map.kakao.com/link/to/${label},${p.lat},${p.lng}` : null,
    naver: `https://map.naver.com/p/search/${encodeURIComponent(p.address || p.name || query)}`,
  }
}
