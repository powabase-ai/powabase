/**
 * `org.is_test_mode` accessor with the same `as` cast pattern B1 uses
 * for `enabled_features` (`useIsBillingUiEnabled`). The CP's own
 * serializer adds `is_test_mode` to every org row (Task 1.4), but
 * `is_test_mode` is not in the upstream OpenAPI spec (`api-types`),
 * so a direct dotted access would not typecheck.
 */
export function useIsBillingTestMode(
  org: { slug?: string } | null | undefined
): boolean {
  return (
    ((org as { is_test_mode?: boolean } | null | undefined)?.is_test_mode) === true
  )
}
