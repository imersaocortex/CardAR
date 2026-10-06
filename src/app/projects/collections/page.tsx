"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

type Mode = "marker" | "gps"
type Project = { id: string; name: string; tracking_mode: Mode | "surface"; status: string }
type Collection = { id: string; name: string; slug: string; tracking_mode: Mode; project_ids: string[] }

export default function CollectionsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [enabled, setEnabled] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [mode, setMode] = useState<Mode>("marker")
  const [selected, setSelected] = useState<string[]>([])

  const fetchData = useCallback(async () => {
    const [projectsResponse, collectionsResponse] = await Promise.all([fetch("/api/projects"), fetch("/api/collections")])
    if (!projectsResponse.ok || !collectionsResponse.ok) throw new Error("Não foi possível carregar os projetos")
    const [projectData, collectionData] = await Promise.all([projectsResponse.json(), collectionsResponse.json()])
    return { projectData, collectionData }
  }, [])
  const applyData = useCallback(({ projectData, collectionData }: { projectData: Project[]; collectionData: { collections: Collection[]; enabled: boolean; canEdit: boolean } }) => {
    setProjects(projectData)
    setCollections(collectionData.collections)
    setEnabled(collectionData.enabled)
    setCanEdit(collectionData.canEdit)
    setLoading(false)
  }, [])
  const reload = useCallback(async () => {
    try {
      applyData(await fetchData())
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao carregar", variant: "destructive" })
    } finally { setLoading(false) }
  }, [fetchData, applyData])
  useEffect(() => {
    let alive = true
    fetchData().then((value) => { if (alive) applyData(value) })
      .catch((error) => { if (alive) { toast({ title: error instanceof Error ? error.message : "Erro ao carregar", variant: "destructive" }); setLoading(false) } })
    return () => { alive = false }
  }, [fetchData, applyData])

  const choices = useMemo(() => projects.filter((project) => project.status === "published" && project.tracking_mode === mode), [projects, mode])
  const reset = () => { setEditing(null); setName(""); setMode("marker"); setSelected([]) }
  const edit = (collection: Collection) => {
    setEditing(collection.id); setName(collection.name); setMode(collection.tracking_mode); setSelected(collection.project_ids)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const save = async () => {
    if (!name.trim() || selected.length < 2) {
      toast({ title: "Dê um nome e selecione pelo menos dois projetos", variant: "destructive" }); return
    }
    setSaving(true)
    try {
      const response = await fetch(editing ? `/api/collections/${editing}` : "/api/collections", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), tracking_mode: mode, project_ids: selected }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar")
      toast({ title: editing ? "Experiência atualizada" : "Experiência criada" })
      reset(); await reload()
    } catch (error) { toast({ title: error instanceof Error ? error.message : "Erro", variant: "destructive" }) }
    finally { setSaving(false) }
  }
  const remove = async (collection: Collection) => {
    if (!window.confirm(`Excluir a URL de “${collection.name}”? Os projetos individuais serão mantidos.`)) return
    const response = await fetch(`/api/collections/${collection.id}`, { method: "DELETE" })
    if (!response.ok) { toast({ title: "Não foi possível excluir", variant: "destructive" }); return }
    if (editing === collection.id) reset()
    await reload()
  }
  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/experience/multi/${slug}`)
    toast({ title: "Link copiado" })
  }

  return <AppShell><main className="mx-auto max-w-5xl space-y-8 p-5 md:p-8">
    <div><Link href="/projects" className="text-sm text-primary hover:underline">← Projetos</Link>
      <h1 className="mt-3 text-3xl font-bold">Experiências com vários projetos</h1>
      <p className="mt-2 text-sm text-muted-foreground">Agrupe projetos prontos da mesma tecnologia em uma única URL. Marcadores diferentes podem aparecer juntos; cada projeto GPS mantém suas coordenadas.</p>
    </div>
    {!loading && !enabled && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Seu plano ainda não habilita experiências com vários projetos. A administração pode ativar esse recurso nas configurações do plano.</div>}
    {!loading && enabled && canEdit && <section className="space-y-5 rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{editing ? "Editar experiência" : "Nova experiência"}</h2>
      <div className="space-y-2"><Label htmlFor="collection-name">Nome da experiência</Label><Input id="collection-name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Coleção de cartões" /></div>
      <div className="space-y-2"><Label htmlFor="collection-mode">Tecnologia</Label><select id="collection-mode" value={mode} onChange={(event) => { setMode(event.target.value as Mode); setSelected([]) }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="marker">Vários marcadores</option><option value="gps">Vários pontos GPS</option></select></div>
      <div className="space-y-2"><Label>Projetos publicados ({selected.length} selecionados)</Label>
        <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border p-3">{choices.length === 0 ? <p className="text-sm text-muted-foreground">Publique pelo menos dois projetos deste tipo para criar a experiência.</p> : choices.map((project) => <label key={project.id} className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-muted/50"><input type="checkbox" checked={selected.includes(project.id)} onChange={() => toggle(project.id)} /><span className="text-sm">{project.name}</span></label>)}</div>
        <p className="text-xs text-muted-foreground">Máximo de {mode === "marker" ? "10 marcadores" : "20 pontos GPS"}. Projetos de tecnologias diferentes não podem ser combinados.</p>
      </div>
      <div className="flex gap-2"><Button onClick={save} disabled={saving || selected.length < 2 || selected.length > (mode === "marker" ? 10 : 20)}>{saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar link"}</Button>{editing && <Button variant="outline" onClick={reset}>Cancelar</Button>}</div>
    </section>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Links criados</h2>
      {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : collections.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma experiência criada ainda.</p> : collections.map((collection) => <div key={collection.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div><p className="font-medium">{collection.name}</p><p className="text-xs text-muted-foreground">{collection.tracking_mode === "marker" ? "Marcadores" : "GPS"} · {collection.project_ids.length} projetos</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => copy(collection.slug)}>Copiar link</Button><Button variant="outline" size="sm" asChild><a href={`/experience/multi/${collection.slug}`} target="_blank" rel="noreferrer">Abrir</a></Button>{canEdit && <><Button variant="outline" size="sm" onClick={() => edit(collection)} disabled={!enabled}>Editar</Button><Button variant="destructive" size="sm" onClick={() => remove(collection)}>Excluir</Button></>}</div></div>)}
    </section>
  </main></AppShell>
}
