-- Apply manually before enabling interactive sliders. Existing scenes are unaffected.
begin;

alter table public.plans add column if not exists sliders_enabled boolean not null default false;

create table if not exists public.sliders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique,
  draft jsonb not null,
  published jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists sliders_org_idx on public.sliders(organization_id);
alter table public.sliders enable row level security;
revoke all on public.sliders from public, anon, authenticated;
grant select, insert, update, delete on public.sliders to service_role;

alter table public.scene_objects add column if not exists slider_id uuid;
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.scene_objects'::regclass
    and conname = 'scene_objects_slider_id_fkey' and not condeferrable) then
    alter table public.scene_objects drop constraint scene_objects_slider_id_fkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.scene_objects'::regclass
    and conname = 'scene_objects_slider_id_fkey') then
    -- Organization deletion cascades through both projects and sliders.
    alter table public.scene_objects add constraint scene_objects_slider_id_fkey
      foreign key (slider_id) references public.sliders(id) deferrable initially deferred;
  end if;
end $$;

-- Validate direct writes and atomic studio saves. Existing bindings may be saved unchanged
-- when a plan is downgraded or the slider is withdrawn; public delivery still checks access.
create or replace function public.validate_scene_slider()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_mode text;
begin
  if new.type <> 'slider' and new.slider_id is null then return new; end if;
  if new.type <> 'slider' or new.slider_id is null then
    raise exception 'Selecione um slider válido para este elemento.';
  end if;
  if tg_op = 'UPDATE' then
    if old.type = new.type and old.scene_id = new.scene_id and old.slider_id = new.slider_id then
      return new;
    end if;
  end if;
  select p.organization_id, p.tracking_mode::text into v_org, v_mode
  from public.scenes s join public.projects p on p.id = s.project_id where s.id = new.scene_id;

  if v_mode is null or v_mode not in ('marker', 'gps') or not exists (
    select 1 from public.sliders s where s.id = new.slider_id and s.organization_id = v_org and s.published is not null
  ) then raise exception 'Vincule um slider publicado da sua organização em um projeto de marcador ou GPS.'; end if;

  if not exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.organization_id = v_org and m.role = 'owner' and p.role = 'super_admin'
  ) and not exists (
    select 1 from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.organization_id = v_org and p.sliders_enabled
      and ((s.status = 'active' and (s.current_period_end is null or s.current_period_end > now()))
        or (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now())))
      and (v_mode <> 'gps' or p.gps_enabled)
  ) then raise exception 'O plano não permite vincular sliders neste projeto.'; end if;
  return new;
end $$;
revoke all on function public.validate_scene_slider() from public, anon, authenticated;

drop trigger if exists validate_scene_slider on public.scene_objects;
create trigger validate_scene_slider after insert or update of slider_id, type, scene_id on public.scene_objects
for each row execute function public.validate_scene_slider();

create or replace function public.save_studio_scene(p_project_id uuid, p_scene_id uuid, p_objects jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_scene uuid;
  v_item jsonb;
  v_object public.scene_objects;
  v_ids uuid[] := '{}';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.projects p join public.organization_members m on m.organization_id = p.organization_id
    where p.id = p_project_id and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
  ) then raise exception 'Permission denied'; end if;
  perform 1 from public.projects where id = p_project_id for update;
  if jsonb_typeof(p_objects) is distinct from 'array' then raise exception 'Invalid objects'; end if;
  if jsonb_array_length(p_objects) > 500 then raise exception 'Too many objects'; end if;
  if p_scene_id is null then
    select id into v_scene from public.scenes where project_id = p_project_id order by created_at, id limit 1;
    if v_scene is null then
      insert into public.scenes(project_id, name) values (p_project_id, 'Cena Principal') returning id into v_scene;
    end if;
  else
    select id into v_scene from public.scenes where id = p_scene_id and project_id = p_project_id;
    if v_scene is null then raise exception 'Scene not found'; end if;
  end if;
  for v_item in select value from jsonb_array_elements(p_objects) loop
    v_object := jsonb_populate_record(null::public.scene_objects, v_item);
    if v_object.id is null or v_object.id = any(v_ids) then raise exception 'Invalid or duplicate object ID'; end if;
    if exists(select 1 from public.scene_objects where id = v_object.id and scene_id <> v_scene) then
      raise exception 'Object belongs to another scene';
    end if;
    v_ids := array_append(v_ids, v_object.id);
    insert into public.scene_objects (
      id, scene_id, type, name, position_x, position_y, position_z, rotation_x, rotation_y, rotation_z,
      scale_x, scale_y, scale_z, opacity, visible, layer_order, animation_type, action, asset_url,
      asset_thumbnail, show_caption, face_camera, click_effect, chroma_key_color, chroma_key_tolerance, chroma_key_smoothness, duration, slider_id
    ) values (
      v_object.id, v_scene, v_object.type, v_object.name, v_object.position_x, v_object.position_y, v_object.position_z,
      v_object.rotation_x, v_object.rotation_y, v_object.rotation_z, v_object.scale_x, v_object.scale_y, v_object.scale_z,
      v_object.opacity, v_object.visible, v_object.layer_order, v_object.animation_type, v_object.action, v_object.asset_url,
      v_object.asset_thumbnail, v_object.show_caption, coalesce(v_object.face_camera, false), coalesce(v_object.click_effect, 'none'), v_object.chroma_key_color, v_object.chroma_key_tolerance,
      v_object.chroma_key_smoothness, v_object.duration, v_object.slider_id
    ) on conflict(id) do update set
      type = excluded.type, name = excluded.name,
      position_x = excluded.position_x, position_y = excluded.position_y, position_z = excluded.position_z,
      rotation_x = excluded.rotation_x, rotation_y = excluded.rotation_y, rotation_z = excluded.rotation_z,
      scale_x = excluded.scale_x, scale_y = excluded.scale_y, scale_z = excluded.scale_z,
      opacity = excluded.opacity, visible = excluded.visible, layer_order = excluded.layer_order,
      animation_type = excluded.animation_type, action = excluded.action, asset_url = excluded.asset_url,
      asset_thumbnail = excluded.asset_thumbnail, show_caption = excluded.show_caption, face_camera = excluded.face_camera, click_effect = excluded.click_effect,
      chroma_key_color = excluded.chroma_key_color, chroma_key_tolerance = excluded.chroma_key_tolerance,
      chroma_key_smoothness = excluded.chroma_key_smoothness, duration = excluded.duration, slider_id = excluded.slider_id;
  end loop;
  delete from public.scene_objects where scene_id = v_scene and not (id = any(v_ids));
  return v_scene;
end;
$$;
revoke all on function public.save_studio_scene(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_studio_scene(uuid, uuid, jsonb) to authenticated;

commit;
