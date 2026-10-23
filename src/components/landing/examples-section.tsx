"use client"

import { motion } from "framer-motion"
import { CreditCard, MapPin, ScanFace } from "lucide-react"

const examples = [
  {
    icon: CreditCard,
    title: "Cartão de Visita",
    description: "Use o cartão como marcador para apresentar modelos 3D, vídeos e botões de contato no navegador.",
    gradient: "from-primary to-purple-600",
  },
  {
    icon: MapPin,
    title: "Ponto de interesse GPS",
    description: "Associe uma experiência a coordenadas e mostre objetos na direção do local configurado.",
    gradient: "from-secondary to-cyan-500",
  },
  {
    icon: ScanFace,
    title: "Produto em uma superfície",
    description: "Apresente uma cena sobre chão ou mesa em dispositivos com WebXR AR compatível.",
    gradient: "from-emerald-500 to-teal-500",
  },
]

export function ExamplesSection() {
  return (
    <section className="relative py-24 px-4">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Formatos que{" "}
            <span className="text-gradient">funcionam</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Exemplos de uso para marcadores, localização e superfícies.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {examples.map((item, i) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="group glass rounded-2xl overflow-hidden border border-border hover:border-primary/30 transition-all duration-500"
              >
                <div className={`h-48 bg-gradient-to-br ${item.gradient} flex items-center justify-center relative overflow-hidden`}>
                  <div className="absolute inset-0 bg-black/20" />
                  <Icon className="h-16 w-16 text-white/80 relative z-10 group-hover:scale-110 transition-transform duration-500" />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
