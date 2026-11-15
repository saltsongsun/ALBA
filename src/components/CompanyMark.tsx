/**
 * 회사 이름 첫 글자 표시 — 여러 회사 일을 하는 근무자가 문의함·목록에서 회사를 한눈에 구분하게
 * ('주식회사'·'(주)'·'㈜' 같은 말은 빼고 · 모든 회사 같은 색이라 화면이 알록달록해지지 않음)
 */
export function companyInitial(name: string): string {
  const s = name
    .trim()
    .replace(/^(주식회사|유한회사|합자회사|합명회사|사단법인|재단법인|협동조합|\(주\)|\(유\)|㈜)\s*/, '')
    .replace(/\s*(주식회사|\(주\)|㈜)$/, '')
    .trim()
  return (Array.from(s || name.trim())[0] ?? '?').toUpperCase()
}

export default function CompanyMark({ name, className = '' }: { name: string; className?: string }) {
  // 바탕색을 따로 주면 그것만 (두 bg 클래스가 겹치면 어느 쪽이 이길지 모름)
  const bg = /(^|\s)bg-/.test(className) ? '' : 'bg-brand-50'
  return (
    <span aria-hidden data-company-mark className={`grid shrink-0 place-items-center font-extrabold text-brand-700 ${bg} ${className}`}>
      {companyInitial(name)}
    </span>
  )
}
