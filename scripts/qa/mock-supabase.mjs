// 화면 점검용 가짜 Supabase(PostgREST). 요청마다 LAT ms 지연. 실제 DB에는 연결하지 않습니다.
// LAT=5 node scripts/qa/mock-supabase.mjs   (기본 포트 54321)
import http from 'node:http'

const LAT = Number(process.env.LAT ?? 40)
const PORT = Number(process.env.PORT ?? 54321)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001'
const WORKER = 'bbbbbbbb-0000-4000-8000-000000000002'
const JOB = 'cccccccc-0000-4000-8000-000000000003'
const DOC = 'dddddddd-0000-4000-8000-000000000004'
const DOC_SIGNED = 'dddddddd-0000-4000-8000-000000000005'
const ATT = 'eeeeeeee-0000-4000-8000-000000000006'
const TPL = 'ffffffff-0000-4000-8000-000000000007'

// 400KB 직인 → base64 약 533KB
const SEAL = 'data:image/png;base64,' + Buffer.alloc(400_000, 7).toString('base64')

const user = (id, role, name, phone) => ({
  id, role, name, phone, pin_hash: 's1:x:y', rrn_enc: null, rrn_hash: null, rrn_masked: '900101-1******',
  birth_date: '1990-01-01', gender: 'M', is_foreigner: false, address: '서울', bank_name: '국민',
  bank_account_enc: null, account_holder: name, bank_changed_at: null, emergency_phone: null, admin_memo: null,
  active: true, privacy_agreed_at: '2026-10-01T00:00:00Z', failed_logins: 0, locked_until: null, session_version: 1,
  created_at: '2026-10-01T00:00:00Z', attendance: [{ work_date: today }],
})
const users = [user(ADMIN, 'admin', '관리자', '01011112222'), user(WORKER, 'worker', '근무자', '01033334444')]
const workerLite = { id: WORKER, name: '근무자', phone: '01033334444', birth_date: '1990-01-01', address: '서울', bank_name: '국민', bank_account_enc: null, account_holder: '근무자' }

const job = {
  id: JOB, title: '테스트 행사 스태프', event_name: '축제', description: '설명', task: '안내', location_name: '광장',
  address: '서울 중구', lat: 37.5, lng: 127.0, gps_required: false, gps_radius_m: 300, start_date: today, end_date: today,
  start_time: '09:00:00', end_time: '18:00:00', headcount: 5, pay_type: 'hourly', hourly_wage: 10320, daily_wage: 0,
  break_mode: 'auto', break_minutes: 0, round_unit: 1, early_clamp: false, premium_enabled: false, allowance: 0,
  allowance_label: '교통비', tax_type: 'daily', employment_insurance: true, pay_day: '익월 10일', dress_code: null,
  supplies: null, meeting_point: null, manager_name: '담당', manager_phone: '01055556666', required_docs: [TPL],
  auto_approve: false, status: 'open', created_by: ADMIN, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  applications: [{ status: 'approved' }, { status: 'applied' }],
}
const jobLite = { ...job }
delete jobLite.applications

