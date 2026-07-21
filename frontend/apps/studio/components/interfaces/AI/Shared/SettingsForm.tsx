

import { useState, useEffect, useMemo, useRef } from "react"
import { useProjectSettingsQuery } from "@/data/settings/settings-query"
import { useUpdateSettingsMutation, useResetSettingMutation, useResetCategoryMutation } from "@/data/settings/settings-mutations"
import type { SettingDef } from "@/lib/ai-api"

interface SettingsFormProps {
  category: string
}

export function SettingsForm({ category }: SettingsFormProps) {
  const { data, isLoading, error } = useProjectSettingsQuery()
  const updateMutation = useUpdateSettingsMutation()
  const resetKeyMutation = useResetSettingMutation()
  const resetCategoryMutation = useResetCategoryMutation()

  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const categoryData = data?.categories?.[category]
  const settings = categoryData?.settings ?? []

  const mainSettings = useMemo(() => settings.filter((s) => !s.advanced), [settings])
  const advancedSettings = useMemo(() => settings.filter((s) => s.advanced), [settings])

  // Reset local overrides when data loads
  useEffect(() => {
    setOverrides({})
  }, [data])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const isDirty = Object.keys(overrides).length > 0

  // Warn on browser/tab close with unsaved changes
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])

  // Warn on in-app (client-side) navigation with unsaved changes.
  // Intercept link clicks at the capture phase so we can block Next.js
  // <Link> navigations before the router processes them.
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!isDirtyRef.current) return
      const target = e.target as Element | null
      if (!target?.closest) return
      const anchor = target.closest("a[href]")
      if (!anchor) return
      // Only intercept internal navigation links, not external or download links
      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("http") || href.startsWith("mailto:")) return
      const ok = window.confirm("You have unsaved changes. Leave without saving?")
      if (!ok) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [])

  const getCurrentValue = (setting: SettingDef): string => {
    if (overrides[setting.key] !== undefined) return overrides[setting.key]
    return String(setting.value ?? setting.default ?? "")
  }

  const isOverridden = (setting: SettingDef): boolean => {
    return String(setting.value) !== String(setting.default)
  }

  const handleChange = (key: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    if (!isDirty) return
    const toSave: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(overrides)) {
      const def = settings.find((s) => s.key === key)
      if (!def) continue
      if (def.type === "int") toSave[key] = parseInt(val, 10)
      else if (def.type === "float") toSave[key] = parseFloat(val)
      else if (def.type === "bool") toSave[key] = val === "true"
      else toSave[key] = val
    }
    updateMutation.mutate(toSave, {
      onSuccess: () => {
        setOverrides({})
        setToast({ type: "success", message: "Settings saved" })
      },
      onError: (err) => {
        setToast({ type: "error", message: err instanceof Error ? err.message : "Failed to save" })
      },
    })
  }

  const handleResetKey = (key: string) => {
    resetKeyMutation.mutate(key, {
      onSuccess: () => {
        setOverrides((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        setToast({ type: "success", message: "Setting reset to default" })
      },
    })
  }

  const handleResetCategory = () => {
    if (!confirm(`Reset all ${categoryData?.label ?? category} settings to defaults?`)) return
    resetCategoryMutation.mutate(category, {
      onSuccess: () => {
        setOverrides({})
        setToast({ type: "success", message: "All settings reset to defaults" })
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto always-show-scrollbar">
        <div className="max-w-2xl mx-auto py-8 px-6">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-surface-200 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 overflow-y-auto always-show-scrollbar">
        <div className="max-w-2xl mx-auto py-8 px-6">
          <p className="text-red-500">Failed to load settings: {(error as Error).message}</p>
        </div>
      </div>
    )
  }

  const renderField = (setting: SettingDef) => {
    const val = getCurrentValue(setting)
    const overridden = isOverridden(setting)

    return (
      <div key={setting.key} className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            {setting.label}
          </label>
          {overridden && !overrides[setting.key] && (
            <button
              onClick={() => handleResetKey(setting.key)}
              className="text-xs text-brand-600 hover:underline"
            >
              Reset
            </button>
          )}
        </div>
        {setting.description && (
          <p className="text-xs text-foreground-muted">{setting.description}</p>
        )}

        {setting.type === "bool" ? (
          <button
            onClick={() => handleChange(setting.key, val === "true" ? "false" : "true")}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              val === "true"
                ? "bg-brand-400"
                : "bg-surface-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                val === "true" ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        ) : setting.choices && setting.choices.length > 0 ? (
          <select
            value={val}
            onChange={(e) => handleChange(setting.key, e.target.value)}
            className="w-full px-3 py-2 text-sm bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            {setting.choices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : setting.type === "int" || setting.type === "float" ? (
          <input
            type="number"
            value={val}
            onChange={(e) => handleChange(setting.key, e.target.value)}
            min={setting.min}
            max={setting.max}
            step={setting.type === "float" ? "0.1" : "1"}
            placeholder={String(setting.default)}
            className="w-full px-3 py-2 text-sm bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        ) : (
          <input
            type="text"
            value={val}
            onChange={(e) => handleChange(setting.key, e.target.value)}
            placeholder={String(setting.default)}
            className="w-full px-3 py-2 text-sm bg-surface-200 border border-default rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-md text-sm text-white shadow-lg transition-opacity ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Scrollable settings content */}
      <div className="flex-1 overflow-y-auto always-show-scrollbar">
        <div className="max-w-2xl mx-auto py-8 px-6 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {categoryData?.label ?? category}
            </h2>
            <button
              onClick={handleResetCategory}
              className="text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              Reset all to defaults
            </button>
          </div>

          {/* Main settings */}
          <section className="space-y-5">
            {mainSettings.map(renderField)}
          </section>

          {/* Advanced settings */}
          {advancedSettings.length > 0 && (
            <section className="space-y-5">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
              >
                <svg
                  className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Advanced ({advancedSettings.length})
              </button>
              {showAdvanced && (
                <div className="space-y-5 pl-2 border-l-2 border-default">
                  {advancedSettings.map(renderField)}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Save button — pinned outside scroll area */}
      {isDirty && (
        <div className="shrink-0 border-t border-default bg-default">
          <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-6 py-2 text-sm bg-brand-400 text-white rounded-md hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
            <span className="text-xs text-foreground-muted">Unsaved changes</span>
          </div>
        </div>
      )}
    </div>
  )
}
