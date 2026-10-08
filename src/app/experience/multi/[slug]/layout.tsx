import type { Metadata } from "next"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return { manifest: `/experience/multi/${encodeURIComponent(slug)}/manifest.webmanifest` }
}

export default function MultiExperienceLayout({ children }: { children: React.ReactNode }) {
  return children
}
