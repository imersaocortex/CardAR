"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CreditCard, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface GatewaySelectorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (gateway: "asaas" | "stripe") => void
  loading?: boolean
}

const GATEWAYS = [
  {
    id: "asaas" as const,
    name: "ASAAS",
    description: "PIX, Boleto ou Cartão de Crédito",
    detail: "Pagamentos nacionais com suporte a PIX e boleto bancário.",
    features: ["PIX (aprovado na hora)", "Boleto bancário", "Cartão de crédito (até 12x)"],
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
    border: "border-violet-500/30",
    icon: "bg-violet-500/10",
    iconColor: "text-violet-400",
  },
  {
    id: "stripe" as const,
    name: "Stripe",
    description: "Cartão de Crédito Internacional",
    detail: "Pagamentos internacionais com suporte a múltiplas moedas.",
    features: ["Cartão de crédito (Visa, Mastercard, Amex)", "Link de pagamento seguro", "Suporte internacional"],
    gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
    border: "border-blue-500/30",
    icon: "bg-blue-500/10",
    iconColor: "text-blue-400",
  },
]

export function GatewaySelector({ open, onOpenChange, onSelect, loading }: GatewaySelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Escolha a forma de pagamento</DialogTitle>
          <DialogDescription>
            Selecione a plataforma de pagamento que deseja utilizar para esta assinatura.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {GATEWAYS.map((gateway, i) => (
            <motion.div
              key={gateway.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => onSelect(gateway.id)}
                className={cn(
                  "w-full h-auto p-5 flex flex-col items-start gap-3 rounded-xl border-2 transition-all",
                  "hover:shadow-md",
                  gateway.border,
                )}
              >
                <div className="flex items-center gap-3 w-full">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", gateway.icon)}>
                    <CreditCard className={cn("h-5 w-5", gateway.iconColor)} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-base">{gateway.name}</p>
                    <p className="text-sm text-muted-foreground">{gateway.description}</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>

                <div className="flex flex-wrap gap-2">
                  {gateway.features.map((feature) => (
                    <span
                      key={feature}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </Button>
            </motion.div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
