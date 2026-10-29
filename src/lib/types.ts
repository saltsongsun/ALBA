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
  created_at: string
}

export type PayType = 'hourly' | 'daily'
export type BreakMode = 'auto' | 'fixed' | 'none'
export type TaxType = 'daily' | 'business' | 'none'
export type JobStatus = 'draft' | 'open' | 'closed' | 'done'

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
  auto_approve: boolean
  status: JobStatus
  created_at: string
}

export type AppStatus = 'applied' | 'approved' | 'rejected' | 'cancelled'

export type Application = {
  id: string
  job_id: string
  user_id: string
  status: AppStatus
  available_dates: string[] | null
  message: string | null
  admin_memo: string | null
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
