import { redirect } from 'next/navigation'

/** 운영센터는 관리자 화면과 따로 (/ops · 최상위 관리자만) — 예전 주소로 오면 옮겨 줌 (주인이 아니면 /ops가 404) */
export default function OldOpsPage() {
  redirect('/ops')
}
