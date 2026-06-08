-- ============================================================
-- AR Business Studio — Fix Profiles RLS Recursion
-- Drop all existing policies and recreate cleanly
-- ============================================================

-- Drop all existing policies on profiles (to eliminate any dashboard-created recursive policies)
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "anyone can view profiles" on public.profiles;

-- Ensure RLS is enabled
alter table public.profiles enable row level security;

-- Policy 1: Users can read their own profile
create policy "profiles_read_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Policy 2: Admins can read all profiles (via subquery on organization_members to avoid recursion)
create policy "profiles_read_admin"
  on public.profiles for select
  using (
    exists (
      select 1 from public.organization_members om
      where om.user_id = auth.uid()
        and om.role in ('owner', 'admin')
    )
  );

-- Policy 3: Users can update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
