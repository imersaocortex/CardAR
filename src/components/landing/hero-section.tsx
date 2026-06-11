"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { ArrowRight, Sparkles, Play, Smartphone, Zap, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles: { x: number; y: number; vx: number; vy: number; size: number }[] = []
    const count = 60
    const connectionDist = 120

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
      })
    }

    const cnv = canvas
    let animId: number
    function animate() {
      const c = ctx as CanvasRenderingContext2D
      c.clearRect(0, 0, cnv.width, cnv.height)

      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = cnv.width
        if (p.x > cnv.width) p.x = 0
        if (p.y < 0) p.y = cnv.height
        if (p.y > cnv.height) p.y = 0
      })

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < connectionDist) {
            c.beginPath()
            c.moveTo(particles[i].x, particles[i].y)
            c.lineTo(particles[j].x, particles[j].y)
            c.strokeStyle = `rgba(139, 92, 246, ${(1 - dist / connectionDist) * 0.15})`
            c.lineWidth = 0.5
            c.stroke()
          }
        }
      }

      particles.forEach((p) => {
        c.beginPath()
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        c.fillStyle = "rgba(139, 92, 246, 0.4)"
        c.fill()
      })

      animId = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-0" />
}

function FloatingOrbs() {
  return (
    <>
      <motion.div
        className="absolute top-20 left-[10%] w-72 h-72 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)",
        }}
        animate={{
          y: [0, -30, 0],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-40 right-[10%] w-96 h-96 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.2) 0%, transparent 70%)",
        }}
        animate={{
          y: [0, 40, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-10"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 60%)",
        }}
        animate={{
          scale: [1, 1.2, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  )
}

function FloatingShapes() {
  const shapes = [
    { icon: <Smartphone className="h-5 w-5" />, x: "15%", y: "25%", delay: 0, color: "from-violet-500/20 to-fuchsia-500/10" },
    { icon: <Zap className="h-4 w-4" />, x: "85%", y: "35%", delay: 1, color: "from-cyan-500/20 to-blue-500/10" },
    { icon: <Shield className="h-5 w-5" />, x: "10%", y: "70%", delay: 2, color: "from-emerald-500/20 to-teal-500/10" },
  ]

  return (
    <>
      {shapes.map((s, i) => (
        <motion.div
          key={i}
          className="absolute hidden lg:flex items-center justify-center w-16 h-16 rounded-2xl border border-border/40 backdrop-blur-xl bg-background/30"
          style={{ left: s.x, top: s.y }}
          animate={{
            y: [0, -20, 0],
            rotate: [0, 5, -5, 0],
          }}
          transition={{ duration: 6, delay: s.delay, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className={`rounded-xl p-2 bg-gradient-to-br ${s.color}`}>
            {s.icon}
          </div>
        </motion.div>
      ))}
    </>
  )
}

export function HeroSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  })

  const imageY = useTransform(scrollYProgress, [0, 1], [0, 150])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const textY = useTransform(scrollYProgress, [0, 1], [0, 80])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setMousePos({ x, y })
  }

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center overflow-hidden bg-grid"
    >
      <ParticleNetwork />
      <FloatingOrbs />
      <FloatingShapes />

      <motion.div style={{ opacity }} className="relative z-10 w-full pt-28 pb-16 px-4">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left - Text Content */}
            <motion.div style={{ y: textY }} className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="mb-6 inline-flex"
              >
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-sm text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  Plataforma AR Completa
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]"
              >
                Crie Experiências{" "}
                <span className="text-gradient">AR</span>
                <br />
                Sem Escrever{" "}
                <span className="text-gradient-cyan">Uma Linha de Código</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2 }}
                className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed"
              >
                Uma plataforma completa para criar, publicar e compartilhar experiências de Realidade Aumentada em minutos.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center lg:justify-start gap-4"
              >
                <Button variant="gradient" size="xl" asChild className="group relative overflow-hidden">
                  <Link href="/login">
                    <span className="relative z-10 flex items-center gap-2">
                      Começar Grátis
                      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                </Button>
                <Button variant="outline" size="xl" asChild>
                  <Link href="#como-funciona">
                    <Play className="h-5 w-5" />
                    Ver Como Funciona
                  </Link>
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4 }}
                className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-8"
              >
                {[
                  { value: "10K+", label: "Experiências" },
                  { value: "500+", label: "Empresas" },
                  { value: "98%", label: "Satisfação" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center lg:text-left">
                    <p className="text-2xl md:text-3xl font-bold text-gradient">{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right - 3D Image Mockup */}
            <motion.div
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              style={{ y: imageY }}
              className="relative"
            >
              <div
                ref={imageRef}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => { setIsHovering(false); setMousePos({ x: 0, y: 0 }) }}
                className="relative perspective-[1000px]"
              >
                {/* Glow behind image */}
                <div className="absolute -inset-10 bg-gradient-to-br from-primary/20 via-secondary/10 to-cyan-500/20 rounded-[40px] blur-3xl opacity-60 animate-pulse-slow" />

                {/* 3D Card */}
                <motion.div
                  className="relative rounded-2xl overflow-hidden border border-border/40 shadow-2xl"
                  animate={{
                    rotateX: isHovering ? mousePos.y * -20 : 0,
                    rotateY: isHovering ? mousePos.x * 20 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 150, damping: 20 }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* Phone Mockup */}
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-[#0a0a1a] to-[#1a0a2e] overflow-hidden flex items-center justify-center">
                    {/* Grid dots */}
                    <div
                      className="absolute inset-0 opacity-[0.04]"
                      style={{
                        backgroundImage: "radial-gradient(circle, #7c3aed 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                      }}
                    />

                    {/* Background glow */}
                    <div className="absolute w-3/4 h-3/4 rounded-full bg-primary/5 blur-[80px]" />
                    <div className="absolute top-10 left-10 w-40 h-40 rounded-full bg-cyan-500/5 blur-[60px]" />
                    <div className="absolute bottom-10 right-10 w-48 h-48 rounded-full bg-primary/5 blur-[60px]" />

                    {/* Phone frame */}
                    <div
                      className="relative z-10 flex flex-col items-center"
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      <motion.div
                        className="w-[170px] rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-cyan-500/[0.06] p-[6px]"
                        animate={{
                          y: isHovering ? mousePos.y * -8 : 0,
                          x: isHovering ? mousePos.x * 8 : 0,
                        }}
                        style={{ transformStyle: "preserve-3d", transform: "translateZ(40px)" }}
                      >
                        {/* Screen */}
                        <div className="rounded-[22px] bg-[#0a0a1a] overflow-hidden">
                          {/* Status bar */}
                          <div className="h-7 bg-primary/[0.06] flex items-center justify-center relative">
                            {/* Camera notch */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-[3px] rounded-b bg-[#1a1a2e]" />
                          </div>

                          {/* AR Content */}
                          <div className="px-4 py-8 flex flex-col items-center gap-3">
                            {/* Target circles */}
                            <div className="relative w-24 h-24 flex items-center justify-center">
                              <div className="absolute inset-0 rounded-full border border-cyan-500/20" />
                              <div className="absolute inset-2 rounded-full border border-primary/20" />
                              <div className="absolute inset-4 rounded-full bg-primary/10" />
                              {/* 3D diamond shape */}
                              <svg width="28" height="28" viewBox="0 0 28 28" className="relative">
                                <polygon points="14,4 24,14 14,24 4,14" fill="rgba(6,182,212,0.3)" stroke="rgba(6,182,212,0.5)" strokeWidth="1" />
                                <polygon points="14,8 20,14 14,20 8,14" fill="rgba(124,58,237,0.2)" stroke="rgba(124,58,237,0.4)" strokeWidth="0.5" />
                              </svg>
                            </div>

                            {/* Bottom dots */}
                            <div className="flex gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                              <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60" />
                              <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                            </div>
                          </div>

                          {/* Home indicator */}
                          <div className="flex justify-center pb-2">
                            <div className="w-10 h-[3px] rounded-full bg-white/15" />
                          </div>
                        </div>
                      </motion.div>

                      {/* Floating badge: AR Experience */}
                      <motion.div
                        className="absolute -right-16 top-6 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-md border border-primary/30 text-[10px] font-medium"
                        animate={{
                          y: isHovering ? mousePos.y * -6 : 0,
                          x: isHovering ? mousePos.x * 6 : 0,
                        }}
                        style={{ transformStyle: "preserve-3d", transform: "translateZ(60px)" }}
                      >
                        <Smartphone className="h-3 w-3 text-primary" />
                        AR Experience
                      </motion.div>

                      {/* Floating badge: Ao Vivo */}
                      <motion.div
                        className="absolute -right-12 bottom-20 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur-md border border-cyan-500/20 text-[10px] font-medium"
                        animate={{
                          y: isHovering ? mousePos.y * -4 : 0,
                          x: isHovering ? mousePos.x * 4 : 0,
                        }}
                        style={{ transformStyle: "preserve-3d", transform: "translateZ(50px)" }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Ao Vivo
                      </motion.div>

                      {/* Floating stats card */}
                      <motion.div
                        className="absolute -left-20 bottom-32 flex items-center gap-2 px-3 py-2 rounded-xl bg-background/80 backdrop-blur-md border border-border/30"
                        animate={{
                          y: isHovering ? mousePos.y * -5 : 0,
                          x: isHovering ? mousePos.x * 5 : 0,
                        }}
                        style={{ transformStyle: "preserve-3d", transform: "translateZ(45px)" }}
                      >
                        <div className="flex -space-x-1.5">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="w-5 h-5 rounded-full border-2 border-background bg-gradient-to-br from-primary to-secondary"
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          <strong className="text-foreground">+500</strong> empresas
                        </span>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>

                {/* Bottom reflection/glare */}
                <div
                  className="absolute bottom-0 left-[10%] right-[10%] h-20 bg-gradient-to-r from-transparent via-primary/5 to-transparent blur-xl rounded-full"
                  style={{ transform: "translateY(50%)" }}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="w-5 h-8 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-1">
          <motion.div
            className="w-1 h-2 rounded-full bg-muted-foreground/50"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    </section>
  )
}
