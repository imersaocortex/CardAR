import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"

test("033 preserves scenes, persists effects atomically and restricts values/access in isolated PostgreSQL", async () => {
  const db = new PGlite()
  const project = "00000000-0000-4000-8000-000000000001"
  const scene = "00000000-0000-4000-8000-000000000002"
  const object = "00000000-0000-4000-8000-000000000003"
  const user = "00000000-0000-4000-8000-000000000004"
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''test.user_id'', true), '''')::uuid';
      create table projects(id uuid primary key, organization_id uuid);
      create table organization_members(organization_id uuid, user_id uuid, role text);
      create table scenes(id uuid primary key default gen_random_uuid(), project_id uuid, name text, created_at timestamptz default now());
      create table scene_objects(id uuid primary key, scene_id uuid, type text, name text, position_x real, position_y real, position_z real,
        rotation_x real, rotation_y real, rotation_z real, scale_x real, scale_y real, scale_z real, opacity real, visible boolean,
        layer_order integer, animation_type text, action text, asset_url text, asset_thumbnail text, show_caption boolean,
        face_camera boolean not null default false, chroma_key_color text, chroma_key_tolerance real, chroma_key_smoothness real, duration real);
      insert into projects values('${project}','${project}');
      insert into organization_members values('${project}','${user}','owner');
      insert into scenes(id,project_id,name) values('${scene}','${project}','Existing');
      insert into scene_objects(id,scene_id,type,name,action,face_camera,scale_x) values('${object}','${scene}','imagem','Banner','https://example.com',true,2);
    `)
    const sql = await readFile(new URL("../supabase/migrations/033_object_click_effect.sql", import.meta.url), "utf8")
    await db.exec(sql)
    await db.exec(sql)
    for (const result of await db.exec(await readFile(new URL("../supabase/verify_033.sql", import.meta.url), "utf8"))) assert.equal(result.rows[0].ok, true)
    assert.deepEqual((await db.query("select action,face_camera,scale_x,click_effect from scene_objects")).rows[0], {
      action: "https://example.com", face_camera: true, scale_x: 2, click_effect: "none",
    })
    await assert.rejects(db.query("select save_studio_scene($1,$2,$3)", [project, scene, "[]"]), /Authentication required/)
    await db.query("select set_config('test.user_id',$1,false)", [user])
    const saved = { id: object, type: "imagem", name: "Updated", action: "https://example.com/coupon", click_effect: "particles", face_camera: true, scale_x: 2 }
    await db.query("select save_studio_scene($1,$2,$3)", [project, scene, JSON.stringify([saved])])
    assert.equal((await db.query("select click_effect from scene_objects")).rows[0].click_effect, "particles")
    await assert.rejects(db.query("select save_studio_scene($1,$2,$3)", [project, scene, JSON.stringify([{ ...saved, name: "Should roll back", click_effect: "invalid" }])]))
    assert.equal((await db.query("select name from scene_objects")).rows[0].name, "Updated")
    await db.query("select set_config('test.user_id','00000000-0000-4000-8000-000000000099',false)")
    await assert.rejects(db.query("select save_studio_scene($1,$2,$3)", [project, scene, "[]"]), /Permission denied/)
    await db.query("select set_config('test.user_id',$1,false)", [user])
    delete saved.click_effect // Older editor payload remains valid.
    await db.query("select save_studio_scene($1,$2,$3)", [project, scene, JSON.stringify([saved])])
    assert.equal((await db.query("select click_effect from scene_objects")).rows[0].click_effect, "none")
    await db.exec("set role anon")
    await assert.rejects(db.query("select save_studio_scene($1,$2,$3)", [project, scene, "[]"]), /permission denied/)
  } finally { await db.close() }
})
