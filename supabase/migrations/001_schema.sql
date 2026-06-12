-- ============================================================
-- AR Business Studio — Complete Schema Migration
-- ============================================================

-- 0. EXTENSIONS
create extension if not exists "pgcrypto";

-- 1. PROFILES
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. ORGANIZATIONS
create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. ORGANIZATION MEMBERS
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('owner','admin','editor','viewer')),
  created_at      timestamptz not null default now(),
  unique(organization_id, user_id)
);

-- 4. PLANS
create table if not exists public.plans (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null unique,
  price              int not null,
  projects_limit     int not null,
  assets_limit_bytes bigint not null,
  assets_limit_label text not null,
  features           jsonb not null default '[]',
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

-- 5. SUBSCRIPTIONS
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  plan_id                uuid not null references public.plans(id),
  asaas_subscription_id  text,
  status                 text not null default 'active' check (status in ('active','past_due','canceled','trialing','incomplete')),
  current_period_start   timestamptz not null default now(),
  current_period_end     timestamptz not null default now() + interval '1 month',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 6. ASAAS CUSTOMERS
create table if not exists public.asaas_customers (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  asaas_customer_id text not null,
  created_at        timestamptz not null default now(),
  unique(organization_id)
);

-- 7. ASAAS PAYMENTS
create table if not exists public.asaas_payments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  subscription_id   uuid references public.subscriptions(id) on delete set null,
  asaas_payment_id  text not null,
  status            text not null,
  value             int not null,
  due_date          date not null,
  paid_date         date,
  invoice_url       text,
  created_at        timestamptz not null default now(),
  unique(asaas_payment_id)
);

-- 8. PROJECTS
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  type             text not null check (type in ('business_card','flyer_a4','square_1x1')),
  status           text not null default 'draft' check (status in ('draft','published','paused','archived')),
  slug             text not null unique,
  marker_image_url text,
  thumbnail_url    text,
  views            int not null default 0,
  created_by       uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 9. PROJECT MARKERS
create table if not exists public.project_markers (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  image_url  text not null,
  width      int not null,
  height     int not null,
  created_at timestamptz not null default now()
);

-- 10. SCENES
create table if not exists public.scenes (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  name              text not null default 'Cena Principal',
  background_color  text not null default '#000000',
  lighting_config   jsonb not null default '{}',
  camera_config     jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 11. SCENE OBJECTS
create table if not exists public.scene_objects (
  id                   uuid primary key default gen_random_uuid(),
  scene_id             uuid not null references public.scenes(id) on delete cascade,
  type                 text not null,
  name                 text not null,
  position_x           float not null default 0,
  position_y           float not null default 0,
  position_z           float not null default 0,
  rotation_x           float not null default 0,
  rotation_y           float not null default 0,
  rotation_z           float not null default 0,
  scale_x              float not null default 1,
  scale_y              float not null default 1,
  scale_z              float not null default 1,
  opacity              float not null default 1,
  visible              boolean not null default true,
  layer_order          int not null default 0,
  animation_type       text,
  action               text,
  asset_url            text,
  asset_thumbnail      text,
  show_caption         boolean default false,
  chroma_key_color     text,
  chroma_key_tolerance float,
  chroma_key_smoothness float,
  duration             float,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 12. SCENE BUTTONS
create table if not exists public.scene_buttons (
  id              uuid primary key default gen_random_uuid(),
  scene_object_id uuid not null references public.scene_objects(id) on delete cascade,
  label           text not null,
  icon            text,
  action_type     text not null,
  action_value    text not null,
  created_at      timestamptz not null default now()
);

-- 13. ASSETS
create table if not exists public.assets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  category        text not null check (category in ('3d','video','image')),
  mime_type       text not null,
  size_bytes      bigint not null,
  storage_path    text not null,
  public_url      text not null,
  thumbnail_url   text,
  uploaded_by     uuid not null references auth.users(id),
  created_at      timestamptz not null default now()
);

-- 14. QR CODES
create table if not exists public.qr_codes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  image_url  text not null,
  target_url text not null,
  created_at timestamptz not null default now()
);

-- 15. USAGE LIMITS
create table if not exists public.usage_limits (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade unique,
  projects_limit     int not null,
  assets_limit_bytes bigint not null,
  projects_used      int not null default 0,
  assets_used_bytes  bigint not null default 0,
  updated_at         timestamptz not null default now()
);

