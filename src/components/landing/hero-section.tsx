"use client"

import { useRef } from "react"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"
import { ArrowDown, ArrowUpRight, Box, ScanLine, Layers3, MoveUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export function HeroSection() {
  const section = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] })
  const y = useTransform(scrollYProgress, [0, 1], [0, 100])
  const rotate = useTransform(scrollYProgress, [0, 1], [-8, 4])
  return <section ref={section} className="relative isolate overflow-hidden px-5 pt-32 pb-20 sm:px-8 lg:pt-44 lg:pb-28">
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_25%,rgba(124,58,237,0.22),transparent_50%)]" />
    <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1.05fr_1fr]">
      <motion.div initial={reduced ? false : { opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }}>
        <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.22em] text-cyan-200"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" />Do digital para o seu mundo</div>
        <h1 className="max-w-3xl text-5xl font-medium leading-[1.04] tracking-[-0.06em] sm:text-7xl xl:text-[88px]">O mundo é<br />seu próximo<br /><span className="bg-gradient-to-r from-violet-300 via-cyan-200 to-white bg-clip-text text-transparent">canvas.</span></h1>
        <p className="mt-7 max-w-md text-base leading-relaxed text-slate-400 sm:text-lg">Transforme ideias em experiências de realidade aumentada. Crie no editor visual, publique e leve sua marca para além da tela.</p>
        <div className="mt-9 flex flex-wrap items-center gap-4"><Button size="xl" asChild className="rounded-full bg-white text-slate-950 hover:bg-cyan-100"><Link href="/login">Criar uma experiência <ArrowUpRight className="ml-2 h-5 w-5" /></Link></Button><Link href="#como-funciona" className="flex items-center gap-2 rounded-full px-3 py-3 text-sm text-slate-300 hover:text-white">Explore a plataforma <ArrowDown className="h-4 w-4" /></Link></div>
        <div className="mt-12 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-xs text-slate-400"><span>Editor visual</span><span>Compartilhamento por link</span><span>Experiências no navegador</span></div>
      </motion.div>
      <motion.div style={reduced ? undefined : { y, rotateZ: rotate }} className="relative mx-auto w-full max-w-[520px]" aria-label="Ilustração de uma cena de realidade aumentada">
        <div className="absolute -inset-8 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="relative aspect-[1/1.08] overflow-hidden rounded-[32px] border border-white/15 bg-gradient-to-br from-slate-900 via-[#17132b] to-[#070b15] shadow-[0_30px_100px_#0009]">
          <div className="absolute inset-0 opacity-15 [background-image:linear-gradient(#94a3b8_1px,transparent_1px),linear-gradient(90deg,#94a3b8_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="absolute inset-x-6 top-6 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400"><span className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-cyan-300" />Spatial studio</span><span>Prévia conceitual</span></div>
          <div className="absolute inset-12 flex items-center justify-center [perspective:900px]">
            <motion.div animate={reduced ? undefined : { y: [0, -14, 0], rotateZ: [-7, 7, -7] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="relative h-48 w-48 rounded-[42px] border border-cyan-200/40 bg-gradient-to-br from-cyan-200/30 via-violet-400/25 to-violet-950 shadow-[inset_0_0_45px_#c4b5fd22,0_0_65px_#7c3aed55] sm:h-60 sm:w-60 [transform:rotateX(20deg)_rotateY(-28deg)]">
              <div className="absolute inset-5 flex items-center justify-center rounded-[30px] border border-white/20 bg-white/5"><Box className="h-24 w-24 text-cyan-100" strokeWidth={0.65} /></div>
              <div className="absolute -inset-10 rounded-full border border-cyan-300/20 [transform:rotateX(65deg)]" />
            </motion.div>
          </div>
          <div className="absolute inset-x-6 bottom-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"><div><p className="text-xs font-medium text-white">Sua próxima dimensão</p><p className="mt-1 text-[10px] text-slate-400">Ideia → Cena → Experiência</p></div><MoveUpRight className="h-5 w-5 text-cyan-200" /></div>
        </div>
        <div className="absolute -right-2 top-24 flex items-center gap-3 rounded-2xl border border-white/15 bg-slate-950/90 p-4 shadow-xl backdrop-blur-xl sm:-right-6"><Layers3 className="h-5 w-5 text-violet-300" /><div><p className="text-xs font-medium">Crie em camadas</p><p className="mt-1 text-[10px] text-slate-400">3D · Vídeo · Interação</p></div></div>
      </motion.div>
    </div>
    <div className="mx-auto mt-20 flex max-w-7xl items-center gap-5 text-[10px] uppercase tracking-[0.22em] text-slate-500"><span>Imagine. Posicione. Conecte.</span><div className="h-px flex-1 bg-white/10" /><ArrowDown className="h-4 w-4" /></div>
  </section>
}