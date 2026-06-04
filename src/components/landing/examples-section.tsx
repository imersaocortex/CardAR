"use client"

import { motion } from "framer-motion"
import { CreditCard, FileText, Image } from "lucide-react"

const examples = [
  {
    icon: CreditCard,
    title: "Cartão de Visita",
    description: "Aponte a câmera para o cartão e veja o modelo 3D do produto, vídeo de apresentação e botões de contato.",
    gradient: "from-primary to-purple-600",
  },
  {
    icon: FileText,
    title: "Panfleto A4",
    description: "Panfletos ganham vida com vídeos explicativos, tours virtuais e links diretos para compra.",
    gradient: "from-secondary to-cyan-500",
  },
  {
    icon: Image,
    title: "Post 1x1",
    description: "Posts de redes sociais se transformam em experiências interativas com AR.",
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
            Três formatos otimizados para diferentes necessidades de marketing.
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
