"use client"

import { motion } from "framer-motion"
import { X, Check } from "lucide-react"
import { cn } from "@/lib/utils"

const comparisons = [
  { feature: "Realidade Aumentada", traditional: false, arBusiness: true },
  { feature: "Sem programação", traditional: false, arBusiness: true },
  { feature: "Modelos 3D interativos", traditional: false, arBusiness: true },
  { feature: "Vídeos com chromakey", traditional: false, arBusiness: true },
  { feature: "Botões de contato", traditional: false, arBusiness: true },
  { feature: "QR Code automático", traditional: false, arBusiness: true },
  { feature: "Preview em tempo real", traditional: false, arBusiness: true },
  { feature: "Analytics de visualizações", traditional: false, arBusiness: true },
  { feature: "Material impresso tradicional", traditional: true, arBusiness: false },
]

export function ComparisonSection() {
  return (
    <section className="relative py-24 px-4">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Material impresso vs{" "}
            <span className="text-gradient">AR Business</span>
          </h2>
          <p className="text-muted-foreground">
            Veja a diferença entre um material tradicional e um material com realidade aumentada.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass rounded-2xl overflow-hidden border border-border"
        >
          <div className="grid grid-cols-3 border-b border-border">
            <div className="p-4 font-semibold text-sm">Recurso</div>
            <div className="p-4 font-semibold text-sm text-center text-muted-foreground">Tradicional</div>
            <div className="p-4 font-semibold text-sm text-center text-gradient">AR Business</div>
          </div>
          {comparisons.map((item, i) => (
            <div
              key={item.feature}
              className={cn(
                "grid grid-cols-3 border-b border-border/50 last:border-0",
                i % 2 === 0 ? "bg-muted/20" : ""
              )}
            >
              <div className="p-4 text-sm">{item.feature}</div>
              <div className="p-4 flex items-center justify-center">
                {item.traditional ? (
                  <Check className="h-5 w-5 text-emerald-400" />
                ) : (
                  <X className="h-5 w-5 text-destructive" />
                )}
              </div>
              <div className="p-4 flex items-center justify-center">
                {item.arBusiness ? (
                  <Check className="h-5 w-5 text-emerald-400" />
                ) : (
                  <X className="h-5 w-5 text-destructive" />
                )}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
