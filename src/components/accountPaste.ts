import { splitBankText } from '@/lib/bankPaste'

/**
 * 계좌번호 칸에 '카카오뱅크 3333-01-1234567' 같은 글을 붙여 넣으면: 계좌번호만 넣고 은행은 같은 양식의 은행 칸에서 골라 줌
 * (은행 칸은 잠깐 반짝여서 바뀐 걸 알 수 있게). 숫자만 붙여 넣으면 그대로.
 */
export function onAccountPaste(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text')
  if (!text || /^[\d\s-]*$/.test(text)) return
  const { bank, account } = splitBankText(text)
  if (!account) return
  e.preventDefault()
  const input = e.currentTarget
  input.value = account
  input.dispatchEvent(new Event('input', { bubbles: true }))
  const select = input.form?.elements.namedItem('bank_name')
  if (bank && select instanceof HTMLSelectElement && [...select.options].some((o) => o.value === bank) && select.value !== bank) {
    select.value = bank
    select.dispatchEvent(new Event('change', { bubbles: true }))
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.removeAttribute('data-flash')
    void select.offsetWidth
    select.setAttribute('data-flash', '')
    setTimeout(() => select.removeAttribute('data-flash'), 3200)
  }
}
