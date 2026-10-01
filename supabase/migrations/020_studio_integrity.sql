-- Apply before deploying the new editor. No existing scene data is removed.
begin;

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
  -- Serialize saves, including creation of the first scene.
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
      asset_thumbnail, show_caption, chroma_key_color, chroma_key_tolerance, chroma_key_smoothness, duration
    ) values (
      v_object.id, v_scene, v_object.type, v_object.name, v_object.position_x, v_object.position_y, v_object.position_z,
      v_object.rotation_x, v_object.rotation_y, v_object.rotation_z, v_object.scale_x, v_object.scale_y, v_object.scale_z,
      v_object.opacity, v_object.visible, v_object.layer_order, v_object.animation_type, v_object.action, v_object.asset_url,
      v_object.asset_thumbnail, v_object.show_caption, v_object.chroma_key_color, v_object.chroma_key_tolerance,
      v_object.chroma_key_smoothness, v_object.duration
    ) on conflict(id) do update set
      type = excluded.type, name = excluded.name,
      position_x = excluded.position_x, position_y = excluded.position_y, position_z = excluded.position_z,
      rotation_x = excluded.rotation_x, rotation_y = excluded.rotation_y, rotation_z = excluded.rotation_z,
      scale_x = excluded.scale_x, scale_y = excluded.scale_y, scale_z = excluded.scale_z,
      opacity = excluded.opacity, visible = excluded.visible, layer_order = excluded.layer_order,
      animation_type = excluded.animation_type, action = excluded.action, asset_url = excluded.asset_url,
      asset_thumbnail = excluded.asset_thumbnail, show_caption = excluded.show_caption,
      chroma_key_color = excluded.chroma_key_color, chroma_key_tolerance = excluded.chroma_key_tolerance,
      chroma_key_smoothness = excluded.chroma_key_smoothness, duration = excluded.duration;
  end loop;
  delete from public.scene_objects where scene_id = v_scene and not (id = any(v_ids));
  return v_scene;
end;
$$;
revoke all on function public.save_studio_scene(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_studio_scene(uuid, uuid, jsonb) to authenticated;

-- Protect platform roles even when a user may edit their own profile.
create or replace function public.protect_profile_role()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.role() = 'authenticated' and (to_jsonb(new)->'role') is distinct from (to_jsonb(old)->'role') then
    raise exception 'Platform roles can only be changed by the administration service';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles for each row execute function public.protect_profile_role();

-- An organization owner is not a platform administrator.
create or replace function public.is_admin_user()
returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and to_jsonb(p)->>'role' in ('admin', 'super_admin'));
$$;
commit;
