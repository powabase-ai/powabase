import { screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { render } from "@/tests/helpers"
import type { AdminFarmOrgRow } from "@/data/admin/use-admin-farm-query"

const mockFarmQuery = vi.fn()
vi.mock("@/data/admin/use-admin-farm-query", () => ({
  useAdminFarmQuery: () => mockFarmQuery(),
}))

// `pages/admin/farm` default-exports withAuth(...), whose transitive imports
// touch `common` (Supabase GoTrue) and try to load a session in jsdom —
// surfacing an unhandled rejection. Spread the real module (so unrelated
// exports like `isFeatureEnabled` still resolve) and stub only the
// session-touching helpers.
vi.mock("common", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("common")
  return {
    ...original,
    getAccessToken: vi.fn(async () => "test-token"),
    useAuth: () => ({ isLoading: false, session: null }),
  }
})

// Imported AFTER the mock is registered so the component picks up the mocked hook.
import { FarmDefenseContent } from "@/pages/admin/farm"

const FLAGGED: AdminFarmOrgRow[] = [
  {
    id: "org-conv",
    slug: "evil-corp",
    email: "spam@evil.test",
    trust_state: "convicted",
    verdict: {
      tier: "convict",
      reasons: ["disposable_email", "burst_signup"],
      rationale: "Signed up via 10minutemail and burst-created 5 orgs.",
      action: "block",
      created_at: "2026-06-10T12:00:00Z",
    },
  },
  {
    id: "org-gated",
    slug: "maybe-bot",
    email: "watch@gray.test",
    trust_state: "gated",
    verdict: {
      tier: "watch",
      reasons: ["new_account"],
      rationale: null,
      action: "none",
      created_at: "2026-06-11T09:30:00Z",
    },
  },
]

function asQueryResult(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe("FarmDefenseContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the flagged-orgs list (slug / email / trust_state / tier)", () => {
    mockFarmQuery.mockReturnValue(asQueryResult({ data: FLAGGED }))
    render(<FarmDefenseContent />)

    // Scope to the "Flagged orgs" table so slug/tier cells shared with the
    // Audit/Log table below don't collide.
    const flagged = within(
      screen.getByRole("heading", { name: "Flagged orgs" }).closest("section")!,
    )
    // slugs
    expect(flagged.getByText("evil-corp")).toBeInTheDocument()
    expect(flagged.getByText("maybe-bot")).toBeInTheDocument()
    // emails
    expect(flagged.getByText("spam@evil.test")).toBeInTheDocument()
    expect(flagged.getByText("watch@gray.test")).toBeInTheDocument()
    // trust_state
    expect(flagged.getByText("convicted")).toBeInTheDocument()
    expect(flagged.getByText("gated")).toBeInTheDocument()
    // tier (from latest verdict)
    expect(flagged.getByText("convict")).toBeInTheDocument()
    expect(flagged.getByText("watch")).toBeInTheDocument()
  })

  it("renders the audit/log rows (action / reasons / rationale)", () => {
    mockFarmQuery.mockReturnValue(asQueryResult({ data: FLAGGED }))
    render(<FarmDefenseContent />)

    // Scope to the "Audit / Log" table.
    const audit = within(
      screen.getByRole("heading", { name: "Audit / Log" }).closest("section")!,
    )
    // verdict action
    expect(audit.getByText("block")).toBeInTheDocument()
    // reasons rendered as a joined text cell
    expect(audit.getByText(/disposable_email/)).toBeInTheDocument()
    expect(audit.getByText(/burst_signup/)).toBeInTheDocument()
    // rationale
    expect(
      audit.getByText("Signed up via 10minutemail and burst-created 5 orgs.")
    ).toBeInTheDocument()
  })

  it("shows an empty state when no orgs are flagged", () => {
    mockFarmQuery.mockReturnValue(asQueryResult({ data: [] }))
    render(<FarmDefenseContent />)

    expect(screen.getByText(/no flagged orgs/i)).toBeInTheDocument()
  })

  it("renders an error panel when the query fails", () => {
    mockFarmQuery.mockReturnValue(
      asQueryResult({ data: undefined, error: new Error("boom") })
    )
    render(<FarmDefenseContent />)

    expect(screen.getByText(/failed to load flagged orgs/i)).toBeInTheDocument()
  })
})
