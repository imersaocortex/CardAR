"use client"

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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <ResourcesSection />
      <HowItWorksSection />
      <ExamplesSection />
      <PlansSection />
      <ComparisonSection />
      <FaqSection />
      <CtaSection />
      <FooterSection />
    </div>
  )
}
