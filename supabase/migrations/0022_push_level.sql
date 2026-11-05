-- 알림 단계: 'all' 전체 알림 듣기 / 'min' 최소 알림 듣기 (나를 직접 부른 알림·중요 시스템 알림만)
-- 기본은 전체 (지금 받는 알림이 갑자기 끊기지 않게)
alter table public.users add column if not exists push_level text not null default 'all';
alter table public.users drop constraint if exists users_push_level_check;
alter table public.users add constraint users_push_level_check check (push_level in ('all', 'min'));
