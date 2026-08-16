import type { Metadata } from "next"

import { AdminApp } from "@/components/admin-app"

export const metadata: Metadata = {
  title: "Админка — Catch English",
  description: "Управление курсами и эпизодами Catch English",
}

export default function AdminPage() {
  return <AdminApp />
}
