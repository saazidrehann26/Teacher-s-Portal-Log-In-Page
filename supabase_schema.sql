-- ============================================================================
-- Supabase SQL Schema for Teacher's Portal
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Create the teachers table
create table if not exists public.teachers (
  id text primary key,
  full_name text not null,
  email text unique not null,
  institution_name text not null,
  password text not null,
  role text default 'Educator',
  status text default 'active',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Enable Row Level Security (RLS)
alter table public.teachers enable row level security;

-- 3. Policy: Allow reading registered teachers (needed to check if email exists and verify credentials)
create policy "Allow select for teachers"
  on public.teachers for select
  using (true);

-- 4. Policy: Allow inserting new teacher accounts on registration
create policy "Allow insert for new teachers"
  on public.teachers for insert
  with check (true);

-- 5. Policy: Allow updating passwords during password recovery
create policy "Allow update for password recovery"
  on public.teachers for update
  using (true)
  with check (true);
