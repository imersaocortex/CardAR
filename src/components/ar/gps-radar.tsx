"use client"

import { useState } from "react"
import { Radar } from "lucide-react"
import { gpsRadarPosition, type GpsPoint } from "@/lib/ar/gps-collection"

export function GpsRadar({ points, heading, fresh, failedIds = [] }: { points: GpsPoint[]; heading: number | null; fresh: boolean; failedIds?: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...points].sort((a, b) => a.distance - b.distance)
  const nearby = points.filter((point) => point.inRange).length
  // The edge also shows more distant destinations. Their direction is retained;
  // filled luminous dots identify those already inside their activation radius.
  const range = Math.max(50, ...points.filter((point) => point.inRange).map((point) => point.radius))
  const valid = fresh && heading !== null
  return <aside className="absolute bottom-44 right-3 z-20 w-28 text-white sm:w-32" aria-label="Radar dos projetos GPS">
    <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-label={`${expanded ? "Recolher" : "Ver"} pontos do radar: ${nearby} de ${points.length} no raio`} className="w-full rounded-2xl border border-cyan-200/25 bg-slate-950/75 p-2 shadow-xl backdrop-blur-md">
      <span className="flex items-center justify-between text-[9px] font-medium tracking-wide text-cyan-100"><span className="flex items-center gap-1"><Radar className="h-3 w-3" /> RADAR</span><span>{valid ? `${nearby}/${points.length}` : "…"}</span></span>
      <svg viewBox="0 0 100 100" className="mt-1 w-full" role="img" aria-label={valid ? `${nearby} projetos no raio. Frente do celular no topo.` : "Aguardando posição e bússola"}>
        <circle cx="50" cy="50" r="43" fill="#06232f" fillOpacity="0.8" stroke="#22d3ee" strokeOpacity="0.45" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="#22d3ee" strokeOpacity="0.2" />
        <circle cx="50" cy="50" r="13" fill="none" stroke="#22d3ee" strokeOpacity="0.2" />
        <path d="M50 7V93M7 50H93" stroke="#22d3ee" strokeOpacity="0.15" />
        <path d="M50 50L27 13A43 43 0 0 1 73 13Z" fill="#22d3ee" fillOpacity="0.12" />
        {valid && points.map((point) => {
          const { x, y } = gpsRadarPosition(point, heading!, range)
          const failed = failedIds.includes(point.id)
          return <g key={point.id}><title>{point.name}: {Math.round(point.distance)} m{failed ? " · mídia indisponível" : point.inRange ? " · no raio" : " · fora do raio"}</title>
            {point.inRange && !failed && <circle cx={x} cy={y} r="5" fill="#67e8f9" fillOpacity="0.2" />}
            <circle cx={x} cy={y} r={point.inRange ? 2.5 : 2} fill={failed ? "#fbbf24" : point.inRange ? "#a5f3fc" : "#0f172a"} stroke={failed ? "#fbbf24" : "#67e8f9"} strokeWidth="1" />
          </g>
        })}
        <path d="M50 45L54 54L50 52L46 54Z" fill="white" />
        {valid && <text x="50" y="5" textAnchor="middle" fill="#a5f3fc" fontSize="6" transform={`rotate(${-heading!} 50 50)`}>N</text>}
      </svg>
      <span className="block text-[9px] text-cyan-100/75">{valid ? `Frente ↑ · ${range} m` : "Buscando sensores…"}</span>
    </button>
    {expanded && <div className="absolute bottom-full right-0 mb-2 max-h-52 w-[min(18rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-white/15 bg-slate-950/95 p-3 text-[11px] shadow-xl">
      <p className="mb-2 font-medium">Projetos próximos</p>
      {!fresh && <p className="mb-2 text-amber-200">Atualizando a localização…</p>}
      <ul className="space-y-2">{sorted.map((point) => <li key={point.id} className="flex justify-between gap-2"><span className="min-w-0 truncate">{point.name}{failedIds.includes(point.id) && <span className="block text-amber-200">Mídia indisponível</span>}</span><span className={point.inRange ? "shrink-0 text-cyan-200" : "shrink-0 text-white/55"}>{Math.round(point.distance)} m</span></li>)}</ul>
      <p className="mt-2 text-[10px] text-white/60">Pontos vazados estão fora do raio. A posição depende da precisão do GPS e da bússola.</p>
    </div>}
  </aside>
}
