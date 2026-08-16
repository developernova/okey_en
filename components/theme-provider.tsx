"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

type Theme = "light" | "dark"

type ThemeContextValue = {
  resolvedTheme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)
const themeListeners = new Set<() => void>()

function readClientTheme(): Theme {
  if (typeof window === "undefined") return "light"
  const saved = window.localStorage.getItem("catch-english:theme")
  if (saved === "light" || saved === "dark") return saved
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function subscribeToTheme(listener: () => void) {
  themeListeners.add(listener)
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const notify = () => listener()
  media.addEventListener("change", notify)
  window.addEventListener("storage", notify)
  return () => {
    themeListeners.delete(listener)
    media.removeEventListener("change", notify)
    window.removeEventListener("storage", notify)
  }
}

function updateTheme(theme: Theme) {
  window.localStorage.setItem("catch-english:theme", theme)
  themeListeners.forEach((listener) => listener())
}

function getServerTheme(): Theme {
  return "light"
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const adminTheme = pathname.startsWith("/admin")
  const preferredTheme = React.useSyncExternalStore(
    subscribeToTheme,
    readClientTheme,
    getServerTheme
  )
  const resolvedTheme: Theme = adminTheme ? "light" : preferredTheme

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const value = React.useMemo<ThemeContextValue>(
    () => ({ resolvedTheme, setTheme: updateTheme }),
    [resolvedTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      {!adminTheme && <ThemeHotkey />}
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  const value = React.useContext(ThemeContext)
  if (!value) throw new Error("useTheme must be used inside ThemeProvider")
  return value
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== "d" ||
        isTypingTarget(event.target)
      ) {
        return
      }
      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, useTheme }
