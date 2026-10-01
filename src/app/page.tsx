"use client"
import { MotionConfig, motion, useReducedMotion, useScroll, useSpring } from "framer-motion"
import type { ReactNode } from "react"

import { Navbar } from "@/components/layout/navbar"
import { HeroSection } from "@/components/landing/hero-section"
import { ResourcesSection } from "@/components/landing/resources-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { ExamplesSection } from "@/components/landing/examples-section"
import { PlansSection } from "@/components/landing/plans-section"
import { ComparisonSection } from "@/components/landing/comparison-section"
import { FaqSection } from "@/components/landing/faq-section"
import { CtaSection } from "@/components/landing/cta-section"
import { FooterSection } from "@/components/landing/footer-section"
import { WhatsAppButton } from "@/components/landing/whatsapp-button"

export default function LandingPage() {
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 30 })
  return (
    <MotionConfig reducedMotion="user"><div className="landing-page min-h-screen overflow-x-clip bg-background">
      <motion.div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-violet-400 to-cyan-300" style={{ scaleX: progress }} />
      <Navbar />
      <main>
      <HeroSection />
      <Reveal><ResourcesSection /></Reveal>
      <Reveal><HowItWorksSection /></Reveal>
      <Reveal><ExamplesSection /></Reveal>
      <Reveal><PlansSection /></Reveal>
      <Reveal><ComparisonSection /></Reveal>
      <Reveal><FaqSection /></Reveal>
      <Reveal><CtaSection /></Reveal>
      </main>
      <FooterSection />
      <WhatsAppButton />
    </div></MotionConfig>
  )
}

function Reveal({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  return <motion.div initial={reduced ? false : { opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.08 }} transition={{ duration: 0.65 }}>{children}</motion.div>
}