const tables = {
  users,
  settings: [{
    id: 1, company_name: '주식회사 테스트', ceo_name: '대표', business_no: '123-45-67890', company_address: '서울',
    company_phone: '0212345678', contact_name: '담당', contact_phone: '01012345678', seal_image: SEAL,
    default_hourly_wage: 10320, workplace_5plus: true, updated_at: '2026-10-01T00:00:00Z',
  }],
  jobs: [job],
  applications: [{
    id: '11111111-0000-4000-8000-000000000008', job_id: JOB, user_id: WORKER, status: 'approved', available_dates: null,
    message: '열심히', admin_memo: null, decided_at: null, created_at: '2026-10-01T00:00:00Z', job: jobLite, user: workerLite,
  }],
  attendance: [{
    id: ATT, job_id: JOB, user_id: WORKER, work_date: today, clock_in: new Date().toISOString(), clock_out: null,
    in_lat: null, in_lng: null, out_lat: null, out_lng: null, in_distance_m: null, out_distance_m: null, adj_in: null,
    adj_out: null, break_override: null, extra_pay: 0, deduction: 0, note: null, source: 'app', confirmed: false,
    paid: false, paid_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
    job: jobLite, user: { ...workerLite, rrn_enc: null, is_foreigner: false },
  }],
  signed_docs: [
    { id: DOC, job_id: JOB, user_id: WORKER, template_id: TPL, kind: 'contract', title: '근로계약서', body: null, signature: null,
      seal_image: null, company_snapshot: null, signed_at: null, signed_ip: null, signed_ua: null, status: 'pending',
      created_at: '2026-10-01T00:00:00Z', worker: { name: '근무자', phone: '01033334444', birth_date: '1990-01-01', address: '서울' } },
    { id: DOC_SIGNED, job_id: JOB, user_id: WORKER, template_id: TPL, kind: 'contract', title: '서약서', body: '# 서약서\n\n내용',
      signature: null, seal_image: null, company_snapshot: { company_name: '주식회사 테스트', ceo_name: null, business_no: null, company_address: null, company_phone: null },
      signed_at: '2026-10-01T00:00:00Z', signed_ip: '1.1.1.1', signed_ua: 'x', status: 'signed',
      created_at: '2026-10-01T00:00:00Z', worker: { name: '근무자', phone: '01033334444', birth_date: '1990-01-01', address: '서울' } },
  ],
  doc_templates: [{ id: TPL, kind: 'contract', title: '근로계약서', body: '# 계약서\n\n{{근로자명}}', is_default: true, active: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }],
  audit_logs: [{ id: 1, actor_id: ADMIN, action: 'user.edit', target_user_id: WORKER, detail: 'admin', ip: '1.1.1.1', created_at: '2026-10-01T00:00:00Z', actor: { name: '관리자' }, target: { name: '근무자' } }],
}

// select의 최상위 항목만 고름 (괄호 안은 무시). "*"면 전부.
function project(row, select) {
  if (!select || select.includes('*')) return row
  const keys = []
  let depth = 0, cur = ''
  for (const ch of select) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { keys.push(cur); cur = '' } else cur += ch
  }
  keys.push(cur)
  const out = {}
  for (let k of keys) {
    k = k.trim().replace(/\(.*$/s, '')
    const alias = k.includes(':') ? k.split(':')[0] : k.split('!')[0]
    if (alias in row) out[alias] = row[alias]
  }
  return out
}

function filter(rows, params) {
  return rows.filter((r) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'or', 'columns'].includes(k) || k.includes('.')) continue
      if (!(k in r)) continue
      if (v.startsWith('eq.') && String(r[k]) !== v.slice(3)) return false
      if (v === 'is.null' && r[k] != null) return false
      if (v === 'not.is.null' && r[k] == null) return false
      if (v.startsWith('in.(')) {
        const set = v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))
        if (!set.includes(String(r[k]))) return false
      }
      if (v.startsWith('neq.') && String(r[k]) === v.slice(4)) return false
    }
    return true
  })
}

let reqs = 0
let bytes = 0
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/__stats') {
    res.end(JSON.stringify({ reqs, bytes }))
    reqs = 0
    bytes = 0
    return
  }
  reqs++
  await new Promise((r) => setTimeout(r, LAT))
  const table = url.pathname.replace('/rest/v1/', '')
  const rows = filter(tables[table] ?? [], url.searchParams)
  const send = (status, body, headers = {}) => {
    const s = body === undefined ? '' : JSON.stringify(body)
    bytes += s.length
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(s)
  }
  if (req.method === 'HEAD' || (req.headers.prefer ?? '').includes('count=exact')) {
    return send(200, req.method === 'HEAD' ? undefined : rows, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` })
  }
  if (req.method !== 'GET') {
    req.resume()
    return send(201, [])
  }
  const out = rows.map((r) => project(r, url.searchParams.get('select')))
  if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
    return out.length === 1 ? send(200, out[0]) : send(406, { code: 'PGRST116', message: 'not single' })
  }
  send(200, out)
})
server.listen(PORT, () => console.log(`mock supabase :${PORT} latency ${LAT}ms`))
