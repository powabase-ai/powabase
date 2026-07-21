import { describe, expect, it } from "vitest"

import { isReturningUser } from "@/components/admin/returning"

describe("isReturningUser", () => {
  it("is true when last sign-in is >= 1 day after signup", () => {
    expect(
      isReturningUser("2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z")
    ).toBe(true)
    // Well beyond a day.
    expect(
      isReturningUser("2026-06-01T09:00:00Z", "2026-06-20T12:00:00Z")
    ).toBe(true)
  })

  it("is false when last sign-in is less than 1 day after signup", () => {
    // Same session — signed in right after signup.
    expect(
      isReturningUser("2026-06-01T00:00:00Z", "2026-06-01T00:05:00Z")
    ).toBe(false)
    // 23h59m — just under the threshold.
    expect(
      isReturningUser("2026-06-01T00:00:00Z", "2026-06-01T23:59:00Z")
    ).toBe(false)
  })

  it("is false when either timestamp is missing", () => {
    expect(isReturningUser(null, "2026-06-02T00:00:00Z")).toBe(false)
    expect(isReturningUser("2026-06-01T00:00:00Z", null)).toBe(false)
    expect(isReturningUser(null, null)).toBe(false)
    expect(isReturningUser(undefined, undefined)).toBe(false)
  })

  it("is false for unparseable timestamps", () => {
    expect(isReturningUser("not-a-date", "2026-06-02T00:00:00Z")).toBe(false)
  })

  it("is false when last sign-in predates signup (clock skew / never returned)", () => {
    expect(
      isReturningUser("2026-06-10T00:00:00Z", "2026-06-01T00:00:00Z")
    ).toBe(false)
  })
})
