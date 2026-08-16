import { PersonalAreaAuthGate } from "@/components/personal-area-auth-gate"
import { PersonalAreaShell } from "@/components/personal-area-shell"

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonalAreaShell>
      <PersonalAreaAuthGate>{children}</PersonalAreaAuthGate>
    </PersonalAreaShell>
  )
}
