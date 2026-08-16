import type { ReactNode } from "react"

export function PersonalAreaShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh min-w-0 bg-background text-foreground">
      {children}
    </main>
  )
}
