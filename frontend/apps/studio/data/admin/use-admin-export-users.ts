import { useState } from "react"
import { getAccessToken } from "common"

import { API_URL } from "@/lib/ai-api"
import { extractErrorMessage } from "./http"

/**
 * Downloads the full users CSV from `GET /platform/admin/users/export`.
 * The endpoint needs a Bearer token, so we can't use a plain anchor href —
 * fetch with auth, then trigger a blob download.
 */
export function useAdminExportUsers() {
  const [isExporting, setIsExporting] = useState(false)

  const exportUsers = async () => {
    setIsExporting(true)
    try {
      const token = await getAccessToken()
      const res = await fetch(`${API_URL}/platform/admin/users/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await extractErrorMessage(res, "users export failed"))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "powabase-users.csv"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  return { exportUsers, isExporting }
}
