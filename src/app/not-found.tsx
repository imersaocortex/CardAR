import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Página não encontrada | CortexAR",
  description: "O endereço solicitado não foi encontrado.",
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
    <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Erro 404</p>
    <h1 className="text-3xl font-semibold">Esta página não foi encontrada.</h1>
    <p className="max-w-md text-muted-foreground">Confira o endereço ou volte para conhecer as experiências de realidade aumentada da plataforma.</p>
    <Link href="/" className="rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground">Voltar à página inicial</Link>
  </main>
}
