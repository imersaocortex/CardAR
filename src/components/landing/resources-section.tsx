"use client"

import { motion } from "framer-motion"
import { Scan, Video, Box, Smartphone, Palette, Share2 } from "lucide-react"

const resources = [
  { icon: Scan, title: "Marcador de Imagem", description: "Use qualquer imagem como marcador AR. Seu cartão de visita vira portal." },
  { icon: Box, title: "Modelos 3D", description: "Importe modelos GLB/GLTF e posicione na cena com precisão." },
  { icon: Video, title: "Vídeos MP4 e Chromakey", description: "Adicione vídeos com fundo removido automaticamente." },
  { icon: Palette, title: "Botões Interativos", description: "WhatsApp, site, Instagram, ligação e e-mail com um clique." },
  { icon: Smartphone, title: "Preview em Tempo Real", description: "Veja como fica no celular antes de publicar." },
  { icon: Share2, title: "QR Code Automático", description: "Gere QR Code para compartilhar a experiência AR." },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export function ResourcesSection() {
  return (
    <section id="recursos" className="relative py-24 px-4">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Tudo que você precisa em{" "}
            <span className="text-gradient">um só lugar</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Ferramentas completas para criar experiências AR imersivas sem escrever uma linha de código.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {resources.map((item) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.title}
                variants={itemVariants}
                className="group glass rounded-xl p-6 glass-hover transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
