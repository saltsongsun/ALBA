-- 가입 유형: 아르바이트 / 전문가(개인, 사업소득 3.3%) / 외주 업체(사업자)
-- · 공고는 모집 대상(아르바이트·전문가)을 골라, 아르바이트와 전문가는 서로 다른 화면에서 봄
-- · 전문가 의뢰는 용역계약서(서식 종류 service)로 계약
-- · 외주사(vendors)를 가입한 전문가·외주 업체 계정과 이어, 견적 요청·대금 현황을 앱에서 봄
-- 기존 회원은 모두 아르바이트, 기존 공고는 모두 아르바이트 모집

alter table public.users
  add column member_type text not null default 'worker' check (member_type in ('worker', 'expert', 'vendor')),
  add column biz_name text,          -- 외주 업체 상호
  add column biz_no text,            -- 사업자등록번호 (숫자만)
  add column specialty text,         -- 전문 분야 (음향·조명·영상·MC 등, 쉼표로 여러 개)
  add column intro text,             -- 한 줄 소개
  add column portfolio_url text;     -- 포트폴리오 주소 (https)

alter table public.jobs
  add column audience text not null default 'worker' check (audience in ('worker', 'expert'));
create index jobs_audience on public.jobs (audience, status, start_date);

-- 서식 종류에 용역계약서(service) 추가: 예전 종류 제한(이름이 무엇이든)을 지우고 다시
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.doc_templates'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.doc_templates drop constraint %I', c);
  end loop;
end $$;
alter table public.doc_templates
  add constraint doc_templates_kind_check check (kind in ('contract', 'service', 'pledge', 'consent', 'other'));

alter table public.vendors
  add column user_id uuid references public.users(id) on delete set null;
create index vendors_user on public.vendors (user_id) where user_id is not null;
