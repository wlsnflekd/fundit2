-- notifications 테이블
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  type         text not null default 'assignment',
  title        text not null,
  body         text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- RLS
alter table public.notifications enable row level security;

-- 본인 알림만 SELECT
create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());

-- 같은 workspace 멤버가 INSERT 가능 (관리자가 담당자에게 알림 보냄)
create policy "notifications_insert" on public.notifications
  for insert with check (
    workspace_id = public.get_my_workspace_id()
  );

-- 본인 알림만 UPDATE (읽음 처리)
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid());

grant select, insert, update on public.notifications to authenticated;
