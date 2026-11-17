import { notFound } from "next/navigation"
import { SliderCarousel } from "@/components/sliders/slider-carousel"
import { getPublicSlider } from "@/lib/sliders/server"

export const dynamic = "force-dynamic"
export const metadata = { title: "Slider | CortexAR", robots: { index: false, follow: false } }

export default async function PublicSliderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const content = await getPublicSlider(slug)
  if (!content) notFound()
  return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 py-8 text-white">
    <div className="w-full max-w-5xl space-y-4">
      <h1 className="text-center text-xl font-semibold">{content.name}</h1>
      <SliderCarousel content={content} />
    </div>
  </main>
}