-- 16. USAGE EVENTS
create table if not exists public.usage_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type      text not null,
  resource_id     text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

-- 17. WEBHOOK EVENTS
create table if not exists public.webhook_events (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,
  event_id          text not null,
  event_type        text not null,
  raw_body          jsonb not null,
  processed         boolean not null default false,
  processing_error  text,
  created_at        timestamptz not null default now(),
  unique(source, event_id)
);

-- 18. AUDIT LOGS
create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  action          text not null,
  resource_type   text not null,
  resource_id     text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_org_members_user   on public.organization_members(user_id);
create index idx_org_members_org    on public.organization_members(organization_id);
create index idx_projects_org       on public.projects(organization_id);
create index idx_projects_slug      on public.projects(slug);
create index idx_projects_status    on public.projects(status);
create index idx_scenes_project     on public.scenes(project_id);
create index idx_scene_objects_scene on public.scene_objects(scene_id);
create index idx_assets_org         on public.assets(organization_id);
create index idx_subscriptions_org  on public.subscriptions(organization_id);
create index idx_asaas_payments_org on public.asaas_payments(organization_id);
create index idx_audit_logs_org     on public.audit_logs(organization_id);
create index idx_audit_logs_user    on public.audit_logs(user_id);
create index idx_usage_events_org   on public.usage_events(organization_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Check if organization can create a new project
create or replace function public.check_project_limit(p_organization_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_limit int;
  v_used  int;
begin
  select ul.projects_limit, ul.projects_used
    into v_limit, v_used
    from public.usage_limits ul
   where ul.organization_id = p_organization_id;
  return v_used < v_limit;
end;
$$;

-- Check if organization has space for a new asset
create or replace function public.check_asset_limit(p_organization_id uuid, p_file_size_bytes bigint)
returns boolean
language plpgsql
security definer
as $$
declare
  v_limit bigint;
  v_used  bigint;
begin
  select ul.assets_limit_bytes, ul.assets_used_bytes
    into v_limit, v_used
    from public.usage_limits ul
   where ul.organization_id = p_organization_id;
  return (v_used + p_file_size_bytes) <= v_limit;
end;
$$;

-- Get user role in an organization
create or replace function public.get_organization_role(p_organization_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_role text;
begin
  select role into v_role
    from public.organization_members
   where organization_id = p_organization_id and user_id = p_user_id;
  return v_role;
end;
$$;

-- Increment project view counter
create or replace function public.increment_project_views(p_project_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.projects set views = views + 1 where id = p_project_id;
end;
$$;

-- Auto-create profile after signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id  uuid;
  v_name    text;
begin
  v_name := coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));

  insert into public.profiles (id, name, email, avatar_url)
  values (new.id, v_name, new.email, new.raw_user_meta_data ->> 'avatar_url');

  -- Create a personal organization
  insert into public.organizations (name, slug)
  values (v_name, 'org-' || substr(new.id::text, 1, 8))
  returning id into v_org_id;

  -- Add user as owner
  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, new.id, 'owner');

  -- Assign starter plan
  insert into public.subscriptions (organization_id, plan_id, status)
  values (v_org_id, (select id from public.plans where slug = 'starter' limit 1), 'active');

  -- Create usage limits from plan
  insert into public.usage_limits (organization_id, projects_limit, assets_limit_bytes)
  select v_org_id, p.projects_limit, p.assets_limit_bytes
    from public.plans p
   where p.slug = 'starter'
   limit 1;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.update_updated_at();

create trigger trg_projects_updated_at
  before update on public.projects
  for each row execute function public.update_updated_at();

create trigger trg_scenes_updated_at
  before update on public.scenes
  for each row execute function public.update_updated_at();

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper: is user member of organization?
create or replace function public.is_org_member(org_id uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
end;
$$;

-- Helper: check user role in org
create or replace function public.has_org_role(org_id uuid, required_roles text[])
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1 from public.organization_members
    where organization_id = org_id
      and user_id = auth.uid()
      and role = any(required_roles)
  );
end;
$$;

-- PROFILES
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ORGANIZATIONS
alter table public.organizations enable row level security;

create policy "Members can read organizations"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "Owner and admin can update organizations"
  on public.organizations for update
  using (public.has_org_role(id, array['owner','admin']));

-- ORGANIZATION MEMBERS
alter table public.organization_members enable row level security;

create policy "Members can read organization members"
  on public.organization_members for select
  using (public.is_org_member(organization_id));

create policy "Owner and admin can manage members"
  on public.organization_members for insert
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy "Owner and admin can update members"
  on public.organization_members for update
  using (public.has_org_role(organization_id, array['owner','admin']));

create policy "Owner and admin can delete members"
  on public.organization_members for delete
  using (public.has_org_role(organization_id, array['owner','admin']));

-- PLANS (read-only for users)
alter table public.plans enable row level security;

create policy "Anyone can read plans"
  on public.plans for select
  using (true);

-- SUBSCRIPTIONS
alter table public.subscriptions enable row level security;

create policy "Members can read subscriptions"
  on public.subscriptions for select
  using (public.is_org_member(organization_id));

create policy "Owner and admin can manage subscriptions"
  on public.subscriptions for insert
  with check (public.has_org_role(organization_id, array['owner','admin']));

create policy "Owner and admin can update subscriptions"
  on public.subscriptions for update
  using (public.has_org_role(organization_id, array['owner','admin']));

-- ASAAS CUSTOMERS
alter table public.asaas_customers enable row level security;

create policy "Members can read asaas customers"
  on public.asaas_customers for select
  using (public.is_org_member(organization_id));

-- ASAAS PAYMENTS
alter table public.asaas_payments enable row level security;

create policy "Members can read asaas payments"
  on public.asaas_payments for select
  using (public.is_org_member(organization_id));

-- PROJECTS
alter table public.projects enable row level security;

create policy "Members can read projects"
  on public.projects for select
  using (public.is_org_member(organization_id));

create policy "Editor+ can create projects"
  on public.projects for insert
  with check (public.has_org_role(organization_id, array['owner','admin','editor']));

create policy "Editor+ can update projects"
  on public.projects for update
  using (public.has_org_role(organization_id, array['owner','admin','editor']));

create policy "Owner and admin can delete projects"
  on public.projects for delete
  using (public.has_org_role(organization_id, array['owner','admin']));

-- PROJECT MARKERS
alter table public.project_markers enable row level security;

create policy "Members can read project markers"
  on public.project_markers for select
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_org_member(p.organization_id)));

