"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Check, ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

interface Plan {
  id: string
  name: string
  slug: string
  price: number
  projects_limit: number
  assets_limit_label: string
  features: string[]
  billing_cycle: string
  trial_days: number
  highlight?: boolean
}

export function PlansSection() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [isAnnual, setIsAnnual] = useState(false)
  const [hasYearlyPlans, setHasYearlyPlans] = useState(false)
  const [billingEnabled, setBillingEnabled] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const plansRequest = supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("price")
    const availabilityRequest = fetch("/api/billing/settings").then((response) => response.ok ? response.json() : null).catch(() => null)
    Promise.all([plansRequest, availabilityRequest]).then(([{ data }, availability]) => {
        if (data) {
          const normalized = data.map((p) => ({
            ...p,
            billing_cycle: p.billing_cycle || "monthly",
            highlight: p.highlight === true,
          }))
          setPlans(normalized)
          setHasYearlyPlans(normalized.some((p: Plan) => p.billing_cycle === "yearly"))
        }
        setBillingEnabled(!!(availability?.paypal?.configured || availability?.efi?.configured))
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [])

  if (loading) return null

  const filteredPlans = plans.filter((p) => {
    if (!hasYearlyPlans) return true
    return isAnnual ? p.billing_cycle === "yearly" : p.billing_cycle === "monthly"
  })

  return (
    <section id="planos" className="relative py-24 px-4 bg-muted/30">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Planos{" "}
            <span className="text-gradient">simples</span> e{" "}
            <span className="text-gradient-cyan">transparentes</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            {billingEnabled ? "Escolha o plano ideal para seu negócio. Cancele quando quiser." : "Conheça os planos. Novas assinaturas estarão disponíveis em breve."}
          </p>

          {hasYearlyPlans && (
            <div className="inline-flex items-center gap-3 bg-muted rounded-full p-1">
              <button
                onClick={() => setIsAnnual(false)}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition-all",
                  !isAnnual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Mensal
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={cn(
                  "px-5 py-2 rounded-full text-sm font-medium transition-all",
                  isAnnual ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Anual{" "}
                <span className="text-emerald-400 text-xs ml-1">-20%</span>
              </button>
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {filteredPlans.map((plan, i) => {
            const isHighlighted = plan.highlight === true
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "relative glass rounded-2xl p-8 border transition-all duration-300",
                  isHighlighted
                    ? "border-primary/40 shadow-xl shadow-primary/10 scale-105"
                    : "border-border hover:border-primary/20"
                )}
              >
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-primary to-secondary text-white text-xs font-medium">
                      <Sparkles className="h-3 w-3" />
                      Mais Popular
                    </span>
                  </div>
                )}

                {billingEnabled && plan.trial_days > 0 && (
                  <div className="mb-4">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">
                      <Sparkles className="h-3 w-3" />
                      {plan.trial_days} dias grátis
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className="text-3xl font-bold">
                    {Number(plan.price) === 0
                      ? "Grátis"
                      : `R$ ${Number(plan.price).toFixed(2).replace('.', ',')}`
                    }
                    {Number(plan.price) > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">
                        {plan.billing_cycle === "yearly" ? "/ano" : "/mês"}
                      </span>
                    )}
                  </p>
                </div>

                <div className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>

                {billingEnabled || Number(plan.price) === 0 ? <Button variant={isHighlighted ? "gradient" : "outline"} className="w-full" asChild><Link href="/login">{Number(plan.price) === 0 ? "Começar grátis" : "Assinar agora"}<ArrowRight className="h-4 w-4" /></Link></Button> : <Button className="w-full" variant="outline" disabled>Assinaturas em breve</Button>}
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
