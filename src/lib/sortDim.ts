/**
 * 정렬 칩(components/SortChips) 아래 목록에 붙이는 클래스: 새 순서를 받는 동안 살짝 흐리게.
 * 칩 줄(.peer)과 같은 부모 안, 뒤쪽 형제여야 함.
 * ('use client' 파일에서 내보내면 서버 화면에서는 글자가 아니라 참조로 와서 따로 둠)
 */
export const SORT_DIM = 'transition-opacity duration-200 [.peer[data-pending]~&]:opacity-50'
