import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

const file = (path) => readFile(new URL(path, import.meta.url), "utf8")
const id = (n) => `80000000-0000-4000-8000-${String(n).padStart(12, "0")}`

test("034 gates slider links by organization, publication, plan, expiration and tracking mode without breaking existing scenes", async () => {
  const db = new PGlite()
  try {
    const [org, otherOrg, user, plan, project, scene, imageId, sliderId, otherSlider, objectId] = Array.from({ length: 10 }, (_, n) => id(n + 1))
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''test.user_id'', true), '''')::uuid';
      create table organizations(id uuid primary key);
      create table profiles(id uuid, role text);
      create table plans(id uuid primary key, gps_enabled boolean);
      create table subscriptions(organization_id uuid, status text, plan_id uuid, current_period_end timestamptz, trial_ends_at timestamptz);
      create table projects(id uuid primary key, organization_id uuid references organizations on delete cascade, tracking_mode text);
      create table organization_members(organization_id uuid, user_id uuid, role text);
      create table scenes(id uuid primary key default gen_random_uuid(), project_id uuid references projects on delete cascade, name text, created_at timestamptz default now());
      create table scene_objects(id uuid primary key, scene_id uuid references scenes on delete cascade, type text, name text, position_x real, position_y real, position_z real,
        rotation_x real, rotation_y real, rotation_z real, scale_x real, scale_y real, scale_z real, opacity real, visible boolean,
        layer_order integer, animation_type text, action text, asset_url text, asset_thumbnail text, show_caption boolean,
        face_camera boolean not null default false, chroma_key_color text, chroma_key_tolerance real, chroma_key_smoothness real, duration real,
        click_effect text default 'none');
      insert into organizations values('${org}'),('${otherOrg}');
      insert into plans values('${plan}',true);
      insert into subscriptions values('${org}','active','${plan}',now()+interval '30 days',null);
      insert into projects values('${project}','${org}','marker');
      insert into organization_members values('${org}','${user}','owner');
      insert into scenes(id,project_id,name) values('${scene}','${project}','Existing');
      insert into scene_objects(id,scene_id,type,name,action,click_effect) values('${imageId}','${scene}','imagem','Banner','https://example.test','particles');
    `)
    const migration = await file("../supabase/migrations/034_ar_sliders.sql")
    await db.exec(migration)
    await db.exec(migration)
    const { rows } = await db.query(await file("../supabase/verify_034.sql"))
    assert.ok(Object.values(rows[0]).every(Boolean))
    assert.equal((await db.query("select sliders_enabled from plans")).rows[0].sliders_enabled, false)
    assert.deepEqual((await db.query("select action,click_effect,slider_id from scene_objects")).rows[0], {
      action: "https://example.test", click_effect: "particles", slider_id: null,
    })
    await db.exec(`
      insert into sliders(id,organization_id,slug,draft,published) values
        ('${sliderId}','${org}','local','{}','{}'),('${otherSlider}','${otherOrg}','foreign','{}','{}');
      select set_config('test.user_id','${user}',false);
    `)
    const image = { id: imageId, type: "imagem", name: "Banner", action: "https://example.test", click_effect: "particles" }
    const slider = { id: objectId, type: "slider", name: "Slider", slider_id: sliderId }
    const save = (objects) => db.query("select save_studio_scene($1,$2,$3)", [project, scene, JSON.stringify(objects)])
    await assert.rejects(save([image, slider]), /plano/)
    await db.exec("update plans set sliders_enabled = true")
    await assert.rejects(save([image, { ...slider, slider_id: otherSlider }]), /organização/)
    await assert.rejects(db.query("insert into scene_objects(id,scene_id,type,name,slider_id) values($1,$2,'slider','Teste',$3)", [objectId, scene, otherSlider]), /organização/)
    await db.exec("update subscriptions set current_period_end = now() - interval '1 day'")
    await assert.rejects(save([image, slider]), /plano/)
    await db.exec("update subscriptions set current_period_end = now() + interval '1 day'; update projects set tracking_mode = 'surface'")
    await assert.rejects(save([image, slider]), /marcador ou GPS/)
    await db.exec("update projects set tracking_mode = 'gps'; update plans set gps_enabled = false")
    await assert.rejects(save([image, slider]), /plano/)
    await db.exec("update plans set gps_enabled = true; update sliders set published = null")
    await assert.rejects(save([image, slider]), /publicado/)
    await db.exec("update sliders set published = '{}'")
    await save([image, slider])
    assert.equal((await db.query("select slider_id from scene_objects where type='slider'")).rows[0].slider_id, sliderId)
    await db.exec("update plans set sliders_enabled = false")
    await save([{ ...image, name: "Banner atualizado" }, slider])
    assert.equal((await db.query("select name from scene_objects where id=$1", [imageId])).rows[0].name, "Banner atualizado")
    await db.exec("set role authenticated")
    await assert.rejects(db.query("select * from sliders"), /permission denied/)
    await db.exec("reset role")
    await db.query("delete from organizations where id=$1", [org])
    assert.equal((await db.query("select count(*)::int as count from scene_objects")).rows[0].count, 0)
    assert.equal((await db.query("select count(*)::int as count from sliders")).rows[0].count, 1)
  } finally {
    await db.close()
  }
})