create policy "Editor+ can manage project markers"
  on public.project_markers for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

-- SCENES
alter table public.scenes enable row level security;

create policy "Members can read scenes"
  on public.scenes for select
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_org_member(p.organization_id)));

create policy "Editor+ can manage scenes"
  on public.scenes for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

create policy "Editor+ can update scenes"
  on public.scenes for update
  using (exists (select 1 from public.projects p where p.id = project_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

create policy "Editor+ can delete scenes"
  on public.scenes for delete
  using (exists (select 1 from public.projects p where p.id = project_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

-- SCENE OBJECTS
alter table public.scene_objects enable row level security;

create policy "Members can read scene objects"
  on public.scene_objects for select
  using (exists (select 1 from public.scenes s join public.projects p on p.id = s.project_id where s.id = scene_id and public.is_org_member(p.organization_id)));

create policy "Editor+ can manage scene objects"
  on public.scene_objects for insert
  with check (exists (select 1 from public.scenes s join public.projects p on p.id = s.project_id where s.id = scene_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

create policy "Editor+ can update scene objects"
  on public.scene_objects for update
  using (exists (select 1 from public.scenes s join public.projects p on p.id = s.project_id where s.id = scene_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

create policy "Editor+ can delete scene objects"
  on public.scene_objects for delete
  using (exists (select 1 from public.scenes s join public.projects p on p.id = s.project_id where s.id = scene_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

-- SCENE BUTTONS
alter table public.scene_buttons enable row level security;

create policy "Members can read scene buttons"
  on public.scene_buttons for select
  using (exists (select 1 from public.scene_objects so join public.scenes s on s.id = so.scene_id join public.projects p on p.id = s.project_id where so.id = scene_object_id and public.is_org_member(p.organization_id)));

create policy "Editor+ can manage scene buttons"
  on public.scene_buttons for insert
  with check (exists (select 1 from public.scene_objects so join public.scenes s on s.id = so.scene_id join public.projects p on p.id = s.project_id where so.id = scene_object_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

-- ASSETS
alter table public.assets enable row level security;

create policy "Members can read assets"
  on public.assets for select
  using (public.is_org_member(organization_id));

create policy "Editor+ can create assets"
  on public.assets for insert
  with check (public.has_org_role(organization_id, array['owner','admin','editor']));

create policy "Owner and admin can delete assets"
  on public.assets for delete
  using (public.has_org_role(organization_id, array['owner','admin']));

-- QR CODES
alter table public.qr_codes enable row level security;

create policy "Members can read qr codes"
  on public.qr_codes for select
  using (exists (select 1 from public.projects p where p.id = project_id and public.is_org_member(p.organization_id)));

create policy "Editor+ can manage qr codes"
  on public.qr_codes for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and public.has_org_role(p.organization_id, array['owner','admin','editor'])));

-- USAGE LIMITS
alter table public.usage_limits enable row level security;

create policy "Members can read usage limits"
  on public.usage_limits for select
  using (public.is_org_member(organization_id));

-- USAGE EVENTS
alter table public.usage_events enable row level security;

create policy "Members can read usage events"
  on public.usage_events for select
  using (public.is_org_member(organization_id));

-- AUDIT LOGS
alter table public.audit_logs enable row level security;

create policy "Members can read audit logs"
  on public.audit_logs for select
  using (organization_id is null or public.is_org_member(organization_id));

-- ============================================================
-- STORAGE BUCKETS & POLICIES
-- ============================================================

-- Grant necessary permissions (required by Supabase SQL Editor)
grant usage on schema storage to service_role;

-- Create buckets
insert into storage.buckets (id, name, public) values ('markers', 'markers', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('models-3d', 'models-3d', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('videos', 'videos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('exports', 'exports', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('public-previews', 'public-previews', true) on conflict (id) do nothing;

-- Storage policies: authenticated users can upload
create policy "Authenticated users can upload markers"
  on storage.objects for insert
  with check (
    bucket_id = 'markers'
    and auth.role() = 'authenticated'
  );

create policy "Authenticated users can upload models-3d"
  on storage.objects for insert
  with check (
    bucket_id = 'models-3d'
    and auth.role() = 'authenticated'
  );

create policy "Authenticated users can upload videos"
  on storage.objects for insert
  with check (
    bucket_id = 'videos'
    and auth.role() = 'authenticated'
  );

create policy "Authenticated users can upload thumbnails"
  on storage.objects for insert
  with check (
    bucket_id = 'thumbnails'
    and auth.role() = 'authenticated'
  );

create policy "Authenticated users can upload exports"
  on storage.objects for insert
  with check (
    bucket_id = 'exports'
    and auth.role() = 'authenticated'
  );

-- Users can read their own org's files
create policy "Users can read own org markers"
  on storage.objects for select
  using (
    bucket_id = 'markers'
    and auth.role() = 'authenticated'
  );

create policy "Users can read own org models-3d"
  on storage.objects for select
  using (
    bucket_id = 'models-3d'
    and auth.role() = 'authenticated'
  );

create policy "Users can read own org videos"
  on storage.objects for select
  using (
    bucket_id = 'videos'
    and auth.role() = 'authenticated'
  );

create policy "Users can read own org thumbnails"
  on storage.objects for select
  using (
    bucket_id = 'thumbnails'
    and auth.role() = 'authenticated'
  );

create policy "Users can read own org exports"
  on storage.objects for select
  using (
    bucket_id = 'exports'
    and auth.role() = 'authenticated'
  );

-- Public previews bucket is public
create policy "Anyone can read public-previews"
  on storage.objects for select
  using (bucket_id = 'public-previews');

-- ============================================================
-- SEED DATA: Plans
-- ============================================================
insert into public.plans (slug, name, price, projects_limit, assets_limit_bytes, assets_limit_label, features) values
  ('starter', 'Starter', 49, 3, 524288000, '500 MB', '["3 projetos ativos", "500MB de assets", "Modelos 3D básicos", "Vídeos MP4", "QR Code", "Marca d''água AR Business"]'),
  ('pro', 'Pro', 97, 25, 5368709120, '5 GB', '["25 projetos ativos", "5GB de assets", "Modelos 3D animados", "Vídeos MP4 + Chromakey", "Botões interativos", "QR Code personalizado", "Sem marca d''água", "Suporte prioritário"]'),
  ('agency', 'Agency', 197, 999999, 53687091200, '50 GB', '["Projetos ilimitados", "50GB de assets", "Todos os recursos Pro", "Múltiplos usuários", "API de integração", "Domínio próprio", "Analytics avançado", "Suporte 24h"]')
on conflict (slug) do nothing;
