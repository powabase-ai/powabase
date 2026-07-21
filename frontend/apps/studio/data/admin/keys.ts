export const adminKeys = {
  all: ["admin"] as const,
  whoami: () => [...adminKeys.all, "whoami"] as const,
  stats: () => [...adminKeys.all, "stats"] as const,
  activity: (limit: number) => [...adminKeys.all, "activity", limit] as const,
  usersList: (q: string, limit: number, offset: number, sort: string) =>
    [...adminKeys.all, "users", "list", { q, limit, offset, sort }] as const,
  user: (id: string) => [...adminKeys.all, "users", id] as const,
  orgsList: (q: string, limit: number, offset: number, sort: string) =>
    [...adminKeys.all, "orgs", "list", { q, limit, offset, sort }] as const,
  org: (slug: string) => [...adminKeys.all, "orgs", slug] as const,
  project: (ref: string) => [...adminKeys.all, "projects", ref] as const,
  projectActivity: (ref: string, action: string, limit: number, offset: number) =>
    [...adminKeys.all, "projects", ref, "activity", { action, limit, offset }] as const,
  farmFlagged: (state: string) => [...adminKeys.all, "farm", "flagged", state] as const,
}
