"use client"

import { useEffect, useState } from "react"
import Script from "next/script"

const storageKey = "cortexar-analytics-consent"
const preferencesEvent = "cortexar:analytics-preferences"

type Choice = "accepted" | "rejected"

function clearAnalyticsCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim()
    if (!name || !/^_ga(?:_|$)/.test(name)) continue

    document.cookie = `${name}=; Max-Age=0; Path=/`
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.cortexar.space`
  }
}

export function GoogleAnalyticsConsent() {
  const [choice, setChoice] = useState<Choice | null | undefined>(undefined)
  const [showPreferences, setShowPreferences] = useState(false)

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(storageKey)
    } catch {
      // Storage can be unavailable in restrictive browser modes.
    }
    setChoice(stored === "accepted" || stored === "rejected" ? stored : null)

    const openPreferences = () => setShowPreferences(true)
    window.addEventListener(preferencesEvent, openPreferences)
    return () => window.removeEventListener(preferencesEvent, openPreferences)
  }, [])

  function choose(next: Choice) {
    try {
      localStorage.setItem(storageKey, next)
    } catch {
      // The choice still applies to this page when storage is unavailable.
    }

    if (next === "rejected" && choice === "accepted") {
      const analyticsWindow = window as Window & { gtag?: (...args: unknown[]) => void }
      analyticsWindow.gtag?.("consent", "update", { analytics_storage: "denied" })
      clearAnalyticsCookies()
      window.location.reload()
      return
    }

    setChoice(next)
    setShowPreferences(false)
  }

  return (
    <>
      {choice === "accepted" && (
        <>
          <Script id="google-analytics-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-2MS3LF66CE');
          `}</Script>
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-2MS3LF66CE"
            strategy="afterInteractive"
          />
        </>
      )}

      {(choice === null || showPreferences) && (
        <section
          role="dialog"
          aria-label="Preferências de métricas"
          className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-xl rounded-2xl border border-border bg-background p-5 text-foreground shadow-2xl"
        >
          <p className="text-sm font-semibold">Métricas de navegação</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Podemos usar o Google Analytics para entender como a plataforma é visitada. A análise é opcional e só começa se você aceitar.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => choose("rejected")}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Recusar
            </button>
            <button
              type="button"
              onClick={() => choose("accepted")}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Aceitar métricas
            </button>
          </div>
        </section>
      )}
    </>
  )
}
