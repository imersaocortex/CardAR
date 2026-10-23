import { ImageResponse } from "next/og"

export const alt = "CortexAR: experiências de realidade aumentada"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#080c1a", color: "#f8fafc", padding: 72,
      flexDirection: "column", justifyContent: "space-between", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: "#8be9f4" }}>CORTEXAR · WEBAR</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", fontSize: 74, fontWeight: 700, lineHeight: 1.05 }}>Realidade aumentada<br />para novas experiências</div>
        <div style={{ display: "flex", fontSize: 30, color: "#cbd5e1" }}>Marcadores · GPS · Superfícies · Vídeo e streaming</div>
      </div>
      <div style={{ display: "flex", width: "100%", height: 8, background: "linear-gradient(90deg, #8b5cf6, #22d3ee)" }} />
    </div>, size,
  )
}
