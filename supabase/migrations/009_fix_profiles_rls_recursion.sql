-- ============================================================
-- AR Business Studio — Fix profiles RLS recursion
-- Replace raw subquery with SECURITY DEFINER helper function
-- ============================================================

-- Helper: check if current user is org admin/owner (bypasses RLS)
create or replace function public.is_admin_user()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.organization_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- Drop ALL policies on profiles (use a DO block to catch any dashboard-created ones)
do $$
declare
  rec record;
begin
  for rec in
    select policyname from pg_policies
    where tablename = 'profiles' and schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.profiles', rec.policyname);
  end loop;
end;
$$;

-- Ensure RLS is enabled
alter table public.profiles enable row level security;

-- Policy 1: Users can read their own profile
create policy "profiles_read_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Policy 2: Admins can read all profiles (uses SECURITY DEFINER function — no recursion)
create policy "profiles_read_admin"
  on public.profiles for select
  using (public.is_admin_user());

-- Policy 3: Users can update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
