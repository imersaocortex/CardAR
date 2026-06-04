"use client"

import { motion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function CtaSection() {
  return (
    <section className="relative py-24 px-4 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative z-10 mx-auto max-w-3xl text-center"
      >
        <div className="mb-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-sm text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            7 dias grátis · Sem compromisso
          </span>
        </div>

        <h2 className="text-3xl md:text-5xl font-bold mb-4">
          Pronto para transformar seus{" "}
          <span className="text-gradient">materiais</span>?
        </h2>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
          Crie sua primeira experiência AR em minutos. Não precisa de cartão de crédito.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button variant="gradient" size="xl" asChild>
            <Link href="/login">
              Começar Grátis Agora
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </motion.div>
    </section>
  )
}
