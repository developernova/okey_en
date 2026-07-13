import type { Metadata } from "next"

import { AdminApp } from "@/components/admin-app"

export const metadata: Metadata = {
  title: "Админка — Flow",
  description: "Управление курсами и эпизодами Flow",
}

export default function AdminPage() {
  return <AdminApp />
}
