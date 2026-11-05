import { mapLinks, type Place } from '@/lib/map'
import { CopyButton } from './ui'

/** 행사장 지도 + 카카오맵·길찾기·네이버 지도 버튼 (장소 이름·주소·좌표가 모두 없으면 그리지 않음) */
export default function VenueMap(place: Place) {
  const links = mapLinks(place)
  if (!links) return null
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <iframe
        title={`${place.name || place.address || '행사장'} 지도`}
        src={links.embed}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-40 w-full bg-bg sm:h-52"
      />
      <div className="flex flex-wrap gap-1.5 p-2.5">
        {links.route && (
          <a href={links.route} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
            길찾기
          </a>
        )}
        <a href={links.kakao} target="_blank" rel="noreferrer" className="btn-soft btn-sm">
          카카오맵
        </a>
        <a href={links.naver} target="_blank" rel="noreferrer" className="btn-gray btn-sm">
          네이버 지도
        </a>
        {/* 택시·내비 앱에 붙여 넣기 좋게 주소만 (주소가 없으면 장소 이름) */}
        {(place.address || place.name) && <CopyButton text={(place.address || place.name)!} label={place.address ? '주소 복사' : '장소 복사'} className="btn-gray btn-sm" />}
      </div>
    </div>
  )
}
