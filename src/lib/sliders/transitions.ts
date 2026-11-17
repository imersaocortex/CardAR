export const sliderTransitions = ["none", "fade", "slide", "zoom"] as const
export type SliderTransition = (typeof sliderTransitions)[number]
export type AnimatedSliderTransition = Exclude<SliderTransition, "none">

export const sliderTransitionLabels = {
  none: "Sem animação",
  fade: "Dissolver",
  slide: "Deslizar",
  zoom: "Zoom suave",
} satisfies Record<SliderTransition, string>

export const sliderTransitionDuration = 350
// With x control points at 1/3 and 2/3, the DOM easing matches the canvas cubic.
export const sliderTransitionEasing = "cubic-bezier(0.333333, 1, 0.666667, 1)"
export const sliderEaseOut = (time: number) => 1 - (1 - time) ** 3

export function sliderMotion(effect: AnimatedSliderTransition, direction: number, progress: number, incoming: boolean) {
  if (effect === "slide") {
    return { offset: direction * (incoming ? 1 - progress : -progress), scale: 1, opacity: 1 }
  }
  return {
    offset: 0,
    scale: incoming && effect === "zoom" ? 0.88 + 0.12 * progress : 1,
    opacity: incoming ? progress : 1,
  }
}

export function activeSliderTransition(effect: SliderTransition | undefined): AnimatedSliderTransition | null {
  if (!effect || effect === "none" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null
  return effect
}
