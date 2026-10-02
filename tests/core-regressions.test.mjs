import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import ts from "typescript"

const require = createRequire(import.meta.url)
function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const loaded = { exports: {} }
  new Function("require", "module", "exports", outputText)((name) => name in mocks ? mocks[name] : require(name), loaded, loaded.exports)
  return loaded.exports
}
const { geoOffset, gpsDisplayPosition, bearingDifference } = load("src/lib/ar/geo.ts")
const { yawTowardViewer } = load("src/lib/ar/billboard.ts")
const { playSpatialVideoMuted, enableSpatialAudio, muteSpatialAudio } = load("src/lib/ar/spatial-media.ts")
const { getActionUrl } = load("src/lib/ar/actions.ts")
const { selectPrimaryScene } = load("src/lib/scenes.ts")
const { createProjectSchema } = load("src/lib/schemas/index.ts")

test("new projects default to marker tracking and accept markerless modes", () => {
  const base = { name: "Experiência", type: "business_card" }
  assert.equal(createProjectSchema.parse(base).tracking_mode, "marker")
  assert.equal(createProjectSchema.parse({ ...base, tracking_mode: "surface" }).tracking_mode, "surface")
  assert.equal(createProjectSchema.safeParse({ ...base, tracking_mode: "gps" }).success, false)
  assert.equal(createProjectSchema.parse({ ...base, tracking_mode: "gps", latitude: 0, longitude: 0 }).activation_radius, 100)
  assert.equal(createProjectSchema.safeParse({ ...base, tracking_mode: "gps", latitude: 91, longitude: 0 }).success, false)
})

test("GPS preserves geographic directions and meters", () => {
  const north = geoOffset(0, 0, 0.001, 0)
  assert.ok(Math.abs(north.distance - 111.195) < 0.01)
  assert.equal(north.bearing, 0)
  assert.ok(north.north > 0 && north.east === 0)
  const east = geoOffset(0, 0, 0, 0.001)
  assert.equal(east.bearing, 90)
  assert.ok(east.east > 111)
  assert.equal(geoOffset(-23.5, -46.6, -23.5, -46.6).distance, 0)
})
test("GPS handles the antimeridian without a world-spanning jump", () => {
  const point = geoOffset(0, 179.999, 0, -179.999)
  assert.ok(point.distance > 222 && point.distance < 223)
  assert.ok(point.east > 0)
})

test("GPS keeps the model readable at any geographic distance and on arrival", () => {
  const far = gpsDisplayPosition({ distance: 200, bearing: 90 }, 12)
  assert.equal(far.atTarget, false)
  assert.ok(Math.abs(far.east - 6) < 0.0001)
  assert.ok(Math.abs(far.north) < 0.0001)
  assert.equal(gpsDisplayPosition({ distance: 4, bearing: 0 }, 15).atTarget, true)
  assert.equal(bearingDifference(10, 350), 20)
  assert.equal(bearingDifference(350, 10), -20)
})
test("spatial objects turn their front toward the viewer on the horizontal plane", () => {
  assert.equal(yawTowardViewer(0, -6, 0, 0), 0)
  assert.equal(yawTowardViewer(6, 0, 0, 0), -Math.PI / 2)
  assert.equal(yawTowardViewer(-6, 0, 0, 0), Math.PI / 2)
  assert.equal(yawTowardViewer(0, 0, 0, 0), null)
})
test("spatial video starts muted and enables sound only on explicit playback", async () => {
  const video = { tagName: "VIDEO", muted: true, plays: 0, play() { this.plays++; return Promise.resolve() }, pause() {} }
  const audio = { tagName: "AUDIO", muted: false, plays: 0, play() { this.plays++; return Promise.resolve() }, pause() { this.paused = true } }
  await playSpatialVideoMuted([video, audio])
  assert.equal(video.plays, 1)
  assert.equal(video.muted, true)
  assert.equal(audio.plays, 0)
  assert.equal(await enableSpatialAudio([video, audio]), true)
  assert.equal(video.muted, false)
  assert.equal(audio.plays, 1)
  muteSpatialAudio([video, audio])
  assert.equal(video.muted, true)
  assert.equal(audio.paused, true)
})
test("scene selection preserves public behavior and gives deterministic ties", () => {
  const scenes = [
    { id: "b", created_at: "2026-01-01", scene_objects: [{}] },
    { id: "a", created_at: "2026-01-01", scene_objects: [{}] },
    { id: "c", created_at: "2025-01-01", scene_objects: [] },
  ]
  assert.equal(selectPrimaryScene(scenes).id, "a")
  assert.equal(scenes[0].id, "b")
  assert.equal(selectPrimaryScene([]), null)
  assert.equal(selectPrimaryScene([...scenes, { id: "d", scene_objects: [{}, {}] }]).id, "d")
})
test("AR actions reject executable URLs and preserve supported contact actions", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "url:javascript:alert(1)", "//evil.test", "email:a@b.com?body=x"]) assert.equal(getActionUrl(value), null)
  assert.equal(getActionUrl("url:https://example.com"), "https://example.com/")
  assert.equal(getActionUrl("whatsapp:+55 (11) 99999-0000"), "https://wa.me/5511999990000")
  assert.equal(getActionUrl("tel:+55 (11) 2222-3333"), "tel:+551122223333")
})

