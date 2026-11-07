import { BANKS } from './privacy'

/**
 * 붙여 넣은 계좌 글(예: '카카오뱅크 3333-01-1234567', '국민 123456-01-123456 홍길동')에서 은행과 계좌번호를 나눔.
 * 은행 이름은 줄임말도 알아봄 (국민·농협·기업·카뱅 등). 못 찾으면 null.
 */
// 낱말 첫머리만 봄 (예금주 '김하나'·'이우리'의 '하나'·'우리'를 은행으로 잘못 고르지 않게)
const ALIAS: [RegExp, (typeof BANKS)[number]][] = [
  [/^(지역|단위)농협|^축협/, '지역농협'],
  [/^(카카오|카뱅)/, '카카오뱅크'],
  [/^토스/, '토스뱅크'],
  [/^(케이뱅크|k뱅크|kbank)/i, '케이뱅크'],
  [/^(kb|국민)/i, 'KB국민은행'],
  [/^신한/, '신한은행'],
  [/^우리/, '우리은행'],
  [/^(하나|keb)/i, '하나은행'],
  [/^(nh|농협)/i, 'NH농협은행'],
  [/^(ibk|기업)/i, 'IBK기업은행'],
  [/^(bnk)?경남/i, 'BNK경남은행'],
  [/^(bnk)?부산/i, 'BNK부산은행'],
  [/^(im|대구)/i, 'iM뱅크(대구)'],
  [/^(우체국|우정)/, '우체국'],
  [/^(mg|새마을)/i, '새마을금고'],
  [/^신협/, '신협'],
  [/^수협/, '수협'],
  [/^(sc|제일)/i, 'SC제일은행'],
  [/^광주/, '광주은행'],
  [/^전북/, '전북은행'],
  [/^제주/, '제주은행'],
  [/^(한국)?(씨티|citi)/i, '한국씨티은행'],
  [/^(kdb|산업)/i, 'KDB산업은행'],
  [/저축은행$/, '저축은행'],
]

export function splitBankText(text: string): { bank: string | null; account: string | null } {
  const t = text.trim()
  // 숫자 9자리 이상(사이에 - 나 빈칸) = 계좌번호
  const run = t.match(/\d[\d\- ]{7,}\d/g)?.sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length)[0] ?? null
  const account = run ? run.replace(/ +/g, '-').replace(/-+/g, '-') : null
  const rest = (run ? t.replace(run, ' ') : t).replace(/지역\s+농협|단위\s+농협/g, '지역농협')
  const words = rest.split(/[\s,.·/()[\]:|]+/).filter(Boolean)
  const bank = ALIAS.find(([re]) => words.some((w) => re.test(w)))?.[1] ?? null
  return { bank, account }
}
