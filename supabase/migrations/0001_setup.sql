-- 0001_setup.sql

-- workspaces
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text default 'free',
  created_at timestamptz not null default now()
);

-- profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  email text unique not null,
  role text not null check (role in ('admin','staff')),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- customers
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  company text not null,
  ceo text,
  industry text,
  employees int,
  revenue numeric,
  consultant uuid references profiles(id),
  pool boolean default false,
  tags text[],
  score int default 0,
  created_at timestamptz not null default now()
);

-- funds
create table if not exists funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org text,
  type text,
  max_amount numeric,
  rate numeric,
  deadline date,
  tags text[]
);

-- applications
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  fund_id uuid not null references funds(id) on delete restrict,
  status text not null default '신청중',
  consultant uuid references profiles(id),
  amount numeric,
  deadline date,
  priority text default '중',
  memo text,
  created_at timestamptz not null default now()
);

-- notices
create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  org text,
  deadline date,
  tags text[]
);

-- trigger to create profile after auth user signup
-- create or replace function handle_new_user() returns trigger as $$
-- begin
--   insert into profiles (id, workspace_id, name, email, role, status)
--   values (
--     new.id,
--     (new.raw_user_meta->>'workspace_id')::uuid,
--     coalesce(new.raw_user_meta->>'name', new.email),
--     new.email,
--     coalesce(new.raw_user_meta->>'role', 'staff'),
--     'active'
--   ) on conflict (id) do nothing;
--   return new;
-- end;
-- $$ language plpgsql security definer;

-- create trigger on_auth_user_created
--   after insert on auth.users
--   for each row
--   execute procedure handle_new_user();

-- ── GRANT ────────────────────────────────────────────────────────────────────
-- authenticated 역할에 테이블 접근 권한을 부여해야 PostgREST가 403을 반환하지 않습니다.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- ── RLS policies ─────────────────────────────────────────────────────────────
-- 테넌트 격리: auth.uid() → profiles.workspace_id 서브쿼리 패턴

alter table workspaces enable row level security;
create policy "workspaces_select" on workspaces for select using (true);
create policy "workspaces_insert" on workspaces for insert with check (true);
create policy "workspaces_update" on workspaces for update using (true) with check (true);

alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (
  id = auth.uid()
  OR workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);
create policy "profiles_insert" on profiles for insert with check (
  id = auth.uid()
);
create policy "profiles_update" on profiles for update using (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
) with check (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);

alter table customers enable row level security;
create policy "customers_workspace" on customers for all using (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
) with check (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);

alter table applications enable row level security;
create policy "applications_workspace" on applications for all using (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
) with check (
  workspace_id = (
    SELECT p.workspace_id FROM profiles p WHERE p.id = auth.uid()
  )
);

alter table funds enable row level security;
create policy "funds_select" on funds for select using (true);
create policy "funds_insert" on funds for insert with check (auth.role() = 'service_role');

alter table notices enable row level security;
create policy "notices_select" on notices for select using (true);
create policy "notices_insert" on notices for insert with check (auth.role() = 'service_role');
