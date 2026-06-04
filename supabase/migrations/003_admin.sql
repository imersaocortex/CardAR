-- 003_admin.sql
-- System settings table (single row via check constraint)

create table if not exists public.system_settings (
  id integer primary key default 1 constraint system_settings_single_row check (id = 1),
  branding jsonb not null default '{
    "site_name": "AR Business Studio",
    "logo_url": null,
    "favicon_url": null,
    "primary_color": "#6366f1",
    "secondary_color": "#8b5cf6",
    "accent_color": "#06b6d4",
    "og_image_url": null,
    "footer_text": null
  }'::jsonb,
  asaas jsonb not null default '{
    "environment": "sandbox",
    "api_key_configured": false,
    "webhook_url": null,
    "webhook_secret_configured": false
  }'::jsonb,
  general jsonb not null default '{
    "allow_signups": true,
    "maintenance_mode": false,
    "maintenance_message": null,
    "default_plan_id": null,
    "trial_days": 7
  }'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by uuid references auth.users(id)
);

-- Insert default row
insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

-- RLS
alter table public.system_settings enable row level security;

-- Only service_role / admin can read
create policy "System settings read via admin"
  on public.system_settings for select
  using (auth.role() = 'service_role');

-- Only service_role can write
create policy "System settings write via admin"
  on public.system_settings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Trigger to auto-update updated_at
create trigger handle_system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.update_updated_at();

-- Add updated_by auto-set trigger
create or replace function public.handle_system_settings_update()
returns trigger as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_system_settings_update
  before update on public.system_settings
  for each row execute function public.handle_system_settings_update();
