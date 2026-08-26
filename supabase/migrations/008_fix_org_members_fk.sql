-- ============================================================
-- CortexAR — Add FK from organization_members.user_id to profiles.id
-- Fixes Supabase schema cache relationship for nested selects
-- ============================================================

-- Drop existing FK if any (references auth.users)
alter table public.organization_members
  drop constraint if exists organization_members_user_id_fkey;

-- Re-add FK pointing to profiles.id for Supabase relationship detection
alter table public.organization_members
  add constraint organization_members_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- Refresh schema cache notice (run via Supabase dashboard)
-- After running this, go to Supabase Dashboard > SQL Editor and run:
-- NOTIFY pgrst, 'reload schema';
