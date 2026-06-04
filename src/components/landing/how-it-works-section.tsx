"use client"

import { motion } from "framer-motion"
import { Upload, Edit, Smartphone, Share2 } from "lucide-react"

const steps = [
  { icon: Upload, title: "Upload do Marcador", description: "Envie a imagem do seu cartão, panfleto ou post. Nosso sistema processa automaticamente." },
  { icon: Edit, title: "Monte a Experiência", description: "Adicione modelos 3D, vídeos, botões interativos. Posicione, escale e anime." },
  { icon: Smartphone, title: "Preview no Celular", description: "Escaneie o QR Code com seu celular e veja a experiência AR em tempo real." },
  { icon: Share2, title: "Publique e Compartilhe", description: "Compartilhe o link ou QR Code. Clientes apontam a câmera e pronto." },
]

export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="relative py-24 px-4 bg-muted/30">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Como{" "}
            <span className="text-gradient">funciona</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Em apenas 4 passos você transforma materiais impressos em experiências interativas.
          </p>
        </motion.div>

        <div className="relative">
          <div className="hidden lg:block absolute top-1/2 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-primary/20 via-primary to-secondary/20 -translate-y-1/2" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="relative flex flex-col items-center text-center"
                >
                  <div className="relative mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
                      <Icon className="h-7 w-7 text-white" />
                    </div>
                    <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">{step.description}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
