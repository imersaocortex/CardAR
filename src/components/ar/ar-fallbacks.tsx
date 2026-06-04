"use client"

import { Camera, AlertTriangle, RefreshCw, Monitor, Smartphone, FileWarning } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

interface FallbackProps {
  onRetry?: () => void
}

export function CameraPermissionDenied({ onRetry }: FallbackProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center max-w-xs"
    >
      <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
        <Camera className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Câmera Bloqueada</h2>
      <p className="text-sm text-white/60 mb-8">
        O acesso à câmera foi negado. Para usar esta experiência AR, permita o acesso à câmera nas configurações do navegador.
      </p>
      <Button variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Tentar Novamente
      </Button>
    </motion.div>
  )
}

export function NoCamera({ onRetry }: FallbackProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center max-w-xs"
    >
      <div className="w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
        <Smartphone className="h-10 w-10 text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Câmera não Encontrada</h2>
      <p className="text-sm text-white/60 mb-8">
        Este dispositivo não possui câmera ou ela não está acessível. Esta experiência requer um dispositivo com câmera.
      </p>
      <p className="text-xs text-white/30">
        Tente usar um smartphone ou tablet com câmera frontal/traseira.
      </p>
    </motion.div>
  )
}

export function WebGLUnavailable() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center max-w-xs"
    >
      <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-6">
        <Monitor className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">WebGL Indisponível</h2>
      <p className="text-sm text-white/60 mb-8">
        Seu navegador não suporta WebGL, que é necessário para renderizar gráficos 3D. Tente usar um navegador mais recente (Chrome, Safari, Firefox).
      </p>
    </motion.div>
  )
}

export function MarkerNotFound({ onRetry }: FallbackProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center max-w-xs"
    >
      <div className="w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4 border-2 border-amber-400">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Marcador não Encontrado</h2>
      <p className="text-sm text-white/60 mb-6">
        Aponte a câmera para a imagem marcadora. Centralize-a no quadro para iniciar a experiência.
      </p>
      <Button variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Escanear Novamente
      </Button>
    </motion.div>
  )
}

export function AssetLoadError({ name }: { name?: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
      <FileWarning className="h-5 w-5 text-destructive shrink-0" />
      <div className="text-left">
        <p className="text-sm font-medium text-white">Asset não carregado</p>
        <p className="text-xs text-white/50">
          {name ? `"${name}" não pôde ser carregado` : "Não foi possível carregar o recurso 3D"}
        </p>
      </div>
    </div>
  )
}
