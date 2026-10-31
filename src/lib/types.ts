export type Role = 'worker' | 'admin'

export type UserRow = {
  id: string
  role: Role
  name: string
  phone: string
  pin_hash: string
  rrn_enc: string | null
  rrn_hash: string | null
  rrn_masked: string | null
  birth_date: string | null
  gender: 'M' | 'F' | null
  is_foreigner: boolean
  address: string | null
  bank_name: string | null
  bank_account_enc: string | null
  account_holder: string | null
  bank_changed_at: string | null
  emergency_phone: string | null
  admin_memo: string | null
  active: boolean
  privacy_agreed_at: string | null
  failed_logins: number
  locked_until: string | null
  session_version: number
  /** 얼굴 사진을 올린 시각 (없으면 null, 사진은 user_photos) */
  photo_at: string | null
  created_at: string
}

export type PayType = 'hourly' | 'daily'
export type BreakMode = 'auto' | 'fixed' | 'none'
export type TaxType = 'daily' | 'business' | 'none'
export type JobStatus = 'draft' | 'open' | 'closed' | 'done' | 'cancelled'

/** 공고마다 넣고 빼는 근무 조건 (예: 식사 · 점심 도시락 제공) */
export type JobCondition = { label: string; value: string }

export type Job = {
  id: string
  title: string
  event_name: string | null
  description: string | null
  task: string | null
  location_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  gps_required: boolean
  gps_radius_m: number
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  headcount: number
  pay_type: PayType
  hourly_wage: number
  daily_wage: number
  break_mode: BreakMode
  break_minutes: number
  round_unit: number
  early_clamp: boolean
  premium_enabled: boolean
  allowance: number
  allowance_label: string | null
  tax_type: TaxType
  employment_insurance: boolean
  pay_day: string | null
  dress_code: string | null
  supplies: string | null
  meeting_point: string | null
  manager_name: string | null
  manager_phone: string | null
  required_docs: string[]
  /** 근로계약서 받는 방법: 앱 전자서명 / 종이로 따로 / 모두싸인 등 다른 서비스 */
  contract_method: ContractMethod
  /** 다른 서비스로 받을 때 근무자에게 보여 줄 서명 링크 (선택) */
  contract_url: string | null
  auto_approve: boolean
  status: JobStatus
  conditions: JobCondition[]
  /** 공고 화면에서 숨길 기본 항목 (lib/jobFields.ts) */
  hidden_fields: string[]
  created_at: string
}

export type AppStatus = 'applied' | 'approved' | 'rejected' | 'cancelled'

export type ContractMethod = 'app' | 'paper' | 'external'

/** 근무시간 변경 요청과 근무자 동의 (work_date가 null이면 공고 전체 일정) */
export type ShiftChange = {
  id: string
  job_id: string
  user_id: string
  work_date: string | null
  start_time: string
  end_time: string
  prev_start: string
  prev_end: string
  reason: string | null
  status: 'pending' | 'agreed' | 'declined' | 'superseded'
  requested_by: string | null
  created_at: string
  answered_at: string | null
  answered_by: string | null
}

export type Application = {
  id: string
  job_id: string
  user_id: string
  status: AppStatus
  available_dates: string[] | null
  message: string | null
  admin_memo: string | null
  /** 현장 배치 (예: A게이트). 비어 있으면 미배치 */
  position: string | null
  /** 종이·외부 서비스로 받은 근로계약서를 관리자가 받았다고 표시한 시각 */
  contract_received_at: string | null
  decided_at: string | null
  created_at: string
}

export type Attendance = {
  id: string
  job_id: string
  user_id: string
  work_date: string
  clock_in: string
  clock_out: string | null
  in_lat: number | null
  in_lng: number | null
  out_lat: number | null
  out_lng: number | null
  in_distance_m: number | null
  out_distance_m: number | null
  adj_in: string | null
  adj_out: string | null
  break_override: number | null
  extra_pay: number
  deduction: number
  note: string | null
  source: 'app' | 'admin'
  confirmed: boolean
  paid: boolean
  paid_at: string | null
  /** 계약 종료 시각 이후 근무(연장): ot_by가 요청·제안, 상대가 확인하면 agreed → 그때만 금액에 들어감 */
  ot_minutes: number
  ot_status: 'pending' | 'agreed' | 'rejected' | null
  ot_by: 'worker' | 'admin' | null
  /** 그날 이 근무자에게 적용할 시작·종료 (근무시간 변경에 동의했거나, 공고 시간이 바뀌기 전 근무). 비어 있으면 공고 시간 */
  sched_start: string | null
  sched_end: string | null
}

export type DocKind = 'contract' | 'pledge' | 'consent' | 'other'

export type DocTemplate = {
  id: string
  kind: DocKind
  title: string
  body: string
  is_default: boolean
  active: boolean
  updated_at: string
}

export type SignedDoc = {
  id: string
  job_id: string
  user_id: string
  template_id: string | null
  kind: DocKind
  title: string
  body: string | null
  signature: string | null
  seal_image: string | null
  company_snapshot: CompanySnapshot | null
  signed_at: string | null
  signed_ip: string | null
  signed_ua: string | null
  status: 'pending' | 'signed' | 'void'
  created_at: string
}

export type Settings = {
  company_name: string
  ceo_name: string | null
  business_no: string | null
  company_address: string | null
  company_phone: string | null
  contact_name: string | null
  contact_phone: string | null
  seal_image: string | null
  default_hourly_wage: number
  workplace_5plus: boolean
}

/** 직인 이미지를 뺀 회사 정보 (대부분의 화면은 이것만 읽음) */
export type CompanySettings = Omit<Settings, 'seal_image'>

export type CompanySnapshot = Pick<
  Settings,
  'company_name' | 'ceo_name' | 'business_no' | 'company_address' | 'company_phone'
>

/** 문의 채팅 (근무자 한 명당 대화방 하나, thread_user_id = 그 근무자) */
export type Message = {
  id: number
  thread_user_id: string
  sender_id: string | null
  from_admin: boolean
  job_id: string | null
  body: string
  read_at: string | null
  created_at: string
}

/** 관리자끼리만 보는 근무자 평점 */
export type WorkerRating = {
  id: string
  user_id: string
  job_id: string | null
  rater_id: string | null
  score: number
  comment: string | null
  created_at: string
  updated_at: string
}
