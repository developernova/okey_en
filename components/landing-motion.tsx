"use client"

import * as React from "react"

export function LandingMotion() {
  React.useEffect(() => {
    const root = document.documentElement
    const page = document.querySelector<HTMLElement>("[data-landing-root]")
    if (!page) return

    const elements = Array.from(
      page.querySelectorAll<HTMLElement>("[data-landing-reveal]")
    )
    root.classList.add("landing-page-active")

    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      elements.forEach((element) => element.classList.add("is-visible"))
      return () => root.classList.remove("landing-page-active")
    }

    root.classList.add("landing-motion-ready")
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add("is-visible")
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: "0px 0px -10%", threshold: 0.12 }
    )

    elements.forEach((element) => observer.observe(element))
    return () => {
      observer.disconnect()
      root.classList.remove("landing-motion-ready")
      root.classList.remove("landing-page-active")
    }
  }, [])

  return null
}