const element = { id: "2fd30d57-8249-4436-88ae-bba0f3982473", type: "imagem", name: "Teste", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], opacity: 1, visible: true, faceCamera: true, duration: 0, chromaKeyTolerance: 0, chromaKeySmoothness: 0 }
function studio(rpc) {
  return load("src/store/index.ts", {
    "@/lib/supabase/client": { createClient: () => ({ rpc }) },
    "@/lib/mock-data": { mockElements: [], mockLayers: [] },
    "@/lib/scenes": { selectPrimaryScene },
  }).useStudioStore
}
test("failed persistence never marks an unsaved scene as saved", async () => {
  const store = studio(async () => ({ error: { message: "offline" }, data: null }))
  store.setState({ projectId: "project", elements: [element], isSaved: false })
  await assert.rejects(store.getState().saveScene(), /Não foi possível salvar/)
  assert.equal(store.getState().isSaved, false)
})
test("save retains IDs and zero-valued settings", async () => {
  let saved
  const store = studio(async (_name, payload) => { saved = payload; return { data: "scene", error: null } })
  store.setState({ projectId: "project", elements: [element], isSaved: false })
  await store.getState().saveScene()
  assert.equal(saved.p_objects[0].id, element.id)
  assert.equal(saved.p_objects[0].chroma_key_tolerance, 0)
  assert.equal(saved.p_objects[0].duration, 0)
  assert.equal(saved.p_objects[0].face_camera, true)
  assert.equal(store.getState().sceneId, "scene")
  assert.equal(store.getState().isSaved, true)
  store.getState().updateElement(element.id, { faceCamera: false })
  await store.getState().saveScene()
  assert.equal(saved.p_objects[0].face_camera, false)
})
test("edits made during an in-flight save remain unsaved", async () => {
  let finish
  const store = studio(() => new Promise((resolve) => { finish = resolve }))
  store.setState({ projectId: "project", elements: [element], isSaved: false })
  const saving = store.getState().saveScene()
  store.getState().updateElement(element.id, { name: "Changed while saving" })
  finish({ data: "scene", error: null })
  await saving
  assert.equal(store.getState().isSaved, false)
})
test("finishing a save cannot replace the newly opened project's scene", async () => {
  let finish
  const store = studio(() => new Promise((resolve) => { finish = resolve }))
  store.setState({ projectId: "first", elements: [element], isSaved: false })
  const saving = store.getState().saveScene()
  store.setState({ projectId: "second", sceneId: "second-scene", elements: [] })
  finish({ data: "first-scene", error: null })
  await saving
  assert.equal(store.getState().sceneId, "second-scene")
})
