-- 근무자 얼굴 사진 (현장에서 담당자가 누군지 알아보게). 관리자와 본인만 봄
-- 휴대폰에서 가로세로 320px JPEG로 줄여 올리므로 한 장에 수십 KB. 목록 화면은 users.photo_at만 읽고
-- 사진은 /photo/[id] 주소로 따로 받음 (photo_at을 주소에 붙여 바뀌었을 때만 새로 받음)
create table public.user_photos (
  user_id uuid primary key references public.users(id) on delete cascade,
  data text not null, -- JPEG base64
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
alter table public.user_photos enable row level security;
revoke all on public.user_photos from anon, authenticated;

alter table public.users add column photo_at timestamptz;
